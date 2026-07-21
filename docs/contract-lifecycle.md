# Soroban Contract Transaction Lifecycle Documentation

## Overview

This document describes the complete lifecycle of Soroban contract transactions in the Stellar Insights platform, spanning backend contract signing, frontend submission, and mobile offline handling.

## Architecture

```
┌─────────────┐
│   Frontend  │
│  / Mobile   │
└──────┬──────┘
       │
       ├─ Submit Contract Transaction
       │
       ▼
┌──────────────────────┐
│   Backend Service    │
│  (contract.rs)       │
├──────────────────────┤
│ 1. Build Invocation  │
│ 2. Simulate (RPC)    │
│ 3. Decode XDR        │
│ 4. Sign Transaction  │
│ 5. Encode XDR        │
│ 6. Submit to Network │
│ 7. Wait Confirmation │
└──────────────────────┘
       │
       ▼
┌──────────────────────┐
│  Soroban RPC Network │
│  (testnet/mainnet)   │
└──────────────────────┘
```

## Transaction Lifecycle Stages

### Stage 1: Contract Invocation Building

**Location**: Backend `ContractService::build_invoke_args()`

Contract invocation parameters are built from:
- Contract ID (e.g., `CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4`)
- Function name (e.g., `submit_snapshot`)
- Arguments array with types and values

```json
{
  "contractId": "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
  "function": "submit_snapshot",
  "args": [
    { "type": "bytes", "value": "abc123..." },
    { "type": "u64", "value": "12345" }
  ]
}
```

### Stage 2: Transaction Simulation

**Location**: Backend `ContractService::simulate_transaction()`

RPC method: `simulateTransaction`

The Soroban RPC endpoint returns:
- Transaction envelope XDR (base64-encoded)
- Resource fees (CPU, memory, bandwidth)
- Events (if any)
- Latest ledger number

```json
{
  "jsonrpc": "2.0",
  "result": {
    "transactionData": "AAAAAgAAAABgYJNGg5C7L+1AukkqZ/wr/n8yHWYr/AAAABAAAAPZAAAAAAA==",
    "minResourceFee": "1000",
    "events": [],
    "latestLedger": 123456
  }
}
```

**Error Cases**:
- Contract not found → Error code -32603
- Invalid arguments → Error code -32000
- Network timeout → Request timeout error

### Stage 3: XDR Decoding and Parsing

**Location**: Backend `ContractService::prepare_and_sign_transaction()`

Process:
1. Decode base64 transaction XDR
2. Parse XDR bytes to `TransactionEnvelope::V1`
3. Extract inner `Transaction` object

**Validation**:
- Ensure XDR is non-empty
- Ensure base64 decoding succeeds
- Ensure envelope version is V1 (Soroban only supports V1)

**Error Handling**:
```rust
// Must contain transactionData field
let transaction_xdr = simulated
    .get("transactionData")
    .and_then(|t| t.as_str())
    .ok_or_else(|| anyhow::anyhow!("Simulation did not return transaction data"))?;

// Must decode successfully
let xdr_bytes = BASE64
    .decode(transaction_xdr)
    .context("Failed to decode base64 XDR from simulation")?;

// Must parse to valid envelope
let mut envelope = TransactionEnvelope::from_xdr(&xdr_bytes)?;
```

### Stage 4: Transaction Signing

**Location**: Backend `ContractService::prepare_and_sign_transaction()`

#### 4.1 Keypair Derivation

```rust
// Decode Stellar secret key (format: S-prefix + base32 encoded)
let secret_key_bytes = decode_stellar_secret_key(&self.config.source_secret_key)?;

// Create Ed25519 signing key
let signing_key = SigningKey::from_bytes(&secret_key_bytes);
let verifying_key: VerifyingKey = (&signing_key).into();
```

**Secret Key Format**:
- Prefix: `S` (Stellar secret key identifier)
- Base32-encoded payload containing:
  - Version byte (0x30 = 48)
  - 32-byte Ed25519 seed

#### 4.2 Transaction Hash Computation

Following Stellar's convention:

```rust
// Step 1: Hash network passphrase
let network_hash = SHA256(SHA256("StellarNetwork\0" || network_passphrase));

// Step 2: Compute transaction hash
let tx_hash = SHA256(
    network_hash ||
    0x00_00_00_02 ||      // ENVELOPE_TYPE_TX
    transaction_xdr_bytes
);
```

**Network Passphrases**:
- Testnet: `"Test SDF Network ; September 2015"`
- Public: `"Public Global Stellar Network ; September 2015"`

