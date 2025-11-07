# Research: Cooking Schedule Planner

## Data Source for Food Profiles
- **Decision**: Ship a curated JSON dataset embedded into the Go binary and reloadable for tests.
- **Rationale**: The initial feature only needs a stable catalog of foods and cook durations, and embedding keeps deployment simple while ensuring deterministic tests.
- **Alternatives considered**:
  - **PostgreSQL/SQLite database**: Rejected for added operational burden without multi-user persistence.
  - **Remote API lookup**: Rejected due to latency, offline dependency, and lack of reliable endpoints.

## Backend Assertion Strategy for TDD
- **Decision**: Use Go's standard `testing` package with helper functions inside test files instead of third-party assertion libraries.
- **Rationale**: Keeps dependencies minimal, aligns with "no frameworks" directive, and still supports expressive failure messages via helper helpers.
- **Alternatives considered**:
  - **Stretchr/testify**: Provides rich assertions but adds an external dependency that conflicts with simplicity goals.
  - **GoConvey**: Too heavyweight and introduces opinionated tooling.

## Clean Architecture Layering in Go
- **Decision**: Organize code into `domain`, `usecase`, `adapters`, and `interfaces/http` packages under `internal/`, with interfaces defined in the domain and concrete implementations in adapters.
- **Rationale**: Matches clean architecture principles (independent domain layer, dependency inversion) while aligning with Go conventions for package organization.
- **Alternatives considered**:
  - **MVC style handlers**: Simpler but couples HTTP layer to business logic, hindering testability.
  - **DDD aggregate-heavy structure**: Overkill for current scope and would increase ceremony.

## Timer & Alert Responsibility Split
- **Decision**: Keep timer countdown and alert scheduling in the browser using the Web Notifications API plus fallback DOM cues, while the backend exposes schedule data and optional sync endpoints.
- **Rationale**: Client-side timers avoid server load, work offline after plan generation, and meet responsiveness requirements (<200ms) more reliably.
- **Alternatives considered**:
  - **Server-push/WebSocket timers**: Adds infrastructure complexity and risks timer drift due to network latency.
  - **Pure backend cron-style alerts**: Not feasible for single-page cooking aid scenario.

## Progressive Enhancement Tooling
- **Decision**: Use HTMX for form submission/partial refreshes and Alpine.js for minimal stateful UI (timer controls), both loaded from CDN with integrity hashes.
- **Rationale**: Provides interactive behavior without heavy frameworks, aligns with user's allowance for HTMX/Alpine, and keeps HTML as the primary UI layer.
- **Alternatives considered**:
  - **Plain JavaScript only**: Possible but would require more boilerplate for DOM updates.
  - **Full SPA frameworks**: Explicitly disallowed and unnecessary for scope.
