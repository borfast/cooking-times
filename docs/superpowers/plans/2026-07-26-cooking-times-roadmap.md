# Cooking Times — Remediation Roadmap (G1–G26)

**Source spec:** `docs/superpowers/specs/2026-07-25-cooking-times-design.md`
**Created:** 2026-07-26
**Purpose:** Decompose all 26 recorded gaps into five sequenced plans, each of which ships working, testable software on its own. This document is the tracking index; task-level detail lives in the per-phase plans.

## Why five plans and not one

Three of the gaps rewrite the schema or the scheduling core that the others build on, so order is load-bearing:

- Phase 1 must come first — until the scheduler is an importable pure module with tests, every later change is unverifiable.
- Phase 3 (data model) changes the shape of `foods.json` and of every persisted plan. Doing Phase 4 first would mean writing the resource scheduler against a schema that is about to be replaced.
- Phase 2 is deliberately early and self-contained: twelve user-visible defect fixes that need no schema change, so the app gets materially better before the redesign work starts.

## Recorded product decisions

These were decided with the user on 2026-07-26 and are binding on the phases below.

| # | Decision | Affects |
| --- | --- | --- |
| D5 | **Replacing a session confirms only mid-cook.** Starting a new plan silently replaces a finished or never-started session, but asks before discarding a `running` or `paused` one. | G1 |
| D6 | **Per-row `itemId` identity.** Duplicate foods are allowed; identity is never `foodId`. | G3 |
| D7 | **No migrations.** The tool has no users yet, so storage and data shapes may change freely. | Phases 3–5 |
| D1 | **Per-food cooking option sets.** Each food declares its own named options with durations. Steak keeps rare/medium/well-done; rice gets a single option; pasta gets al dente/soft. Replaces the forced three-tier `cookingTimes` object. | G21, G22 |
| D2 | **Capacity conflicts are user-selectable.** `warn` (default — report, change nothing), `stagger` (move dishes earlier; they finish early and keep warm), `extend` (move them later; the meal is ready later). *Corrected in Phase 4 — the original wording had `extend` push the common finish later, which cannot resolve overlap. See Phase 4 below.* | G13 |
| D3 | **Vendor Alpine and both font families locally** into `static/vendor/`. Makes the app work offline and makes SRI moot, since nothing loads from a third party. Every URL to be shown to the user before fetching. | G16, G17 |
| D4 | **Optional per-food rest period.** A food may declare a rest; it leaves the heat at `finish − rest` and is ready at `finish`, so resting meat lands with everything else. No per-dish serve offsets. | G25 |

## Phase index

### Phase 1 — Test harness and core extraction ✅
**Plan:** `2026-07-26-phase-1-test-harness-and-core-extraction.md`
**Closes:** G11, G20
**Ships:** Identical app behaviour, plus `static/js/core/` as tested ES modules and `npm test` running with zero installed dependencies.

The scheduling rule and the mid-cook recalculation become pure, importable, tested functions. Nothing else in this phase changes what a user sees.

### Phase 2 — Defect fixes ✅
**Plan:** `2026-07-26-phase-2-defect-fixes.md`
**Closes:** G1, G2, G3, G4, G5, G6, G7, G8, G9, G10, G12, G19
**Ships:** The same feature set with its twelve defects gone — replanning works, `localStorage` is written once per five seconds, missed alerts are summarised rather than shouted, errors are inline instead of modal, and the app has a dark mode. Duplicate foods were rejected here as a stopgap; Phase 3 replaced that with per-row identity.

G19 (dark mode) is folded in here rather than into Phase 5 because it is pure CSS and touches nothing the later phases restructure.

### Phase 3 — Data model ✅
**Plan:** `2026-07-26-phase-3-data-model.md`
**Closes:** G21, G22, G23, G24
**Ships:** Per-food cooking option sets (D1), per-row `itemId` identity (D6), per-dish time overrides, and user-defined foods persisted locally. No migration, per D7.

**Two deviations from the original description, both deliberate:**

- *Quantity and method as time modifiers* became a **per-dish time override**, remembered per food-and-option. Modelling quantity, thickness and method properly needs a thermal model; modelling them improperly means inventing coefficients and presenting fiction as arithmetic. The override lets the cook correct the number instead, which is also what G24 concretely asked for. G23 is therefore marked *partly* closed, not closed.
- *A migration for old saved plans* was dropped after the user confirmed the tool has no users yet (D7).

Repaid Phase 2's duplicate-rejection debt via D6. That also fixed a latent bug the register had missed: alert regeneration matched on `foodName`, so two portions of one food shared an alert and firing the first silenced the second.

### Phase 4 — Scheduling engine ✅
**Plan:** `2026-07-26-phase-4-scheduling-engine.md`
**Closes:** G13, G14, G25
**Ships:** Declared cooking capacity with the three conflict strategies (D2, as corrected below), a changeover-time buffer between starts, and rest periods (D4). This is where the "everything finishes together" promise becomes conditional and explicit rather than assumed.

**D2 was corrected during planning.** It recorded `extend` as "push the finish later to respect capacity", which is not achievable: with a common finish T, dish i occupies the heat over [T − rest − cook, T − rest], so raising T shifts every interval equally and the overlap is invariant. Overlap depends only on the durations, and any resolution must break the synchronised finish. Restated: `warn` reports and changes nothing; `stagger` moves dishes earlier so they finish early and keep warm (the food waits); `extend` moves them later so the meal is ready later (you wait). Put to the user on 2026-07-26 and confirmed.

The two placers are greedy heuristics, and their asymmetry is documented and tested: nothing can start before t=0, so `stagger` is best-effort — it can do nothing at all when every dish is the same length, and can never beat the ring-time a fixed total allows — whereas `extend` always has room later and always resolves. Residue is reported rather than hidden.

### Phase 5 — Platform and access
**Plan:** to be written on completion of Phase 4.
**Closes:** G15, G16, G17, G18, G26
**Ships:** Screen wake lock, fully offline operation with vendored assets (D3), installable PWA, a screen-reader-usable alert path, and an exportable/printable running order with wall-clock times.

## Coverage check

Every gap in the spec maps to exactly one phase:

| Phase | Gaps | Count |
| --- | --- | --- |
| 1 | G11, G20 | 2 |
| 2 | G1–G10, G12, G19 | 12 |
| 3 | G21, G22, G24 closed; G23 partly; G3 debt repaid | 4 |
| 4 | G13, G14; G25 closed for resting, serve order excluded by D4 | 3 |
| 5 | G15–G18, G26 | 5 |
| **Total** | | **26** |

## Spec corrections found while planning

Two claims in the spec were imprecise and are corrected as part of Phase 1:

- **G11** describes the two `calculateSchedule` copies as duplicated "verbatim" and "identical today". They are logically equivalent but not textually identical: `static/js/schedule.js:153` guards with `foods.length === 0` and throws on `null`, while `static/js/timer.js:119` guards with `!foods || foods.length === 0`. The timer's copy is the safer one, and the extracted module adopts it.
- **G11** also lists `formatTime` as duplicated. It is worse than duplicated: the copy in `static/js/schedule.js:219` is dead code, never referenced from that file or from `index.html`, because `displaySchedule` formats inline instead.
