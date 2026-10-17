#!/usr/bin/env bash
# Runs a Minera rig on a Linux GPU machine you rent or own (Ubuntu or Debian, GPU driver installed,
# as GPU rental images ship). Read it before you run it: https://mineragpu.tech/rig.sh
#
#   curl -fsSLO https://mineragpu.tech/rig.sh
#   OPERATOR=0xYourWallet PAIR=<code from the Deploy page> bash rig.sh
#
# With PAIR, as the Deploy page writes it: installs Node.js 22, a local model runtime and the node
# client, pairs this machine with the Deploy page and waits there. Deploy the rig on the page from
# the operator wallet, and the node starts in the background on its own.
#
# Without PAIR: the first run installs everything, creates the node key and prints the node address
# and deploy code to paste on the Deploy page; run the script again after deploying to start the node.
#
# Options, as environment variables:
#   OPERATOR     the wallet that deploys and operates the rig (required)
#   PAIR         the one-time code from the Deploy page, which shows the whole command
#   NETWORK      mainnet (default) or testnet
#   AUTO_CLAIM   claim the operator's rewards once at least this much ETH is claimable, e.g. 0.001
#   WORKSPACE    where the key, settings, models and logs live; /workspace when it exists (the volume
#                most rental hosts keep across restarts), otherwise ~/minera
#
# Back up "$WORKSPACE/.config/minera/node-key.json". If it is lost, the rig must be deployed again.

set -euo pipefail

if [ "$(uname -s)" != "Linux" ]; then
  echo "This script is for Linux GPU machines. On Windows or macOS, follow https://mineragpu.tech/docs/quickstart" >&2
  exit 64
fi

NETWORK="${NETWORK:-mainnet}"
OPERATOR="${OPERATOR:?Set OPERATOR to the wallet that will deploy and operate the rig}"
AUTO_CLAIM="${AUTO_CLAIM:-}"
PAIR="${PAIR:-}"
MINER_VERSION="1.2.0"
if [ -z "${WORKSPACE:-}" ]; then
  if [ -d /workspace ]; then WORKSPACE=/workspace; else WORKSPACE="$HOME/minera"; fi
fi

case "$NETWORK" in
  mainnet | testnet) ;;
  *) echo "NETWORK must be mainnet or testnet." >&2; exit 64 ;;
esac
if ! [[ "$OPERATOR" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
  echo "OPERATOR must be a wallet address: 0x followed by 40 hexadecimal characters." >&2
  exit 64
fi
if [ -n "$PAIR" ] && ! [[ "$PAIR" =~ ^[0-9a-f]{32}$ ]]; then
  echo "PAIR must be the 32-character code from the Deploy page. Copy the whole command again." >&2
  exit 64
fi
if [ -n "$AUTO_CLAIM" ] && ! [[ "$AUTO_CLAIM" =~ ^[0-9]{1,3}(\.[0-9]{1,18})?$ ]]; then
  echo "AUTO_CLAIM must be an amount of ETH, such as 0.001." >&2
  exit 64
fi

export XDG_CONFIG_HOME="$WORKSPACE/.config"
export OLLAMA_MODELS="$WORKSPACE/models"
export OLLAMA_HOST=127.0.0.1:11434
mkdir -p "$XDG_CONFIG_HOME" "$OLLAMA_MODELS"
KEY_FILE="$XDG_CONFIG_HOME/minera/node-key.json"
LOG="$WORKSPACE/rig.log"
SUDO=()
if [ "$(id -u)" -ne 0 ]; then SUDO=(sudo); fi

say() { printf '\n==> %s\n' "$*"; }

# 1. The tools the steps below need.
if command -v apt-get >/dev/null 2>&1; then
  missing=()
  for tool in curl tar xz zstd; do
    command -v "$tool" >/dev/null 2>&1 || missing+=("$tool")
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    say "Installing ${missing[*]}"
    "${SUDO[@]}" apt-get update -qq
    "${SUDO[@]}" apt-get install -y -qq curl ca-certificates tar xz-utils zstd >/dev/null
  fi
fi

# 2. Node.js 22 from the official release, checked against its published SHA-256.
if ! node -v 2>/dev/null | grep -qE '^v(2[2-9]|[3-9][0-9])\.'; then
  say "Installing Node.js 22"
  arch="$(uname -m)"
  case "$arch" in
    x86_64) arch=x64 ;;
    aarch64) arch=arm64 ;;
  esac
  base=https://nodejs.org/dist/latest-v22.x
  sums="$(curl -fsSL "$base/SHASUMS256.txt")"
  file="$(printf '%s\n' "$sums" | awk -v want="linux-$arch.tar.xz" '$2 ~ want"$" {print $2; exit}')"
  sum="$(printf '%s\n' "$sums" | awk -v f="$file" '$2 == f {print $1}')"
  tmp="$(mktemp -d)"
  curl -fsSL "$base/$file" -o "$tmp/$file"
  echo "$sum  $tmp/$file" | sha256sum -c - >/dev/null
  "${SUDO[@]}" tar -xJf "$tmp/$file" -C /usr/local --strip-components=1
  rm -rf "$tmp"
