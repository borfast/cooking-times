---
description: "Task list for Cooking Schedule Planner"
---

# Tasks: Cooking Schedule Planner

**Input**: Design documents from `/specs/001-schedule-cook-timer/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Automated tests are mandatory. Define unit, integration, regression, and performance validation tasks before implementation work begins.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions
- **Single project**: `cmd/`, `internal/`, `web/`, `test/` at repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Initialize Go module in `go.mod` and enable module-aware builds
- [X] T002 Create clean architecture directory skeleton under `cmd/server`, `internal/`, `web/`, and `test/`
- [X] T003 Add `Makefile` with `fmt`, `lint`, and `test` targets in `Makefile`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Generate self-signed TLS certificate and key for localhost HTTPS in `cmd/server/certs/`
- [X] T005 Bootstrap HTTP server entrypoint with TLS listener in `cmd/server/main.go`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Plan a multi-item cook (Priority: P1) 🎯 MVP

**Goal**: Users can assemble foods, choose start or finish time, and receive an ordered cooking schedule.

**Independent Test**: Generate a plan for three foods and verify the returned steps align with expected start offsets and total duration.

### Tests for User Story 1 (MANDATORY - author before implementation) ⚠️

- [X] T006 [P] [US1] Author schedule generation unit tests in `test/domain/schedule_plan_test.go`
- [X] T007 [P] [US1] Author HTTP plan generation handler tests in `test/usecase/plan_handler_test.go`

### Implementation for User Story 1

- [X] T008 [US1] Implement scheduling domain entities and calculator in `internal/domain/schedule.go`
- [X] T009 [P] [US1] Implement plan orchestration use case in `internal/usecase/plan_service.go`
- [X] T010 [US1] Implement food repository loader with embedded JSON in `internal/adapters/storage/food_repository.go`
- [X] T011 [P] [US1] Seed baseline food dataset in `internal/adapters/storage/foods.json`
- [X] T012 [US1] Implement plan generation HTTP handlers and routing in `internal/interfaces/http/plan_handler.go`
- [X] T013 [P] [US1] Build planner form template and shared layout in `web/templates/plan.html`
- [X] T014 [P] [US1] Add planner-facing CSS using modern layout in `web/static/css/planner.css`
- [X] T015 [P] [US1] Implement HTMX interactions for plan submission in `web/static/js/plan.js`

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Follow cooking reminders (Priority: P2)

**Goal**: Users can start the timer, receive alerts for each step, and pause/resume without losing progress.

**Independent Test**: Start the timer with sample data, simulate pause/resume cycles, and verify alerts trigger within the 200 ms budget while state persists.

### Tests for User Story 2 (MANDATORY - author before implementation) ⚠️

- [X] T016 [P] [US2] Author timer session domain tests covering alert timing in `test/domain/timer_session_test.go`
- [X] T017 [P] [US2] Author integration tests for timer state endpoints in `test/usecase/timer_handler_test.go`
- [X] T018 [P] [US2] Author plan recovery integration tests in `test/usecase/timer_restore_test.go`
- [X] T019 [P] [US2] Author plan retrieval endpoint tests in `test/usecase/get_plan_handler_test.go`
- [X] T020 [P] [US2] Author timer performance budget test in `test/e2e/timer_performance_test.go`

### Implementation for User Story 2

- [X] T021 [US2] Implement timer session domain support in `internal/domain/timer_session.go`
- [X] T022 [P] [US2] Implement timer session use case for pause/resume in `internal/usecase/timer_session_service.go`
- [X] T023 [US2] Implement timer state HTTP endpoints in `internal/interfaces/http/timer_handler.go`
- [X] T024 [US2] Implement plan retrieval use case in `internal/usecase/get_plan_service.go`
- [X] T025 [US2] Implement plan retrieval HTTP endpoint in `internal/interfaces/http/get_plan_handler.go`
- [X] T026 [P] [US2] Implement client-side timer controller with Alpine.js in `web/static/js/timer.js`
- [X] T027 [P] [US2] Implement notification and accessibility cues in `web/static/js/notifications.js`
- [X] T028 [P] [US2] Implement local storage persistence and resume helper in `web/static/js/storage.js`
- [X] T029 [P] [US2] Integrate plan recovery bootstrapping and timer controls in `web/templates/plan.html`
- [X] T030 [P] [US2] Instrument timer latency metrics in `web/static/js/timer_metrics.js`

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Adjust plan mid-session (Priority: P3)

**Goal**: Users can modify active plans (add/remove foods, adjust durations) and receive updated steps and alerts without restarting the session.

**Independent Test**: Modify an active plan by removing one item and extending another’s duration, then verify recalculated steps and alerts align with expectations.

### Tests for User Story 3 (MANDATORY - author before implementation) ⚠️

- [X] T031 [P] [US3] Author plan adjustment unit tests in `test/domain/plan_adjustment_test.go`
- [X] T032 [P] [US3] Author integration tests for plan recalculation endpoint in `test/usecase/recalculate_handler_test.go`

### Implementation for User Story 3

- [X] T033 [US3] Implement domain logic for plan edits and state transitions in `internal/domain/plan_update.go`
- [X] T034 [P] [US3] Implement recalculation use case in `internal/usecase/recalculate_service.go`
- [X] T035 [US3] Extend HTTP API for plan recalculation in `internal/interfaces/http/recalculate_handler.go`
- [X] T036 [P] [US3] Implement client-side plan editing controls in `web/static/js/plan_edit.js`
- [X] T037 [P] [US3] Update planner template for editable rows in `web/templates/plan.html`

**Checkpoint**: All user stories should now be independently functional

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T038 Audit accessibility (axe + NVDA) and address findings in `web/templates/` and `web/static/css/`
- [X] T039 Add performance benchmarks for schedule generation in `test/domain/benchmark_schedule_test.go`
- [X] T040 Add logging hooks for timing metrics in `internal/usecase/plan_service.go`
- [X] T041 Document developer quickstart updates in `quickstart.md`
- [X] T042 Prepare deployment checklist and TLS rotation notes in `docs/deployment.md`
- [ ] T043 Capture moderated usability test results for planning workflow in `docs/usability/plan-study.md`
- [ ] T044 Collect post-session reminder feedback and summarize findings in `docs/feedback/reminder-survey.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Depends on completion of User Story 1 (plan data required)
- **User Story 3 (P3)**: Depends on completion of User Story 1 and timer session support from User Story 2

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Models before services
- Services before endpoints
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- All tests for a user story marked [P] can run in parallel
- Models within a story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2
   - Developer C: User Story 3
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
