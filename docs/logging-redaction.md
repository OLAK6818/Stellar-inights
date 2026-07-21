# Secure Logging & Redaction Protocols

This document describes the comprehensive secure logging and redaction implementation across the Stellar Insights platform, covering backend, frontend, and mobile applications.

## Overview

Our logging system provides:
- **Comprehensive redaction** of sensitive data (PII, Stellar keys, tokens, credentials)
- **Environment-aware logging** (development vs production behavior)
- **Structured logging** with metadata and context
- **Multi-platform consistency** across backend, frontend, and mobile
- **Automatic sensitive data detection** with regex patterns
- **Production-safe debugging** with opt-in verbose logging

## Architecture

### Backend (Rust)
- **Core module**: `backend/src/logging/`
- **Redaction**: `backend/src/logging/redaction.rs`
- **Middleware**: `backend/src/observability/logging.rs`
- **Framework**: tracing + tracing-subscriber with JSON output

### Frontend (TypeScript/Next.js)
- **Logger**: `frontend/src/lib/logger.ts`
- **Error tracking**: Sentry integration with automatic redaction
- **Environment**: Development console logging + production error tracking

### Mobile (React Native/TypeScript)
- **Service**: `mobile/src/services/logger.ts`
- **Crash reporting**: Firebase Crashlytics integration
- **Context**: Platform-aware logging with device metadata

## Redacted Data Types

### Automatically Detected and Redacted

| Data Type | Pattern | Redacted Format | Example |
|-----------|---------|-----------------|---------|
| **Stellar Accounts** | `G[A-Z0-9]{55}` | `G****[REDACTED]` | `GCKF...` → `G****[REDACTED]` |
| **Stellar Secrets** | `S[A-Z0-9]{55}` | `S****[REDACTED_SECRET]` | `SCKF...` → `S****[REDACTED_SECRET]` |
| **JWT Tokens** | `eyJ...` pattern | `[REDACTED_JWT]` | Full token → `[REDACTED_JWT]` |
| **API Keys** | 32+ char strings | `[REDACTED_KEY]` | `sk_live_123...` → `[REDACTED_KEY]` |
| **Email Addresses** | Standard email regex | `****@[REDACTED]` | `user@domain.com` → `****@[REDACTED]` |
| **Phone Numbers** | International format | `+XX****[REDACTED]` | `+1234567890` → `+12****[REDACTED]` |
| **Credit Cards** | 16-digit patterns | `****-****-****-[REDACTED]` | `1234-5678-9012-3456` → `****-****-****-[REDACTED]` |
| **SSNs** | XXX-XX-XXXX format | `***-**-[REDACTED]` | `123-45-6789` → `***-**-[REDACTED]` |
| **Mnemonic Phrases** | 12/24 word sequences | `[N_WORD_MNEMONIC_REDACTED]` | 12 words → `[12_WORD_MNEMONIC_REDACTED]` |

### Field-Based Redaction

Fields with these names (case-insensitive) are automatically redacted:
- `password`, `secret`, `token`, `key`, `private`, `seed`, `mnemonic`
- `credential`, `auth`, `signature`, `jwt`, `bearer`, `access_token`
- `refresh_token`, `client_secret`, `api_key`, `stellar_secret`
- `otp`, `pin` (mobile only)

## Usage Examples

### Backend (Rust)

```rust
use stellar_insights_backend::logging::{
    redact_account, redact_token, auto_redact_string, log_secure
};

// Manual redaction functions
tracing::info!("Processing payment for account: {}", 
    redact_account(&stellar_account));

// Automatic string redaction
let user_input = "My account is GCKFBEIYTKP5ROORWS2HE6XXVV6MQVE6YDJHB5P7C4GGQXJN6ZHGKF3R";
tracing::info!("User input: {}", auto_redact_string(user_input));

// Secure logging macro (recommended)
log_secure!(info, "API call completed",
    account = redact_account(&account),
    response_time = response_time_ms,
    user_id = redact_user_id(&user_id)
);

// JSON field redaction
let json_response = r#"{"account":"GCKF...","secret":"SCKF...","amount":100}"#;
let safe_json = redact_sensitive_fields(json_response);
tracing::info!("API response: {}", safe_json);
```

### Frontend (TypeScript)

