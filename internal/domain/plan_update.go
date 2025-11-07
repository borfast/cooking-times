package domain

import (
	"fmt"
	"sort"
	"time"
)

// PlanAdjustment captures edits applied to an active plan.
type PlanAdjustment struct {
	RemoveFoodIDs   []string
	UpdateDurations map[string]time.Duration
	NewSteps        []PlanStep
}

// AdjustmentStep is a transport-friendly representation of a plan step adjustment.
type AdjustmentStep struct {
	FoodID          string `json:"food_id"`
	OffsetSeconds   int64  `json:"offset_seconds"`
	DurationSeconds int64  `json:"duration_seconds"`
	Message         string `json:"message"`
}

// PlanAdjustmentRequest wraps adjustment instructions.
type PlanAdjustmentRequest struct {
	PlanID          string           `json:"plan_id"`
	RemoveFoodIDs   []string         `json:"remove_food_ids"`
	UpdateDurations map[string]int64 `json:"update_durations_seconds"`
	AddSteps        []AdjustmentStep `json:"add_steps"`
}

// ToAdjustment converts the request into a PlanAdjustment using duration seconds.
func (r PlanAdjustmentRequest) ToAdjustment(profiles map[string]FoodProfile) PlanAdjustment {
	adj := PlanAdjustment{RemoveFoodIDs: append([]string(nil), r.RemoveFoodIDs...)}
	if len(r.UpdateDurations) > 0 {
		adj.UpdateDurations = make(map[string]time.Duration, len(r.UpdateDurations))
		for k, seconds := range r.UpdateDurations {
			adj.UpdateDurations[k] = time.Duration(seconds) * time.Second
		}
	}
	if len(r.AddSteps) > 0 {
		converted := make([]PlanStep, 0, len(r.AddSteps))
		for _, step := range r.AddSteps {
			dur := time.Duration(step.DurationSeconds) * time.Second
			offset := time.Duration(step.OffsetSeconds) * time.Second
			converted = append(converted, PlanStep{
				FoodID:   step.FoodID,
				Offset:   offset,
				Duration: dur,
				Message:  step.Message,
			})
		}
		adj.NewSteps = normaliseAddedSteps(converted, profiles)
	}
	return adj
}

// ApplyAdjustments returns an updated plan reflecting modifications.
func ApplyAdjustments(plan Plan, adjustment PlanAdjustment) Plan {
	updated := plan
	updated.Steps = filterSteps(updated.Steps, adjustment.RemoveFoodIDs)
	if len(adjustment.UpdateDurations) > 0 {
		updated.Steps = applyDurationUpdates(updated.Steps, adjustment.UpdateDurations)
	}
	if len(adjustment.NewSteps) > 0 {
		updated.Steps = append(updated.Steps, adjustment.NewSteps...)
	}
	updated.TotalDuration = recomputeTotalDuration(updated.Steps)
	updated.TargetFinishTime = updated.StartTime.Add(updated.TotalDuration)
	for i := range updated.Steps {
		updated.Steps[i].Sequence = i + 1
	}
	updated.ID = plan.ID
	return updated
}

func filterSteps(steps []PlanStep, removeIDs []string) []PlanStep {
	if len(removeIDs) == 0 {
		return steps
	}

	excluded := make(map[string]struct{}, len(removeIDs))
	for _, id := range removeIDs {
		excluded[id] = struct{}{}
	}

	filtered := make([]PlanStep, 0, len(steps))
	for _, step := range steps {
		if _, skip := excluded[step.FoodID]; skip {
			continue
		}
		filtered = append(filtered, step)
	}
	return filtered
}

func applyDurationUpdates(steps []PlanStep, updates map[string]time.Duration) []PlanStep {
	result := make([]PlanStep, len(steps))
	copy(result, steps)
	for i, step := range result {
		if dur, ok := updates[step.FoodID]; ok {
			if step.Duration > 0 {
				result[i].Duration = dur
			}
		}
	}
	return result
}

func normaliseAddedSteps(steps []PlanStep, profiles map[string]FoodProfile) []PlanStep {
	if len(steps) == 0 {
		return nil
	}
	result := make([]PlanStep, len(steps))
	copy(result, steps)
	sort.SliceStable(result, func(i, j int) bool { return result[i].Offset < result[j].Offset })
	for i := range result {
		result[i].Sequence = i + 1
		result[i].Message = stepMessage(result[i], profiles)
	}
	return result
}

func stepMessage(step PlanStep, profiles map[string]FoodProfile) string {
	if profile, ok := profiles[step.FoodID]; ok {
		return fmt.Sprintf("Start %s", profile.Name)
	}
	if step.Message != "" {
		return step.Message
	}
	return fmt.Sprintf("Start %s", step.FoodID)
}

func recomputeTotalDuration(steps []PlanStep) time.Duration {
	var max time.Duration
	for _, step := range steps {
		end := step.Offset + step.Duration
		if end > max {
			max = end
		}
	}
	return max
}
