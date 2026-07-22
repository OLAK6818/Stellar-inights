# Soroban Contract ABI Compatibility Testing

## Overview

This document describes how the Stellar Insights platform verifies compatibility between:
- **Soroban Contract ABI** (smart contract definitions)
- **Backend Service** (Rust contract interaction code)
- **Frontend/Mobile Clients** (TypeScript contract types)

Contract ABI schema drift is detected through automated tests to prevent runtime failures when contracts are upgraded.

## Contract ABI Schema

### Contract Definition Location

`contracts/stellar_insights/src/lib.rs`

### Example Contract Types

```rust
#[derive(Clone)]
#[contracttype]
pub struct SnapshotData {
    pub hash: BytesN<32>,
    pub epoch: u64,
    pub timestamp: u64,
    pub submitter: Address,
}

#[contract]
pub struct StellarInsights;

#[contractimpl]
impl StellarInsights {
    pub fn submit_snapshot(env: Env, hash: BytesN<32>, epoch: u64) -> Result<(), Error> {
        // Function implementation
    }
}
```

### ABI Extraction

Contract ABIs are defined through Soroban SDK macros and can be inspected via:

```bash
# Generate contract spec
soroban contract spec --output json > contract-spec.json

# Inspect types
soroban contract inspect --output json > contract-inspection.json
```

**Output Format**:
```json
{
  "contractId": "CAAA...",
  "spec": {
    "functions": [
      {
        "name": "submit_snapshot",
        "parameters": [
          { "name": "hash", "type": "BytesN<32>" },
          { "name": "epoch", "type": "u64" }
        ],
        "returns": "Result"
      }
    ],
    "types": [
      {
        "name": "SnapshotData",
        "fields": [
          { "name": "hash", "type": "BytesN<32>" },
          { "name": "epoch", "type": "u64" },
          { "name": "timestamp", "type": "u64" },
          { "name": "submitter", "type": "Address" }
        ]
      }
    ]
  }
}
```

## Backend Compatibility

### Location
`backend/src/services/contract.rs`

### Required Interfaces

```rust
pub struct ContractConfig {
    pub rpc_url: String,
    pub contract_id: String,
    pub network_passphrase: String,
    pub source_secret_key: String,
}

pub struct ContractService {
    client: Client,
    config: ContractConfig,
}

impl ContractService {
    pub async fn submit_snapshot(&self, hash: [u8; 32], epoch: u64) -> Result<SubmissionResult>;
}
```

### Compatibility Checks

1. **Function Existence**: Contract must have `submit_snapshot` function
2. **Parameter Types**: Arguments must match (hash: bytes32, epoch: u64)
3. **Return Type**: Must return Result type (success/error)
4. **Invocation Format**: Arguments must be serialized correctly for RPC

### Test Example

```rust
#[test]
fn test_backend_contract_interface_compatibility() {
    let config = ContractConfig {
        rpc_url: "https://soroban-testnet.stellar.org".to_string(),
        contract_id: "CAAA...".to_string(),
        network_passphrase: "Test SDF Network ; September 2015".to_string(),
        source_secret_key: "SBAA...".to_string(),
    };
    
    let service = ContractService::new(config);
    
    // Contract must be instantiable
    assert!(!service.config.contract_id.is_empty());
    
    // Verify method exists (compile-time check)
    // submit_snapshot method must accept &[u8; 32] and u64
}
```

## Frontend Type Compatibility

### Location
`frontend/src/types/` and `frontend/src/services/contractSubmission.ts`

### Required Types

```typescript
export interface ContractArg {
  type: "u64" | "u32" | "i64" | "i32" | "bytes" | "string" | "bool" | "address";
  value: string;
}

export interface ContractTransaction {
  contractId: string;
  functionName: string;
  args: ContractArg[];
}

// Submission request schema
const ContractTransactionSchema = z.object({
  contractId: z.string().startsWith("C"),
  functionName: z.string().min(1),
  args: z.array(ContractArgSchema),
});
```

### Compatibility Checks

1. **Argument Type Coverage**: All contract parameter types must be representable
2. **Validation Schema**: Input validation must match contract expectations
3. **Serialization Format**: Arguments must serialize to contract-expected format

### Test Example

