#!/usr/bin/env bash
# Run inside WSL/Linux from the repo root: proves every proposal in demo/proposals in order,
# carrying the state forward, so receipt n+1 starts exactly where receipt n ended.
#
# Writes to myruns/ by default, so the committed runs/ (whose proofs are the ones finalized on
# zkVerify) are never overwritten. Pass a directory to choose another place: bash scripts/run-demo.sh out
set -euo pipefail
OUT_ROOT="${1:-myruns}"
if [ "$OUT_ROOT" = "runs" ]; then
  echo "refusing to overwrite runs/: those proofs are the ones submitted to zkVerify" >&2
  exit 1
fi
export PATH="$HOME/.risc0/bin:$HOME/.cargo/bin:$PATH"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$HOME/.cache/policy-replay-target}"
unset RISC0_DEV_MODE
cargo build --release -q
BIN="$CARGO_TARGET_DIR/release/policy-replay"
state=demo/state0.json
for p in demo/proposals/*.json; do
  n=$(basename "$p" .json)
  out="$OUT_ROOT/$n"
  echo "== proposal $n -> $out"
  "$BIN" demo/policy.json "$state" "$p" "$out"
  state="$out/next_state.json"
done
echo "done. submit with: for r in $OUT_ROOT/*; do node scripts/submit.mjs \"\$r\"; done"
