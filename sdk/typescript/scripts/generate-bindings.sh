#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK_ROOT="$(dirname "$SCRIPT_DIR")"
GENERATED_DIR="$SDK_ROOT/generated"
CONTRACT_ID="${STELLAR_CONTRACT_ID:-}"
RPC_URL="${STELLAR_RPC_URL:-https://soroban-testnet.stellar.org}"
NETWORK_PASSPHRASE="${STELLAR_NETWORK_PASSPHRASE:-Test SDF Network ; September 2015}"

if [ -z "$CONTRACT_ID" ]; then
  echo "Error: STELLAR_CONTRACT_ID environment variable is required" >&2
  exit 1
fi

command -v stellar >/dev/null 2>&1 || {
  echo "Error: 'stellar' CLI not found. Install it from https://github.com/stellar/stellar-cli" >&2
  exit 1
}

echo "Generating TypeScript bindings for contract $CONTRACT_ID..."

rm -rf "$GENERATED_DIR/contract-bindings"

stellar contract bindings typescript \
  --contract-id "$CONTRACT_ID" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  --output-dir "$GENERATED_DIR/contract-bindings"

echo "Bindings generated at $GENERATED_DIR/contract-bindings"
