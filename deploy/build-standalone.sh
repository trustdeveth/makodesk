#!/usr/bin/env sh
# Build and assemble the self-contained server in .next/standalone
set -e
cd "$(dirname "$0")/.."
npm ci --no-audit --no-fund
npm run build
cp -r public .next/standalone/
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/
mkdir -p logs
echo "Standalone bundle ready: .next/standalone/server.js"
