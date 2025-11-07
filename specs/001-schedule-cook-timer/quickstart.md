# Quickstart: Cooking Schedule Planner

## Prerequisites
- Go 1.22 or newer on your PATH
- Make (optional) for convenience scripts
- Modern browser (Chrome, Firefox, Safari) with notifications enabled for localhost

## Install Dependencies
- Go modules are fetched automatically; run `make tidy` (or `go mod tidy`) after introducing new imports.
- Front-end dependencies (HTMX, Alpine.js) are loaded via CDN with Subresource Integrity (SRI) hashes—no npm install required.

## Run the Server
```bash
go run ./cmd/server
```
The server listens on `https://localhost:8443` (self-signed certificate) to allow Notification API usage. Accept the certificate warning in your browser on first launch.

## Execute Tests (TDD Workflow)
```bash
go test ./...
go test -bench=. ./test/domain -run=^$
```
- Domain tests live under `test/domain` (unit specs + benchmarks)
- Use case integration tests live under `test/usecase`
- HTTP handler and end-to-end/performance checks live under `test/e2e`

## Regenerate Static Assets
- CSS resides in `web/static/css`. Use modern CSS (Flexbox/Grid); preserve accessibility helpers (focus outlines, skip links).
- JS enhancements live in `web/static/js`. Timer logic spans `plan.js`, `timer.js`, `plan_edit.js`, plus storage/notification helpers—keep them framework-free beyond HTMX/Alpine.

## Configuration
- Embedded food datasets live at `internal/adapters/storage/foods.json`. Update the JSON and re-run `go test` to validate schedules.
- Feature flags are exposed via environment variables (set in `cmd/server/main.go`). Document any new env vars here when introduced.
- Timer notifications rely on the Web Notifications API—users must allow browser permission on first run.

## Development Workflow Tips
1. Write failing unit tests for domain scheduling logic before implementing changes.
2. Use `go test ./... -run TestSchedule` to focus on specific suites.
3. For frontend tweaks, run the server and rely on HTMX partial reloads for quick feedback. The timer panel restores state from `localStorage`; clear storage between experiments if needed.
4. Keep clean architecture boundaries intact: HTTP handlers delegate to use cases, which depend on domain interfaces. Persisted plans and timer sessions flow through the in-memory stores.
5. Accessibility regressions must be checked with axe (browser extension) and NVDA for every significant UI change; summarize findings in PR descriptions along with mitigations.
