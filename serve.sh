#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Starting Horcrux Hunter at http://127.0.0.1:5173"
echo "Press Ctrl+C to stop"
npm run dev -- --host 127.0.0.1