fi
say "Node.js $(node -v)"

# 3. A local model runtime, listening on this machine only.
if ! command -v ollama >/dev/null 2>&1; then
  say "Installing the model runtime"
  curl -fsSL https://ollama.com/install.sh | "${SUDO[@]}" sh
fi
if ! curl -fsS "http://$OLLAMA_HOST/api/version" >/dev/null 2>&1; then
  say "Starting the model runtime"
  nohup ollama serve >>"$WORKSPACE/runtime.log" 2>&1 &
  for _ in $(seq 1 30); do
    curl -fsS "http://$OLLAMA_HOST/api/version" >/dev/null 2>&1 && break
    sleep 1
  done
fi

# 4. The node client, pinned to a release.
if [ "$(rig --version 2>/dev/null || true)" != "$MINER_VERSION" ]; then
  say "Installing the node client $MINER_VERSION"
  "${SUDO[@]}" npm install --global --no-fund --no-audit "@minera-gpu/miner@$MINER_VERSION" >/dev/null
fi

# 5. With PAIR: hand this machine to the Deploy page and wait there until the rig is deployed. It
#    creates the node key when there is none.
if [ -n "$PAIR" ]; then
  say "Pairing with the Deploy page. Finish there; this waits until the rig is deployed."
  rig pair --code "$PAIR" --operator "$OPERATOR" --network "$NETWORK"
  echo "Back up $KEY_FILE somewhere safe."
# Without PAIR, the first run creates the node key and stops, so the rig can be deployed.
elif [ ! -f "$KEY_FILE" ]; then
  say "Creating the node key"
  rig init --operator "$OPERATOR" --network "$NETWORK"
  cat <<EOF

Next:
  1. Open https://mineragpu.tech/deploy and connect the operator wallet ($NETWORK).
  2. Paste the node address and the deploy code above, name the rig, choose its pair and send.
  3. Back up $KEY_FILE somewhere safe.
  4. Run this script again to start the node.
EOF
  exit 0
fi

# 6. Start the node in the background, so it keeps running after the terminal closes. It keeps the
#    network's model installed, and claims for the operator when AUTO_CLAIM is set.
if pgrep -f "rig start" >/dev/null 2>&1; then
  say "The node is already running. Log: $LOG"
  exit 0
fi
args=(start --network "$NETWORK" --keep-model --concurrency 2)
if [ -n "$AUTO_CLAIM" ]; then args+=(--auto-claim "$AUTO_CLAIM"); fi
rig status --network "$NETWORK"
say "Starting the node on $NETWORK. Log: $LOG"
nohup rig "${args[@]}" >>"$LOG" 2>&1 &
sleep 5
tail -n 20 "$LOG"
echo
echo "Follow it with: tail -f $LOG"
