# Generated Files

This directory contains auto-generated Soroban contract TypeScript bindings.

**Do not edit files in this directory manually.** They will be overwritten on the
next generation run.

## Regenerating

```bash
STELLAR_CONTRACT_ID=<your-contract-id> ./scripts/generate-bindings.sh
```

Set `STELLAR_RPC_URL` and `STELLAR_NETWORK_PASSPHRASE` to target a specific
network (defaults to testnet).

The generation script runs `stellar contract bindings typescript` under the hood.
In CI, bindings are regenerated automatically on every contract change.
