# Backend Environment Setup & Secrets Management

This guide covers everything you need to bootstrap the Stellar Insights backend locally and
configure it safely for staging or production. Read it before running `cargo run` for the first time.

## Prerequisites

- Rust (stable) — install via [rustup](https://rustup.rs)
- Docker (optional) — easiest way to run Postgres and Redis locally
- `sqlx-cli` — for running migrations:
  ```bash
  cargo install sqlx-cli --no-default-features --features postgres,sqlite
  ```

---

## 1. Create your local `.env`

```bash
cd backend
cp .env.example .env
```

Never commit `.env`. It is already in `.gitignore`. Open it and fill in the values described below.

---

## 2. Required variables

These must be set before the backend will start. The server performs fail-fast config validation
on startup and will exit with a clear error message if any are missing or obviously invalid.

### Database

```dotenv
# SQLite (simplest for local dev — no Docker needed)
DATABASE_URL=sqlite:./stellar_insights.db

# PostgreSQL (closer to production)
DATABASE_URL=postgresql://postgres:password@localhost:5432/stellar_insights
```

Start a local Postgres instance with Docker:
```bash
docker run --name stellar-postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=stellar_insights \
  -p 5432:5432 -d postgres:14
```

Run migrations after setting `DATABASE_URL`:
```bash
cd backend
sqlx migrate run
```

### JWT secret

Used to sign and verify API session tokens. Must be at least 32 characters.

```dotenv
JWT_SECRET=<generate with: openssl rand -base64 48>
```

Never reuse the same value across environments.

### Encryption key

Used for AES-256-GCM encryption of sensitive stored data. Must be exactly 64 hex characters (32 bytes).

```dotenv
ENCRYPTION_KEY=<generate with: openssl rand -hex 32>
```

### SEP-10 server public key

Required for Stellar SEP-10 authentication. Must be a valid Stellar public key (56-character G-address).

```dotenv
SEP10_SERVER_PUBLIC_KEY=<your Stellar public key>
SEP10_HOME_DOMAIN=localhost
STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
```

Generate a new keypair with the Stellar CLI:
```bash
stellar keys generate my-sep10-key --network testnet
stellar keys address my-sep10-key
```

The backend validates the key format on startup and will reject the placeholder string.

### Stellar network

```dotenv
STELLAR_NETWORK=testnet
STELLAR_RPC_URL_TESTNET=https://soroban-testnet.stellar.org
STELLAR_HORIZON_URL_TESTNET=https://horizon-testnet.stellar.org
```

Switch `STELLAR_NETWORK=mainnet` for production and populate the `*_MAINNET` URLs.

### Redis

Required for caching and rate limiting.

```dotenv
REDIS_URL=redis://127.0.0.1:6379
```

Start a local Redis instance:
```bash
docker run --name stellar-redis -p 6379:6379 -d redis:7-alpine
```

---

## 3. Optional but useful variables

### Logging

```dotenv
RUST_LOG=info          # trace | debug | info | warn | error
LOG_FORMAT=json        # json (structured) or pretty (human-readable)
RUST_BACKTRACE=1       # full stack traces on panic
```

Use `LOG_FORMAT=pretty` locally for readable output. Set `LOG_FORMAT=json` in all deployed
environments so log aggregators (ELK, Datadog, etc.) can parse structured records.

### Mock RPC mode

Runs the backend without hitting real Stellar nodes. Useful for unit and integration testing.

```dotenv
RPC_MOCK_MODE=true
```

### Sentry error tracking

```dotenv
SENTRY_DSN=https://<key>@<org>.ingest.sentry.io/<project>
```

Leave unset in local dev. The backend skips Sentry initialization when `SENTRY_DSN` is absent.

### CORS

```dotenv
# Dev: allow local frontend
CORS_ALLOWED_ORIGINS=http://localhost:3000

# Production: lock down to your domain
CORS_ALLOWED_ORIGINS=https://stellar-insights.com,https://app.stellar-insights.com
```

Never set `CORS_ALLOWED_ORIGINS=*` in production.

### Background jobs

Individual jobs can be disabled if you only want to run part of the stack:

```dotenv
JOB_CORRIDOR_REFRESH_ENABLED=false
JOB_ANCHOR_REFRESH_ENABLED=false
JOB_PRICE_FEED_UPDATE_ENABLED=false
```

---

## 4. Starting the server

```bash
cd backend
cargo run
```

The server starts on `http://127.0.0.1:8080` by default. Override with:

```dotenv
SERVER_HOST=0.0.0.0
SERVER_PORT=8080
```

On first boot, watch for config validation errors in the log. They look like:

```
ERROR stellar_insights_backend: configuration error: JWT_SECRET must be at least 32 characters
```

Fix the flagged variable and restart.

---

## 5. Secrets management in production

Local `.env` files are not appropriate for deployed environments. Use one of these approaches:

### HashiCorp Vault (recommended)

The backend has native Vault integration. Set these instead of individual secret variables:

```dotenv
VAULT_ADDR=https://vault.example.com:8200
VAULT_TOKEN=s.your-app-token
VAULT_NAMESPACE=stellar-insights
```

When Vault credentials are present, the backend pulls `DATABASE_URL`, `JWT_SECRET`,
`ENCRYPTION_KEY`, and other secrets from Vault at startup. See
[`docs/SECRETS_MANAGEMENT.md`](./SECRETS_MANAGEMENT.md) for full Vault setup including
automatic rotation and Kubernetes integration.

### Environment variables via your platform

If Vault is not available, inject secrets as environment variables through your platform's
secret store (AWS SSM Parameter Store, GCP Secret Manager, Fly.io secrets, Railway variables, etc.)
and do not use `.env` files in deployed containers.

### What never belongs in version control

| What | Why |
|------|-----|
| `.env` files | Contains real secrets |
| `JWT_SECRET` values | Session forgery risk |
| `ENCRYPTION_KEY` values | Data decryption risk |
| Stellar secret keys (S-addresses) | Full account takeover |
| Database passwords | Direct DB access |
| API keys and tokens | Service impersonation |

The `.env.example` file in this repo contains only placeholder strings. All `CHANGE_ME_*`
values will be rejected by the startup validator — they exist solely as documentation.

---

## 6. Config validation behavior

The backend uses fail-fast config validation. On startup it checks:

- All required variables are present and non-empty
- `JWT_SECRET` length ≥ 32 characters
- `ENCRYPTION_KEY` is exactly 64 hex characters
- `SEP10_SERVER_PUBLIC_KEY` is a valid 56-character G-address
- `DATABASE_URL` is a recognized scheme (`sqlite:` or `postgresql://`)
- `CORS_ALLOWED_ORIGINS` contains no obviously unsafe wildcard in production mode

If any check fails the process exits immediately with a descriptive error. This prevents
a misconfigured instance from starting silently and producing hard-to-debug runtime failures.

---

## 7. Full variable reference

See [`backend/.env.example`](../backend/.env.example) for the complete annotated list of every
supported variable, including optional tuning knobs for the connection pool, rate limiter,
cache TTLs, and backup scheduler.
