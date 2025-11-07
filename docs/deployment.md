# Deployment Guide

## Environment Overview
- **Runtime**: Go 1.22 binary serving HTTPS on port 8443 (self-signed certificate for local development).
- **Static assets**: Served from `web/static` and templates under `web/templates`.
- **State**: Plans and timer sessions are persisted in memory; production deployments should replace in-memory stores with durable backing (Redis, database, etc.).

## Build & Release
1. Run tests and benchmarks before packaging:
   ```bash
   go test ./...
   go test -bench=. ./test/domain -run=^$
   ```
2. Build the binary:
   ```bash
   go build -o bin/cooking-times ./cmd/server
   ```
3. Bundle TLS certificates and static assets with the release artifact or mount them via configuration management.

## TLS Certificates
- Development certificates live under `cmd/server/certs/` and are valid for 365 days.
- For production, provision certificates via an automated service (e.g., Let’s Encrypt) and update `certPath`/`keyPath` in `cmd/server/main.go` or expose via environment variables.
- Schedule certificate rotation at least 30 days before expiry. Document the rotation in ops runbooks and verify the server reloads new keys without downtime.

## Configuration Checklist
- [ ] Environment variables defined for certificate paths and any future feature flags.
- [ ] Logging destination configured (stdout by default; connect to central log collector in prod).
- [ ] Monitoring hooks consume plan generation and timer latency logs for alerting.
- [ ] CORS/network policies allow Notification API if served over HTTPS with valid cert.
- [ ] Browser notification permissions communicated to users post-deployment.

## Rollback Plan
- Maintain the previous binary and certificates. If issues arise, redeploy the prior artifact and restore in-memory state from backup (if implemented) or notify users to regenerate plans.
