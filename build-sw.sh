#!/bin/bash
# Build transpiled service worker files from source
# Requires: esbuild (npm install -g esbuild)

set -e

echo "Building service worker files..."

# Background
esbuild background/background.js \
  --bundle=false \
  --target=es2020 \
  --supported:async-await=false \
  --outfile=background/background-sw.js \
  --format=iife \
  2>/dev/null || echo "Note: esbuild not available. Using source files directly."

esbuild background/message-handlers.js \
  --bundle=false \
  --target=es2020 \
  --supported:async-await=false \
  --outfile=background/message-handlers-sw.js \
  --format=iife \
  2>/dev/null || true

# Analysis
esbuild analysis/analysis-module.js \
  --bundle=false \
  --target=es2020 \
  --supported:async-await=false \
  --outfile=analysis/analysis-module-sw.js \
  --format=iife \
  2>/dev/null || true

esbuild analysis/selector-cache.js \
  --bundle=false \
  --target=es2020 \
  --supported:async-await=false \
  --outfile=analysis/selector-cache-sw.js \
  --format=iife \
  2>/dev/null || true

echo "✅ Build complete"
