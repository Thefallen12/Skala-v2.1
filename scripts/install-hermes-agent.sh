#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Installer resmi NousResearch/hermes-agent untuk Skala Prioritas ERP
# Menjalankan instalasi hermes-agent dan mengaktifkan OpenAI-compatible API
# Server pada port 8642 untuk integrasi dengan Skala Prioritas Chat / Hermes.
#
# Opsi environment variable:
#   INTERACTIVE_INSPECT=true   Tampilkan isi install.sh via less sebelum eksekusi
# ==============================================================================

# Installer resmi NousResearch/hermes-agent untuk Skala Prioritas ERP
curl -fsSLO https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh
if [ "${INTERACTIVE_INSPECT:-false}" = "true" ]; then
  less install.sh
fi
bash install.sh

echo ""
echo "Mengaktifkan konfigurasi Gemini API & OpenAI-compatible API Server Hermes di port 8642..."
if command -v hermes >/dev/null 2>&1; then
  if [ -n "${API_KEY_GEMINI:-${GEMINI_API_KEY:-}}" ]; then
    hermes config set GEMINI_API_KEY "${API_KEY_GEMINI:-${GEMINI_API_KEY:-}}" || true
  fi
  hermes config set API_SERVER_ENABLED true || true
  echo "Silakan set API key opsional dengan: hermes config set API_SERVER_KEY <rahasia>"
  echo "Atau set Gemini key via: hermes config set GEMINI_API_KEY \"\$API_KEY_GEMINI\""
  echo "Lalu jalankan gateway: hermes gateway"
fi
