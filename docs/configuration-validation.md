# Configuration Validation Guide

This document defines the requirements for environment configuration across all Stellar Insights components.

## 1. Backend (Rust)

| Variable | Description | Production Requirement |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Must hide credentials |
| `ENCRYPTION_KEY` | Key for field-level encryption | Must be 32+ chars |
| `JWT_SECRET` | Secret for signing session tokens | Must be 48+ chars |
| `APP_ENV` | deployment mode | `production` |
| `VAULT_ADDR` | HashiCorp Vault address | Must be HTTPS |
| `VAULT_TOKEN` | Vault access token | Must be a valid periodic token |

## 2. Frontend (Next.js)

| Variable | Description | Production Requirement |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Backend API base URL | Must be HTTPS, no localhost |
| `NEXT_PUBLIC_APP_ENV` | Deployment mode | `production` |
| `NEXT_PUBLIC_STELLAR_NETWORK` | Target network | `mainnet` |

## 3. Mobile (React Native)

| Variable | Description | Production Requirement |
|---|---|---|
| `API_BASE_URL` | Backend API base URL | Must be HTTPS, no localhost |
| `STELLAR_NETWORK` | Target network | `mainnet` |
| `APP_ENV` | Deployment mode | `production` |

## 4. Validation Mechanism

- **Fail-Fast**: All applications will throw a fatal error on startup if configuration validation fails.
- **Strict Types**: Configuration is parsed into read-only constants to prevent accidental modification at runtime.
- **Placeholder Detection**: Any value set to a documented placeholder (e.g., `CHANGE_ME`, `GXXX...`) will be rejected in `production` mode.
