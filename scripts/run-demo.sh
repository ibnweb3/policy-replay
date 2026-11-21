#!/usr/bin/env bash
# Run inside WSL/Linux from the repo root: proves every proposal in demo/proposals in order,
# carrying the state forward, so receipt n+1 starts exactly where receipt n ended.
set -euo pipefail
export PATH="$HOME/.risc0/bin:$HOME/.cargo/bin:$PATH"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$HOME/.cache/policy-replay-target}"
unset RISC0_DEV_MODE
cargo build --release -q
BIN="$CARGO_TARGET_DIR/release/policy-replay"
state=demo/state0.json
for p in demo/proposals/*.json; do
  n=$(basename "$p" .json)
  out="runs/$n"
  echo "== proposal $n"
  "$BIN" demo/policy.json "$state" "$p" "$out"
  state="$out/next_state.json"
done
