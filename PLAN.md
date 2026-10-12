# AirBear Completion Plan

Branch: `ocs/completion-audit` (base: `test`, the repo default branch)

## Baseline established

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run check` (tsc) | exit 0 |
| Lint | `npm run lint` (eslint --max-warnings=0) | exit 0 |
| Build | `npm run build` | exit 0 |
| API smoke (mock DB) | health/spots/airbears/bodega | ok, 17/10/26 records |
| Playwright e2e/airbear-e2e.spec.ts | 21 tests, 1 worker | 21 passed (exit 0) |
| Playwright e2e/user-driver-workflows.spec.ts | 8 tests | all fail — selectors/routes describe a UI that does not exist |
| Playwright e2e/lighthouse.spec.ts | 1 test | impossible: `require()` inside `page.evaluate`, deps not installed, `execSync('npm run dev')` blocks forever |
| `.agent/workflows/validate.md` step 4 | `playwright test tests/app-flow.spec.ts` | "No tests found" — file outside testDir `./e2e` |
| npm audit | `npm audit` | 21 vulns: 1 critical (proxy-addr), 12 high, 8 moderate |

## Work items

### 1. Dependency vulnerabilities
- Run `npm audit fix` (non-breaking).
- Add targeted `overrides` for anything left (e.g. `braces` where the auto-fix demands a tailwindcss 4 major bump — override the transitive version instead).
- Re-run tsc/lint/build/e2e after.

### 2. Align e2e suite with the app (suite must be green, tests must assert the real product)
- `e2e/user-driver-workflows.spec.ts`: rewrite against actual routes (`/auth` not `/login`), actual testids (`button-sign-in`, `tab-signin`, ...), actual flows (register user, login, book ride from map page via spot selection, checkout; driver register/login, driver-dashboard). Same coverage intent, no invented UI.
- `e2e/lighthouse.spec.ts`: rewrite as PWA/SEO/a11y smoke checks executed in Node context with Playwright only (no new deps): manifest fields, service worker registration, meta description/theme-color, single h1, aria landmarks, image alt text, label associations. Keep the original spec's intent (perf/a11y/bp/seo gates) with tools the repo already has.
- `tests/*.spec.ts`: move `app-flow.spec.ts`, `production.spec.ts`, `example.spec.ts` into `e2e/` so the documented validation command and the suite actually include them. Update `.agent/workflows/validate.md` to run the full `npx playwright test`.

### 3. Feature/docs audit (README is the contract)
- Walk README features against the app: triple-role auth, ride booking, driver dashboard, bodega cart/checkout, payments (Stripe/cash/promise), PWA install/offline, CEO t-shirt promo, challenges/rewards.
- Fill only gaps that are small, real, and materially complete the product (fix broken wiring, not new features). Verify manually via the running server.

### 4. a11y + PWA hygiene pass
- Check main pages: landmarks, form labels, alt text, focus states, viewport meta + manifest for installability.

## Done condition
- `npm run check`, `npm run lint`, `npm run build` exit 0.
- Full Playwright suite (all specs, 1 worker locally to fit container memory) exits 0.
- API smoke against mock-DB build passes.
- `npm audit`: zero critical; remaining high/moderate justified in report.
- Diff self-review: no blockers. Conventional commits. PR to `test` with validation report. Do not merge.