Different passphrases produce different transaction hashes, preventing accidental mainnet/testnet cross-submissions.

#### 4.3 Signature Creation

```rust
// Sign transaction hash with Ed25519
let signature = signing_key.sign(&tx_hash);  // 64 bytes

// Compute signature hint from public key (last 4 bytes)
let hint_slice: [u8; 4] = public_key[28..32];
```

**Signature Components**:
- Signature: 64-byte Ed25519 signature
- Hint: 4-byte hint derived from signer's public key (optimization for transaction verification)

#### 4.4 Signature Addition to Envelope

```rust
match &mut envelope {
    TransactionEnvelope::V1(e) => {
        let decorated_sig = DecoratedSignature {
            hint: hint_slice,
            signature: Signature(sig_bytes),
        };
        e.signatures.push(decorated_sig);
    }
    _ => return Err(anyhow::anyhow!("Unsupported envelope version")),
}
```

The envelope can contain multiple signatures for multi-sig contracts.

### Stage 5: XDR Re-encoding

**Location**: Backend `ContractService::prepare_and_sign_transaction()`

```rust
// Re-encode signed envelope to XDR
let final_xdr = envelope.to_xdr()?;

// Encode to base64 for transmission
let signed_xdr = BASE64.encode(&final_xdr);
```

### Stage 6: Transaction Submission

**Location**: Backend `ContractService::send_transaction()`

RPC method: `sendTransaction`

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "sendTransaction",
  "params": {
    "transaction": "AAAAAgAAAABgYJNGg5C7L+1AukkqZ/wr/n8yHWYr/AAAABAAAAPZAAAAAAA==..."
  }
}
```

**Response** (on success):
```json
{
  "jsonrpc": "2.0",
  "result": {
    "hash": "abc123...",
    "status": "pending"
  }
}
```

**Error Cases**:
- Invalid signature → RPC rejects
- Expired transaction → Resource limit exceeded
- Insufficient fee → Fee too low error

### Stage 7: Transaction Confirmation Polling

**Location**: Backend `ContractService::wait_for_transaction()`

RPC method: `getTransaction`

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "getTransaction",
  "params": {
    "hash": "abc123..."
  }
}
```

**Polling Loop**:
- Poll interval: 250ms
- Max attempts: 60 (15 seconds timeout)
- Status values: `"success"`, `"failed"`, or `null` (not yet included)

**Success Response**:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "status": "success",
    "ledger": 789012,
    "createdAt": "2024-06-18T10:30:00Z"
  }
}
```

## Frontend Submission Flow

**Service**: `frontend/src/services/contractSubmission.ts`

```typescript
// 1. Validate input
const validatedRequest = ContractTransactionSchema.parse(request);

// 2. Build transaction locally
const transaction = buildTransaction(validatedRequest);

// 3. Call backend simulation
const simulated = await simulateTransaction(transaction);

// 4. Send to backend for signing & submission
const result = await submitToBackend(simulated);

// 5. Poll for confirmation
const confirmed = await pollForConfirmation(result.transactionHash);

return result;
```

**Error Handling**:
- Validation errors → Immediate failure
- Simulation errors → Retryable with exponential backoff
- Backend errors → Retryable or non-retryable based on error type
- Confirmation timeout → Retryable

**Retry Strategy**:
- Initial backoff: 1000ms
- Multiplier: 2x per attempt
- Max attempts: 3

## Mobile Offline Fallback

**Service**: `mobile/src/services/contractService.ts`

### Queueing Logic

1. **Online**: Submit immediately
   - If fails and retryable → Queue for later
   - If fails and non-retryable → Show error

2. **Offline**: Queue automatically
   - Show "queued for later" message
   - Attempt submission when online

### Local Persistence

Uses IndexedDB (`StellarInsights` database):
```typescript
interface QueuedTransaction {
  id: string;
  contractId: string;
  functionName: string;
  args: ContractArg[];
  simulatedEnvelope?: string;
  status: "queued" | "submitted" | "confirmed" | "failed";
  attemptCount: number;
  createdAt: number;
  updatedAt: number;
}
```

### Queue Processing

When device comes online:
1. Fetch all `"queued"` transactions
2. For each queued transaction:
   - Simulate if needed
   - Submit to backend
   - Update status
   - Poll for confirmation
3. Delay 5 seconds between submissions (to avoid overwhelming backend)

### Cleanup

Remove confirmed transactions older than 24 hours:
```typescript
await service.clearCompletedTransactions(24 * 60 * 60 * 1000);
```

## API Endpoints

### Backend Contract APIs

#### Simulate Transaction
```
POST /api/v1/contracts/simulate
Content-Type: application/json

