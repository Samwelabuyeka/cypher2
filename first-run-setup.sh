#!/usr/bin/env bash

# CypherCoin first-run bootstrap for fresh machines.
# - Best-effort installs Docker + Compose (Linux/macOS)
# - Imports upstream source repos (Freqtrade, Hummingbot, go-ethereum)
# - Starts local persistent cloud stack
# - Optional native AI install (Ollama + model)
# - Writes setup marker at .cypher/setup.done

set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MARKER_DIR="$ROOT_DIR/.cypher"
MARKER_FILE="$MARKER_DIR/setup.done"
UPSTREAM_DIR="$ROOT_DIR/upstream-sources"
STRIPPED_DIR="$ROOT_DIR/upstream-sources-stripped"
SUDO_CMD="sudo"

log() { echo "[INFO] $*"; }
warn() { echo "[WARN] $*"; }
err() { echo "[ERROR] $*"; }

have_cmd() { command -v "$1" >/dev/null 2>&1; }

as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
    return $?
  fi

  if have_cmd "$SUDO_CMD"; then
    "$SUDO_CMD" "$@"
    return $?
  fi

  return 1
}

detect_os() {
  case "$(uname -s)" in
    Linux*) echo "linux" ;;
    Darwin*) echo "macos" ;;
    *) echo "unknown" ;;
  esac
}

install_docker_linux() {
  if have_cmd docker; then
    log "Docker already present."
    return 0
  fi

  if have_cmd apt-get; then
    log "Installing Docker via apt-get (best effort)."
    as_root apt-get update && as_root apt-get install -y docker.io || return 1
    as_root systemctl enable --now docker >/dev/null 2>&1 || true
    return 0
  fi

  if have_cmd dnf; then
    log "Installing Docker via dnf (best effort)."
    as_root dnf install -y docker docker-compose-plugin || return 1
    as_root systemctl enable --now docker >/dev/null 2>&1 || true
    return 0
  fi

  if have_cmd yum; then
    log "Installing Docker via yum (best effort)."
    as_root yum install -y docker docker-compose-plugin || return 1
    as_root systemctl enable --now docker >/dev/null 2>&1 || true
    return 0
  fi

  return 1
}

install_docker_macos() {
  if have_cmd docker; then
    log "Docker already present."
    return 0
  fi

  if ! have_cmd brew; then
    warn "Homebrew not found. Install Docker Desktop manually: https://docs.docker.com/desktop/setup/install/mac-install/"
    return 1
  fi

  log "Installing Docker Desktop cask (best effort)."
  brew install --cask docker || return 1
  warn "If Docker daemon is not running yet, open Docker Desktop once before re-running this script."
  return 0
}

docker_compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    echo "docker compose"
    return 0
  fi

  if have_cmd docker-compose; then
    echo "docker-compose"
    return 0
  fi

  echo ""
  return 1
}

install_compose_linux() {
  if docker compose version >/dev/null 2>&1 || have_cmd docker-compose; then
    log "Docker Compose already present."
    return 0
  fi

  if have_cmd apt-get; then
    local pkg
    for pkg in docker-compose-plugin docker-compose-v2 docker-compose; do
      as_root apt-get install -y "$pkg" >/dev/null 2>&1 || true
    done
  elif have_cmd dnf; then
    as_root dnf install -y docker-compose-plugin >/dev/null 2>&1 || true
  elif have_cmd yum; then
    as_root yum install -y docker-compose-plugin >/dev/null 2>&1 || true
  fi

  if docker compose version >/dev/null 2>&1 || have_cmd docker-compose; then
    log "Docker Compose installed."
    return 0
  fi

  return 1
}

ensure_docker_daemon() {
  if docker info >/dev/null 2>&1; then
    return 0
  fi

  if have_cmd systemctl; then
    as_root systemctl start docker >/dev/null 2>&1 || true
  fi

  if ! docker info >/dev/null 2>&1; then
    warn "Docker daemon is not reachable. Start Docker and rerun to launch stack."
    return 1
  fi

  return 0
}

clone_or_update_repo() {
  local name="$1"
  local url="$2"
  local dest="$UPSTREAM_DIR/$name"

  if [ -d "$dest/.git" ]; then
    log "Updating $name..."
    git -C "$dest" pull --ff-only || warn "$name update failed; keeping existing clone."
    return 0
  fi

  log "Cloning $name..."
  git clone "$url" "$dest" || warn "$name clone failed."
}