```typescript
import { logger, createScopedLogger } from '@/lib/logger';

// Basic logging (automatically redacted)
logger.debug('User login attempt', {
  account: 'GCKFBEIYTKP5ROORWS2HE6XXVV6MQVE6YDJHB5P7C4GGQXJN6ZHGKF3R',
  password: 'secret123', // Will be redacted
  timestamp: new Date().toISOString()
});

// API request logging
logger.api('POST', '/auth/login', {
  request_size: 256,
  has_credentials: true
});

// Error logging (goes to Sentry in production)
logger.error('Authentication failed', error, {
  endpoint: '/api/auth/login',
  user_agent: navigator.userAgent
});

// Scoped logging
const authLogger = createScopedLogger('AuthService');
authLogger.info('Token refreshed successfully', { expires_in: 3600 });

// Production logging (when NEXT_PUBLIC_ENABLE_PROD_LOGS=true)
logger.info('Debug info for production', { 
  feature: 'payments',
  stellar_account: 'GCKF...' // Will be redacted even in production
});
```

### Mobile (React Native)

```typescript
import { logger, createScopedLogger, measurePerformance } from '@/services/logger';

// Basic logging with context
logger.debug('Screen loaded', { screen: 'HomeScreen' }, {
  userId: 'user_123',
  feature: 'navigation'
});

// Network request logging
logger.network('POST', '/api/stellar/payment', 200, 450, {
  amount: 100,
  destination: 'GCKFBEIYTKP5ROORWS2HE6XXVV6MQVE6YDJHB5P7C4GGQXJN6ZHGKF3R'
});

// User action tracking
logger.userAction('tap_send_payment', {
  amount: 100,
  screen: 'PaymentScreen'
});

// Auth events (extra secure)
logger.auth('sep10_challenge_completed', {
  account: 'GCKFBEIYTKP5ROORWS2HE6XXVV6MQVE6YDJHB5P7C4GGQXJN6ZHGKF3R',
  challenge_time: 2500
});

// Performance measurement
const result = await measurePerformance(
  'stellar_transaction_sign',
  async () => {
    return await stellarSdk.signTransaction(transaction);
  },
  { complexity: 'high' }
);

// Error logging (goes to Crashlytics in production)
logger.error('Payment failed', error, {
  account: 'GCKF...',
  amount: 100
}, { 
  screenName: 'PaymentScreen' 
});

// Scoped logger
const walletLogger = createScopedLogger('WalletService', {
  feature: 'stellar_wallet'
});
walletLogger.debug('Wallet initialized', { network: 'testnet' });
```

## Environment Configuration

### Backend Environment Variables

```bash
# Logging configuration
LOG_FORMAT=json                    # or "pretty" for development
LOG_DIR=/var/log/stellar-insights  # Optional: enable file logging
RUST_LOG=info                      # Log level filter

# OpenTelemetry (optional)
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces

# Request/response body logging (development only)
API_LOG_BODIES=true               # WARNING: Only use in development
```

### Frontend Environment Variables

```bash
# Production logging control
NEXT_PUBLIC_ENABLE_PROD_LOGS=false  # Set to 'true' for production debug logs

# Sentry configuration
NEXT_PUBLIC_SENTRY_DSN=https://...
NEXT_PUBLIC_APP_VERSION=1.0.0

# Test environment
NODE_ENV=test
ENABLE_TEST_LOGS=false              # Set to 'true' for test logging
```

### Mobile Configuration

```bash
# Development vs production is detected via __DEV__ global

# Optional: Force production logging in debug builds
__DEV_LOGGING_ENABLED__=true

# Firebase Crashlytics is configured via firebase-config files
```

## Security Best Practices

### 1. Never Log Raw Sensitive Data

**❌ NEVER do this:**
```rust
tracing::info!("User account: {}", stellar_account);
tracing::info!("Login request: {:?}", login_request); // May contain password
```

**✅ Always do this:**
```rust
tracing::info!("User account: {}", redact_account(&stellar_account));
log_secure!(info, "Login request processed",
    username = &login_request.username,
    account = redact_account(&login_request.account)
);
```

### 2. Use Structured Logging

**❌ Avoid:**
```typescript
logger.info(`User ${user.email} logged in with account ${user.stellar_account}`);
```

**✅ Prefer:**
```typescript
logger.info('User login successful', {
  user_id: user.id,           // Safe ID
  account: user.stellar_account, // Will be auto-redacted
  login_method: 'sep10'
});
```

