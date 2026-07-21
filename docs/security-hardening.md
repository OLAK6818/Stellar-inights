# Security Hardening Strategy

This document outlines the security hardening measures implemented across the Stellar Insights ecosystem.

## 1. Backend Authentication (SEP-10)

The SEP-10 implementation in `backend/src/auth/sep10_simple.rs` has been hardened with:
- **Strict Validation**: All challenge requests are validated for account format, home domain, and memo length (limit: 28 characters).
- **Replay Protection**: Nonces are stored in Redis with a strict TTL and are consumed atomically upon verification.
- **Fail-Closed Design**: If Redis is unavailable, challenge verification will fail to prevent potential bypasses.
- **Structural Integrity**: The verification process ensures the home domain and server key in the challenge match the server's configuration.

## 2. Secret Management (Vault)

- **Runtime Fetching**: Sensitive credentials (database, etc.) are fetched from HashiCorp Vault at runtime.
- **Lease Management**: The backend handles lease renewal and revocation to ensure credentials are short-lived.
- **Sanitized Logging**: All environment variables are sanitized before logging to prevent leaking credentials in audit logs.

## 3. Mobile Secure Storage

The mobile app (`mobile/src/services/tokenStorage.ts`) uses platform-native secure storage:
- **Biometric/Hardened Access**: Tokens are stored with `Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY` and forced to use `SECURITY_LEVEL.SECURE_HARDWARE`.
- **Fail-Closed Access**: Any failure in secure storage access results in a logout to prioritize security over convenience.

## 4. Frontend Security

- **Secure Environment**: The `WalletProvider` enforces a secure connection (HTTPS) for any operation involving authentication tokens.
- **Token Handling**: Auth tokens are handled in memory as much as possible, with documented risks for `localStorage` persistence.

## 5. Security Controls Mapping

| Control ID | Platform | Measure | Status |
|---|---|---|---|
| SEC-001 | Frontend | Secure Protocol Enforcement (HTTPS) | Active |
| SEC-002 | Mobile | Hardware-level Storage Enforcement | Active |
| SEC-003 | Mobile | Fail-Closed Token Retrieval | Active |
| SEC-004 | Mobile | Runtime Production Config Validation | Active |
| SEC-005 | Backend | Atomic Nonce Consumption (Redis) | Active |
| SEC-006 | Backend | Production-only Secret Complexity | Active |
