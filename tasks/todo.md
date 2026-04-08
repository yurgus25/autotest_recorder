# Tier Access Rollout (Step 1)

## Checklist

- [x] Prepare task docs and review structure
- [x] Add `ActionCatalog` and `AccessPolicy` with `can()` / `getCapabilities()`
- [x] Extend license contract in storage (`free/premium/b2b` placeholders)
- [x] Wire background guards with allow-by-default rollout
- [x] Wire UI visibility layer for premium/b2b markers (`hide completely`)
- [x] Add i18n keys and keep js/sw handlers in sync
- [x] Run verification and record results

## Progress Notes

- Plan accepted. Step 1 keeps existing behavior by default.
- Premium/B2B checks are introduced as infrastructure only.

## Review

- Baseline behavior unchanged with rollout disabled: pass (policy defaults to allow when `tierAccessRolloutEnabled !== true`)
- New access API (`CHECK_ACCESS`) sanity check: pass (`background.js` + `background-sw.js` expose case)
- UI visibility checks for gated elements: pass in code (`popup` checks `[data-access-action]` via `CHECK_ACCESS`)
- Existing recording/editing/analysis smoke tests: partial (static validation + lints + JSON parse done; browser E2E/manual run not executed in this step)