strip_repo_for_local_use() {
  local name="$1"
  local source_dir="$UPSTREAM_DIR/$name"
  local target_dir="$STRIPPED_DIR/$name"

  if [ ! -d "$source_dir" ]; then
    warn "Cannot strip $name because source clone is missing."
    return 0
  fi

  mkdir -p "$STRIPPED_DIR"

  if ! have_cmd rsync; then
    warn "rsync not installed; skipping stripped copy for $name."
    return 0
  fi

  log "Creating stripped local-use copy for $name..."
  rsync -a --delete \
    --exclude ".git/" \
    --exclude ".github/" \
    --exclude ".gitlab/" \
    --exclude ".devcontainer/" \
    --exclude ".idea/" \
    --exclude ".vscode/" \
    --exclude "docs/" \
    --exclude "documentation/" \
    --exclude "tests/" \
    --exclude "__pycache__/" \
    --exclude "node_modules/" \
    --exclude ".pytest_cache/" \
    --exclude ".mypy_cache/" \
    --exclude "*.log" \
    "$source_dir/" "$target_dir/" || warn "Failed creating stripped copy for $name."
}

install_native_ai() {
  printf "\nInstall native local AI runtime (Ollama) now? [y/N]: "
  read -r install_ai

  case "$install_ai" in
    y|Y|yes|YES)
      ;;
    *)
      log "Skipping local AI install."
      return 0
      ;;
  esac

  if ! have_cmd ollama; then
    local os
    os="$(detect_os)"

    if [ "$os" = "linux" ] && have_cmd curl; then
      log "Installing Ollama (Linux)."
      curl -fsSL https://ollama.com/install.sh | sh || warn "Ollama install script failed."
    elif [ "$os" = "macos" ] && have_cmd brew; then
      log "Installing Ollama (macOS via Homebrew)."
      brew install ollama || warn "Failed to install Ollama with Homebrew."
    else
      warn "Cannot auto-install Ollama on this machine. Install manually from https://ollama.com/download"
    fi
  fi

  if ! have_cmd ollama; then
    warn "Ollama unavailable; skipping model pull."
    return 0
  fi

  local default_model="llama3.2:3b"
  printf "Choose local AI model to pull [%s]: " "$default_model"
  read -r selected_model
  selected_model="${selected_model:-$default_model}"

  log "Pulling model: $selected_model"
  ollama pull "$selected_model" || warn "Failed to pull model '$selected_model'."
}

start_local_stack() {
  local compose_cmd
  compose_cmd="$(docker_compose_cmd)"

  if [ -z "$compose_cmd" ]; then
    warn "No Docker Compose command detected; cannot start local stack."
    return 0
  fi

  ensure_docker_daemon || return 0

  log "Starting local persistent cloud stack (standalone-node/docker-compose.yml)."
  (
    cd "$ROOT_DIR/standalone-node" || exit 1
    $compose_cmd up -d
  ) || warn "Failed to start local stack."
}

main() {
  log "CypherCoin first-run setup starting..."

  mkdir -p "$MARKER_DIR" "$UPSTREAM_DIR" "$STRIPPED_DIR"

  local os
  os="$(detect_os)"
  if [ "$os" = "linux" ]; then
    install_docker_linux || warn "Docker auto-install failed on Linux; continue manually if needed."
    install_compose_linux || warn "Compose auto-install failed on Linux; continue manually if needed."
  elif [ "$os" = "macos" ]; then
    install_docker_macos || warn "Docker auto-install failed on macOS; continue manually if needed."
  else
    warn "Unsupported OS for auto-install: $(uname -s)."
  fi

  clone_or_update_repo "freqtrade" "https://github.com/freqtrade/freqtrade.git"
  strip_repo_for_local_use "freqtrade"
  clone_or_update_repo "hummingbot" "https://github.com/hummingbot/hummingbot.git"
  strip_repo_for_local_use "hummingbot"
  clone_or_update_repo "go-ethereum" "https://github.com/ethereum/go-ethereum.git"
  strip_repo_for_local_use "go-ethereum"

  start_local_stack
  install_native_ai

  if have_cmd node; then
    log "Preparing persistent 10-year trade dataset + AI corpus (best effort)."
    if have_cmd python3; then
      python3 "$ROOT_DIR/scripts/fetch-trade-data-10y.py" || warn "Trade data fetch failed."
    else
      node "$ROOT_DIR/scripts/fetch-trade-data-10y.mjs" || warn "Trade data fetch failed."
    fi
    node "$ROOT_DIR/scripts/train-ai-from-market-data.mjs" || warn "AI corpus generation failed."
  else
    warn "Node.js not found; skipping market-data and AI corpus preparation."
  fi

  {
    echo "setup_completed_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo "host_os=$(uname -s)"
    echo "host_arch=$(uname -m)"
    echo "upstream_sources_dir=$UPSTREAM_DIR"
    echo "stripped_sources_dir=$STRIPPED_DIR"
  } > "$MARKER_FILE"

  log "Setup complete. Marker written: $MARKER_FILE"
}

main "$@"
