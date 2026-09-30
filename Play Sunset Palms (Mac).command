#!/bin/bash
# Double-click to play on macOS (or run ./"Play Sunset Palms (Mac).command" on Linux).
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node.js is not installed."
  echo "  Download the LTS version from https://nodejs.org, install it, then double-click this file again."
  echo ""
  read -r -p "Press Enter to close."
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "First run: installing the game's tools. This takes a minute..."
  npm install || { read -r -p "Install failed. Press Enter to close."; exit 1; }
fi
echo ""
echo "  Starting Sunset Palms... your browser will open by itself (usually http://localhost:5173)"
echo "  Leave this window open while you play. Close it to stop the game."
echo ""
npm run play
