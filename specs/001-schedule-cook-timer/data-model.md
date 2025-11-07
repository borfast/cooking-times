# Data Model: Cooking Schedule Planner

## Overview
The application manages pre-defined food profiles, user-configured cooking plans, and generated plan steps that drive reminders. Data persistence is lightweight: food metadata is embedded and user plans live in session scope (browser storage) with optional serialization from the Go server for recovery.

## Entities

### FoodProfile
- **Identifier**: `id` (string slug, unique)
- **Fields**:
  - `name` (string, required)
  - `category` (enum: protein, vegetable, starch, other)
  - `prep_notes` (string, optional)
  - `doneness_levels` (array of `DonenessOption`, required, ≥1)
  - `default_rest_minutes` (integer ≥0, default 0)
- **Relationships**: Has many `DonenessOption` records (embedded).
- **Validation Rules**:
  - Must expose at least one doneness option with positive duration.
  - Identifiers must be unique across all profiles.

### DonenessOption (Value Object)
- **Fields**:
  - `level` (string label, required, e.g., "rare", "medium")
  - `cook_minutes` (integer >0)
  - `prep_buffer_minutes` (integer ≥0)
- **Purpose**: Supplies baseline timing per food preference; not addressable outside its parent profile.

### CookingPlan
- **Identifier**: `plan_id` (UUID v4, generated when plan is created)
- **Fields**:
  - `mode` (enum: `start_now`, `finish_by`, required)
  - `start_time` (timestamp, optional, present when `start_now` confirmed)
  - `target_finish_time` (timestamp, required when `mode` = `finish_by`)
  - `created_at` (timestamp UTC)
  - `status` (enum: Draft, Generated, Active, Completed, Cancelled)
  - `items` (array of `PlanItem`, ≥1)
- **Relationships**: Aggregates multiple `PlanItem` entries; derived `PlanStep` records flatten for execution.
- **Validation Rules**:
  - Must contain at least one plan item referencing a valid `FoodProfile`.
  - When `mode=finish_by`, `target_finish_time` must be > current time.
  - State transitions limited to Draft → Generated → Active → (Completed | Cancelled); Active may transition to Cancelled.

### PlanItem
- **Fields**:
  - `food_id` (string, required)
  - `selected_level` (string, required, matches a `DonenessOption.level`)
  - `servings` (integer ≥1, optional; defaults to 1)
  - `notes` (string, optional)
- **Purpose**: Captures the user’s selection for each food prior to schedule generation.
- **Validation Rules**:
  - `food_id` must exist in `FoodProfile` dataset.
  - `selected_level` must be defined for that food.

### PlanStep
- **Identifier**: composite (`plan_id`, `sequence_number`)
- **Fields**:
  - `sequence_number` (integer ≥1)
  - `food_id` (string)
  - `action` (enum: `start`, `flip`, `rest`, `serve`)
  - `offset_seconds` (integer ≥0, relative to plan start)
  - `duration_seconds` (integer ≥0)
  - `message` (string, localized instruction)
- **Relationships**: Belongs to `CookingPlan`; references `FoodProfile` for display metadata.
- **Validation Rules**:
  - Sequence numbers strictly increasing.
  - Offsets must be non-decreasing; final step offset + duration aligns with plan completion time.

### TimerSession
- **Identifier**: `plan_id`
- **Fields**:
  - `started_at` (timestamp)
  - `elapsed_seconds` (integer ≥0)
  - `pending_step_ids` (array of `sequence_number`)
  - `acknowledged_step_ids` (array of ints)
- **Purpose**: Tracks in-progress timer state for pause/resume/reschedule logic.
- **Validation Rules**:
  - `elapsed_seconds` ≤ total plan duration.
  - Pending and acknowledged arrays partition the set of plan steps without overlap.

## Relationships Diagram (Textual)
- `FoodProfile` 1—* `PlanItem` (via `food_id`)
- `CookingPlan` 1—* `PlanItem`
- `CookingPlan` 1—* `PlanStep`
- `TimerSession` 1—1 `CookingPlan` (mirrors active plan)

## State Transitions
1. **Draft**: User is selecting foods; plan items mutable.
2. **Generated**: Schedule computed; plan steps available. Actions: start timer → Active, edit items → return to Draft then regenerate.
3. **Active**: Timer running; support edits that trigger recompute (stay Active with refreshed steps) or cancel.
4. **Completed**: All steps acknowledged.
5. **Cancelled**: User aborts cooking session.

## Derived Values
- `plan_start_time` = now (start_now) or `target_finish_time` − total_duration.
- `step_start_time` = `plan_start_time` + `offset_seconds`.
- `plan_completion_time` = last step start + duration.

## Validation Summary
- Input validation handled server-side before schedule generation.
- Persisted session data must include a checksum/hash to detect stale localStorage payloads.
- Schedules regenerate on edits to maintain monotonic offsets and prevent overlapping actions.