```typescript
import { describe, it, expect } from "vitest";
import { ContractTransactionSchema } from "./contractSubmission";

describe("Frontend Contract Type Compatibility", () => {
  it("should accept valid submit_snapshot args", () => {
    const validRequest = {
      contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
      functionName: "submit_snapshot",
      args: [
        { type: "bytes", value: "abc123..." },
        { type: "u64", value: "12345" },
      ],
    };

    expect(() => ContractTransactionSchema.parse(validRequest)).not.toThrow();
  });

  it("should reject invalid contract ID", () => {
    const invalidRequest = {
      contractId: "GAAA...", // Should start with C
      functionName: "submit_snapshot",
      args: [],
    };

    expect(() => ContractTransactionSchema.parse(invalidRequest)).toThrow();
  });
});
```

## Mobile Type Compatibility

### Location
`mobile/src/services/contractService.ts` and `mobile/src/types/`

### Required Types

```typescript
interface ContractArg {
  type: "u64" | "u32" | "i64" | "i32" | "bytes" | "string" | "bool" | "address";
  value: string;
}

interface QueuedTransaction {
  id: string;
  contractId: string;
  functionName: string;
  args: ContractArg[];
  simulatedEnvelope?: string;
  status: "queued" | "submitted" | "confirmed" | "failed";
}
```

### Compatibility Checks

1. **Offline Support**: Contract must handle queuing (deterministic signing)
2. **Type Serialization**: Args must serialize consistently for replay
3. **Error Handling**: Contract errors must map to retryable/non-retryable

### Test Example

```typescript
describe("Mobile Contract Type Compatibility", () => {
  it("should queue and replay contract invocation", async () => {
    const service = new MobileContractService();

    const request = {
      contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
      functionName: "submit_snapshot",
      args: [
        { type: "bytes", value: "abc123..." },
        { type: "u64", value: "12345" },
      ],
    };

    // Queue offline
    await service.submitTransaction(request);
    const queued = await service.getQueuedTransactions();
    expect(queued).toHaveLength(1);

    // Replay should use same serialization
    expect(queued[0].args).toEqual(request.args);
  });
});
```

## Schema Verification Tests

### Location
`scripts/verify-contract-abi.sh` and `backend/tests/contract_abi_test.rs`

### Test Suite

#### 1. Contract Spec Generation Test

```bash
#!/bin/bash
# scripts/verify-contract-abi.sh

# Generate contract specification
soroban contract spec --output json > /tmp/contract-spec.json

# Verify spec contains expected functions
jq '.spec.functions[] | select(.name == "submit_snapshot")' /tmp/contract-spec.json
if [ $? -ne 0 ]; then
  echo "ERROR: submit_snapshot function not found in contract spec"
  exit 1
fi

# Verify parameter types
PARAMS=$(jq '.spec.functions[] | select(.name == "submit_snapshot") | .parameters' /tmp/contract-spec.json)
echo "Parameters: $PARAMS"
```

#### 2. Backend Service Test

```rust
#[test]
fn test_contract_service_has_required_methods() {
    // Compile-time check: ContractService must have submit_snapshot method
    // Type signature must match: async fn submit_snapshot(&self, hash: [u8; 32], epoch: u64) -> Result<...>
    
    // Runtime verification would require reading contract spec
    let spec = load_contract_spec("contracts/stellar_insights");
    
    assert!(spec.has_function("submit_snapshot"));
    let submit_snapshot = spec.get_function("submit_snapshot").unwrap();
    assert_eq!(submit_snapshot.parameters.len(), 2);
    assert_eq!(submit_snapshot.parameters[0].name, "hash");
    assert_eq!(submit_snapshot.parameters[1].name, "epoch");
}
```

#### 3. Frontend Type Test

```typescript
import contractSpec from "../../../contracts/stellar_insights/contract-spec.json";

describe("Frontend Contract Type Verification", () => {
  it("should match backend contract specification", () => {
    const submitSnapshotSpec = contractSpec.spec.functions.find(
      (f) => f.name === "submit_snapshot"
    );

    expect(submitSnapshotSpec).toBeDefined();
    expect(submitSnapshotSpec?.parameters).toHaveLength(2);
    expect(submitSnapshotSpec?.parameters[0].name).toBe("hash");
    expect(submitSnapshotSpec?.parameters[0].type).toBe("BytesN<32>");
  });

  it("should accept all parameter types defined in contract", () => {
    const argTypes = new Set<string>();
    for (const param of contractSpec.spec.functions.flatMap((f) => f.parameters)) {
      argTypes.add(param.type);
    }

    // Verify frontend supports all types
    const supportedTypes = new Set(["u64", "u32", "i64", "i32", "bytes", "string", "bool", "address"]);
    for (const type of argTypes) {
      expect(supportedTypes.has(mapContractType(type))).toBe(true);
    }
  });
});
```

#### 4. Cross-Layer Compatibility Test

