# Background Script Build

## Architecture

The background service worker uses **transpiled** versions of source files:

| Source File (editable) | Transpiled File (generated) | Notes |
|---|---|---|
| `background.js` | `background-sw.js` | Main TestManager class |
| `message-handlers.js` | `message-handlers-sw.js` | Message handler registrations |
| `message-registry.js` | — | Used directly via importScripts |
| `feature-flags.js` | — | Used directly via importScripts |

Similarly for analysis:
| `analysis/analysis-module.js` | `analysis/analysis-module-sw.js` | Analysis module |
| `analysis/selector-cache.js` | `analysis/selector-cache-sw.js` | Selector cache |

## Why Transpile?

Chrome MV3 service workers don't support all modern JS features reliably.
The `-sw.js` files use `__async()` polyfill instead of native async/await.

## How to Build

Install esbuild:
```bash
npm install -g esbuild
```

Build transpiled service worker files:
```bash
./build-sw.sh
```

## Important

- **NEVER edit `-sw.js` files directly** — they will be overwritten by the build
- Always edit the source files and rebuild
- The `manifest.json` points to `background-sw.js` as the service worker entry
