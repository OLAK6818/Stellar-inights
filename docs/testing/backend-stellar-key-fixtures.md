# Backend: Replace Fake Placeholder Stellar Key Fixtures

## Summary

Backend tests currently use placeholder values such as `GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`,
which can mask validation issues and reduce test reliability. This document outlines what needs to change,
where, and how to do it correctly.

## Problem

Stellar public keys (G-addresses) follow a specific encoding format: Base32-encoded Ed25519 public keys
with a checksum, always 56 characters starting with `G`. Using obviously invalid placeholder strings
like `GXXXXXX...` means:

- Format validators won't catch regressions if they stop rejecting bad keys
- Tests that should fail on invalid input may silently pass
- Reviewers can't distinguish intentionally invalid from accidentally broken fixtures

## Affected Files

| File | Line | Current Placeholder |
|------|------|---------------------|
| `backend/tests/pagination_test.rs` | ~28 | `GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` |
| `backend/tests/stellar_toml_test.rs` | ~296 | `GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` (in TOML fixture) |

## What "Valid-Format" Means

A valid-format fixture key:
- Is exactly 56 characters long
- Starts with `G`
- Contains only Base32 alphabet characters (`A-Z`, `2-7`)
- Passes checksum validation (Stellar's strkey format)

These keys do **not** need to correspond to real accounts on any network — they just need to pass
format validation. Real secrets must never appear in test code.

### Recommended Fixture Keys

These are well-known test vectors that pass format validation:

```rust
// Canonical test fixtures — valid format, no real funds, safe to commit
pub const TEST_ACCOUNT_1: &str = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
pub const TEST_ACCOUNT_2: &str = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7";
pub const TEST_ACCOUNT_3: &str = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
pub const TEST_ACCOUNT_4: &str = "GCKFBEIYTKP5ROORWS2HE6XXVV6MQVE6YDJHB5P7C4GGQXJN6ZHGKF3R";
```

For cases that explicitly test **invalid** input, use a clearly named constant and document the intent:

```rust
// Intentionally invalid — used to test rejection of malformed keys
pub const INVALID_STELLAR_KEY: &str = "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
```

## Required Changes

### 1. `backend/tests/pagination_test.rs`

Replace:
```rust
let account_id = "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
```

With:
```rust
let account_id = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
```

### 2. `backend/tests/stellar_toml_test.rs`

The TOML fixture string contains an invalid issuer. If the test is checking that missing/invalid
issuers are handled gracefully, rename the constant to make the intent explicit:

```rust
// If testing invalid issuer handling — keep but rename:
const TOML_WITH_INVALID_ISSUER: &str = r#"
[[CURRENCIES]]
issuer = "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
name = "Missing Code"
"#;

// If testing normal parsing — replace with a valid-format issuer:
const TOML_WITH_VALID_ISSUER: &str = r#"
[[CURRENCIES]]
issuer = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
code = "USDC"
name = "USD Coin"
"#;
```

## Adding a Format Validation Helper

Add a shared test utility to `backend/tests/` (e.g., in a `common/mod.rs` or inline):

```rust
/// Validates that a string is a valid Stellar public key (G-address).
/// Checks length (56 chars), prefix ('G'), and character set (Base32).
/// Does NOT verify the checksum — use the stellar-base crate for full validation.
pub fn assert_valid_stellar_key_format(key: &str) {
    assert_eq!(key.len(), 56, "Stellar key must be 56 characters, got: {}", key.len());
    assert!(key.starts_with('G'), "Stellar public key must start with 'G'");
    assert!(
        key.chars().all(|c| matches!(c, 'A'..='Z' | '2'..='7')),
        "Stellar key contains invalid Base32 characters: {}",
        key
    );
}
```

Usage in tests:
```rust
#[test]
fn test_fixture_keys_are_valid_format() {
    assert_valid_stellar_key_format(TEST_ACCOUNT_1);
    assert_valid_stellar_key_format(TEST_ACCOUNT_2);
    assert_valid_stellar_key_format(TEST_ACCOUNT_3);
}
```

## Acceptance Criteria

- [ ] No backend test uses `GXXXX...` as a legitimate (non-intentionally-invalid) fixture
- [ ] Any remaining use of invalid key strings is in a const named `INVALID_STELLAR_KEY` or similar, with a comment
- [ ] A format validation helper exists and is used to validate fixture constants
- [ ] All existing tests continue to pass after the replacement

## Security Notes

- Never use real Stellar secret keys (S-addresses) in test fixtures
- Never commit `.env` files or secrets to the repo
- The fixture keys listed above have no known associated secrets and carry no real funds