{
  "contractId": "CAAA...",
  "functionName": "submit_snapshot",
  "args": [
    { "type": "bytes", "value": "abc123..." },
    { "type": "u64", "value": "12345" }
  ]
}

Response:
{
  "transactionData": "AAAAAgAAAABg...",
  "minResourceFee": "1000",
  "latestLedger": 123456
}
```

#### Submit Transaction
```
POST /api/v1/contracts/submit
Content-Type: application/json

{
  "transactionData": "AAAAAgAAAABg..."
}

Response:
{
  "hash": "abc123...",
  "status": "pending"
}
```

#### Get Transaction Status
```
GET /api/v1/contracts/status/:txHash

Response:
{
  "status": "success" | "failed" | "pending",
  "ledger": 789012,
  "error": "optional error message"
}
```

## Error Handling

### Retryable Errors

- Network timeout
- 5xx server errors
- Transaction not found (pending)
- Resource temporarily unavailable

### Non-Retryable Errors

- Invalid contract ID (4xx)
- Malformed arguments (4xx)
- Insufficient fee (permanent)
- Invalid signature

### Error Messages

**Frontend/Mobile**:
- "Failed to simulate: Contract not found" → Non-retryable
- "Backend timeout" → Retryable
- "Device offline - queued for later" → Mobile-specific

**Backend Logs**:
- All errors logged with context
- Transaction hash included in logs
- Timing information for performance analysis

## Debugging and Testing

### Local Testing with Soroban CLI

```bash
# Build contracts
cd contracts/stellar_insights
soroban contract build

# Deploy to testnet
soroban contract deploy \
  --wasm-ref ./target/wasm32-unknown-unknown/release/stellar_insights.wasm \
  --source-account myaccount \
  --network testnet

# Invoke function
soroban contract invoke \
  --contract-id <CONTRACT_ID> \
  --source-account myaccount \
  --network testnet \
  -- submit_snapshot \
  --hash abc123... \
  --epoch 1
```

### Backend Testing

```bash
# Run signing tests
cargo test contract_signing_tests

# Run integration tests
cargo test --test contract_signing_test contract_integration_scenarios

# Check with valgrind for memory issues
valgrind --leak-check=full cargo test
```

### Frontend Testing

```bash
# Test submission service
npm test src/services/contractSubmission.test.ts

# Test with mock backend
jest --testMatch="**/*.test.ts"
```

### Mobile Testing

```bash
# Test offline queueing
npm test src/services/contractService.test.ts

# Test with network throttling in dev tools
# Chrome DevTools → Network → Throttle to "Offline"
```

## Performance Characteristics

### Network Latency
- Simulation: 500-2000ms (RPC round trip)
- Signing: 50-100ms (local cryptography)
- Submission: 200-1000ms (RPC round trip)
- Confirmation: 1-5 seconds (ledger close time ~5s)
- **Total: 2-10 seconds typical**

### Resource Usage

**Backend**:
- Memory: ~10MB per active transaction
- CPU: ~5% per signing operation
- Network bandwidth: ~2KB per transaction

**Mobile**:
- Memory: ~5MB for IndexedDB queue (100 transactions)
- Battery: Minimal impact (async operations)
- Storage: ~2KB per queued transaction

## Security Considerations

### Private Key Handling
- Secret key stored in backend environment only
- Never transmitted to frontend/mobile
- Used only for signing operations
- Network passphrase prevents cross-network attacks

### Transaction Validation
- XDR structure validated before signing
- Envelope version checked (only V1 supported)
- Signature format verified (64 bytes)
- Hash computation follows Stellar standard

### Mobile Offline Security
- Queued transactions stored locally (device only)
- No sensitive data in IndexedDB
- Transactions submitted to backend for signing
- No keys stored on mobile device

## Future Improvements

1. **Multi-sig Support**: Multiple signers for governance contracts
2. **Streaming Confirmation**: WebSocket for real-time updates
3. **Transaction Builder UI**: Visual contract invocation builder
4. **ABI Documentation**: Auto-generated from contract metadata
5. **Gas Estimation UI**: Show expected fees before submission
6. **Transaction Batching**: Combine multiple operations
7. **Mobile Biometric Signing**: Device-local key material (advanced)

## Related Documents

- [Contract ABI Compatibility Guide](./contract-abi.md)
- [Soroban SDK Documentation](https://soroban.stellar.org/docs)
- [Stellar Network Passphrase Reference](https://developers.stellar.org/docs/glossary/network-passphrase)
- [XDR Specification](https://developers.stellar.org/docs/glossary/xdr)