### 3. Test Your Redaction

Always verify that sensitive data is properly redacted:

```rust
#[test]
fn test_no_secrets_in_logs() {
    let account = "GCKFBEIYTKP5ROORWS2HE6XXVV6MQVE6YDJHB5P7C4GGQXJN6ZHGKF3R";
    let redacted = redact_account(account);
    assert!(!redacted.contains("BEIYTKP5ROORWS"));
    assert!(redacted.contains("G****[REDACTED]"));
}
```

### 4. Production Error Handling

Errors in production should never expose sensitive data:

```typescript
// Frontend - automatically handled by logger.error()
try {
  await stellarService.submitTransaction(transaction);
} catch (error) {
  // Error details are redacted before sending to Sentry
  logger.error('Transaction submission failed', error, {
    transaction_hash: hash,  // Will be redacted
    account: sourceAccount   // Will be redacted
  });
}
```

## Monitoring and Alerting

### Log Analysis

Search for potential redaction failures:
```bash
# Look for unredacted Stellar addresses in logs
grep -r "G[A-Z0-9]{55}" /var/log/stellar-insights/

# Look for unredacted secrets
grep -r "S[A-Z0-9]{55}" /var/log/stellar-insights/

# Look for JWT tokens
grep -r "eyJ[A-Za-z0-9_-]*\." /var/log/stellar-insights/
```

### Alerting Rules

Set up monitoring alerts for:
1. **High error rates** in logging components
2. **Failed redaction patterns** (if any sensitive data slips through)
3. **Unusual logging volume** (potential data leaks)
4. **Missing correlation IDs** (incomplete audit trails)

### Audit Trail

Key events that should always be logged (with redaction):
- User authentication (login/logout)
- Stellar account operations
- Payment transactions
- Admin actions
- API key usage
- Error conditions

## Testing

### Backend Tests

Run the redaction tests:
```bash
cd backend
cargo test logging_redaction_test
```

### Frontend Tests

Run the logger tests:
```bash
cd frontend
npm test src/lib/__tests__/logger.test.ts
```

### Mobile Tests

Run the mobile logger tests:
```bash
cd mobile
npm test src/services/__tests__/logger.test.ts
```

### Integration Testing

Test the full logging pipeline:
1. **Generate test data** with known sensitive values
2. **Process through logging system** 
3. **Verify output contains no sensitive data**
4. **Check that safe data is preserved**

## Troubleshooting

### Common Issues

**Problem**: Logs not appearing in production
- **Solution**: Check `NEXT_PUBLIC_ENABLE_PROD_LOGS` setting for frontend

**Problem**: Sensitive data still visible
- **Solution**: Verify field names match redaction patterns, use `auto_redact_string()`

**Problem**: Over-redaction (safe data being redacted)
- **Solution**: Review regex patterns, add exceptions for known safe formats

**Problem**: Performance impact
- **Solution**: Redaction is designed to be fast, but consider async logging for high throughput

### Debug Mode

Enable verbose logging temporarily:

```bash
# Backend
RUST_LOG=debug stellar-insights-backend

# Frontend (development)
ENABLE_TEST_LOGS=true npm run dev

# Mobile (enable via Flipper or debug menu)
```

## Future Enhancements

### Planned Improvements

1. **Machine Learning Detection**: Use ML models to detect new types of sensitive data
2. **Encryption at Rest**: Encrypt log files on disk
3. **Zero-Trust Logging**: Verify all log entries before writing
4. **Compliance Reporting**: Generate GDPR/CCPA compliance reports from log analysis
5. **Real-time Redaction Monitoring**: Alert when redaction patterns fail

### Contributing

When adding new features that log data:

1. **Review this document** for patterns and requirements
2. **Add tests** for any new redaction patterns
3. **Update documentation** if adding new data types
4. **Security review** for any changes to redaction logic

## Compliance

This logging implementation supports:

- **GDPR**: PII is redacted, users can request log data deletion
- **CCPA**: California residents' PII is protected
- **SOX**: Financial transaction logs maintain integrity
- **HIPAA**: Health information (if any) is redacted
- **PCI DSS**: Payment card information is redacted

## Contact

For questions about logging security:
- **Security Team**: security@stellar-insights.com
- **DevOps Team**: devops@stellar-insights.com
- **Documentation**: This document + inline code comments