```rust
#[test]
fn test_full_stack_contract_compatibility() {
    // 1. Load contract spec
    let spec = load_contract_spec("contracts/stellar_insights");
    
    // 2. Verify backend service interface matches
    // - ContractService has methods for all contract functions
    // - Method signatures match parameter types
    
    // 3. Verify XDR types are serializable
    // - All function parameters must serialize to Soroban types
    // - All return types must deserialize from RPC responses
    
    // 4. Verify error handling
    // - Contract errors map to backend Result types
    // - Error codes are documented
}
```

## CI/CD Integration

### GitHub Actions Workflow

**Location**: `.github/workflows/contract-abi-verify.yml`

```yaml
name: Contract ABI Verification

on:
  pull_request:
    paths:
      - "contracts/stellar_insights/src/**"
      - "backend/src/services/contract.rs"
      - "frontend/src/types/**"
      - "frontend/src/services/contractSubmission.ts"
      - "mobile/src/services/contractService.ts"

jobs:
  verify-abi:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: "18"

      - name: Install Soroban CLI
        run: npm install -g soroban-cli

      - name: Generate Contract Spec
        run: |
          cd contracts/stellar_insights
          soroban contract spec --output json > ../../contract-spec.json

      - name: Verify Backend Compatibility
        run: cargo test --test contract_abi_test -- --nocapture

      - name: Verify Frontend Types
        run: |
          cd frontend
          npm install
          npm run test -- contract-types.test.ts

      - name: Verify Mobile Types
        run: |
          cd mobile
          npm install
          npm run test -- contract-types.test.ts

      - name: Run Script Verification
        run: bash scripts/verify-contract-abi.sh

      - name: Comment on PR
        if: failure()
        uses: actions/github-script@v6
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '❌ Contract ABI verification failed. Please ensure contract, backend, frontend, and mobile types are compatible.'
            })
```

## Debugging Schema Drift

### When Schema Changes Occur

1. **Contract Changes**:
   ```bash
   # Regenerate spec
   cd contracts/stellar_insights
   soroban contract spec --output json > contract-spec.json
   ```

2. **Backend Changes**:
   ```bash
   # Verify types match
   cargo test test_contract_service_has_required_methods
   
   # Check XDR serialization
   cargo test test_xdr_round_trip_safety
   ```

3. **Frontend Changes**:
   ```bash
   # Run type tests
   cd frontend
   npm test -- contract-types.test.ts
   ```

4. **Mobile Changes**:
   ```bash
   # Run type tests
   cd mobile
   npm test -- contract-types.test.ts
   ```

### Common Issues

| Issue | Solution |
|-------|----------|
| Contract function renamed | Update backend `build_invoke_args()` and frontend `ContractTransactionSchema` |
| Parameter type changed | Update frontend type definitions and serialization logic |
| Return type changed | Update backend parsing in `prepare_and_sign_transaction()` |
| New contract event | Document in contract spec, no client changes needed |

### Rollback Procedure

If incompatibility is detected in production:

1. **Stop deployments** to affected layer
2. **Revert** to previous contract/service version
3. **Verify** ABI tests pass
4. **Communicate** downtime to users
5. **Fix** compatibility issues
6. **Re-deploy** with verified compatibility

## Type Mapping Reference

### Soroban Type → Frontend Serialization

| Soroban Type | Frontend Type | Serialization |
|------|------|------|
| `BytesN<32>` | `bytes` | hex string |
| `u64` | `u64` | decimal string |
| `u32` | `u32` | decimal string |
| `i64` | `i64` | decimal string |
| `i32` | `i32` | decimal string |
| `String` | `string` | UTF-8 |
| `bool` | `bool` | "true"/"false" |
| `Address` | `address` | Stellar account ID |
| `Symbol` | `string` | symbol name |
| `Map` | (not supported) | N/A |

## Best Practices

1. **Test Every Layer**: Always run full ABI verification suite
2. **Document Changes**: Update contract lifecycle docs when ABI changes
3. **Use CI/CD**: Never merge contract changes without passing ABI tests
4. **Semantic Versioning**: Use contract versions for breaking changes
5. **Backward Compatibility**: Avoid breaking changes; add new functions instead
6. **Type Safety**: Use TypeScript strict mode and Rust type checking
7. **Test Coverage**: Maintain >95% coverage for contract interaction code

## Related Documents

- [Contract Lifecycle Documentation](./contract-lifecycle.md)
- [Soroban SDK Types](https://soroban.stellar.org/docs/reference/types)
- [Stellar XDR Specification](https://developers.stellar.org/docs/glossary/xdr)
