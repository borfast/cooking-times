package domain

import (
	"errors"
	"fmt"
	"sort"
	"time"
)

// PlanMode represents the strategy for anchoring the cooking schedule.
type PlanMode string

const (
	PlanModeStartNow PlanMode = "start_now"
	PlanModeFinishBy PlanMode = "finish_by"
)

// DonenessOption represents a selectable doneness level for a given food profile.
type DonenessOption struct {
	Level             string `json:"level"`
	CookMinutes       int    `json:"cook_minutes"`
	PrepBufferMinutes int    `json:"prep_buffer_minutes"`
}

// FoodProfile captures the baseline metadata for a food item.
type FoodProfile struct {
	ID                 string           `json:"id"`
	Name               string           `json:"name"`
	Category           string           `json:"category"`
	PrepNotes          string           `json:"prep_notes"`
	DefaultRestMinutes int              `json:"default_rest_minutes"`
	DonenessLevels     []DonenessOption `json:"doneness_levels"`
}

// PlanItemRequest captures a user's selection for a specific food.
type PlanItemRequest struct {
	FoodID        string `json:"food_id"`
	SelectedLevel string `json:"selected_level"`
}

// PlanRequest represents a scheduling request.
type PlanRequest struct {
	Mode             PlanMode          `json:"mode"`
	TargetFinishTime time.Time         `json:"target_finish_time"`
	Items            []PlanItemRequest `json:"items"`
	PlanID           string            `json:"plan_id"`
}

// PlanStep represents a single action within the generated schedule.
type PlanStep struct {
	Sequence int           `json:"sequence_number"`
	FoodID   string        `json:"food_id"`
	Level    string        `json:"level"`
	Offset   time.Duration `json:"offset_seconds"`
	Duration time.Duration `json:"duration_seconds"`
	Message  string        `json:"message"`
}

// Plan contains the generated cooking schedule.
type Plan struct {
	ID               string        `json:"plan_id"`
	StartTime        time.Time     `json:"start_time"`
	TargetFinishTime time.Time     `json:"target_finish_time"`
	TotalDuration    time.Duration `json:"total_duration_seconds"`
	Steps            []PlanStep    `json:"steps"`
}

var (
	errNoItems           = errors.New("plan request must include at least one item")
	errUnknownFood       = errors.New("food profile not found")
	errUnknownDoneness   = errors.New("doneness level not found for food")
	errMissingFinishTime = errors.New("target finish time required for finish_by mode")
)

// Exported error aliases for use by other layers.
var (
	ErrNoItems           = errNoItems
	ErrUnknownFood       = errUnknownFood
	ErrUnknownDoneness   = errUnknownDoneness
	ErrMissingFinishTime = errMissingFinishTime
)

type itemPlan struct {
	request  PlanItemRequest
	profile  FoodProfile
	option   DonenessOption
	duration time.Duration
}

// GeneratePlan produces a cooking plan ensuring all foods finish simultaneously.
func GeneratePlan(req PlanRequest, profiles map[string]FoodProfile, baseStart time.Time) (Plan, error) {
	if len(req.Items) == 0 {
		return Plan{}, errNoItems
	}

	plannedItems := make([]itemPlan, 0, len(req.Items))

	for _, item := range req.Items {
		profile, ok := profiles[item.FoodID]
		if !ok {
			return Plan{}, fmt.Errorf("%w: %s", errUnknownFood, item.FoodID)
		}

		option, found := findDonenessOption(profile, item.SelectedLevel)
		if !found {
			return Plan{}, fmt.Errorf("%w: %s (%s)", errUnknownDoneness, item.FoodID, item.SelectedLevel)
		}

		dur := time.Duration(option.CookMinutes+option.PrepBufferMinutes+profile.DefaultRestMinutes) * time.Minute
		plannedItems = append(plannedItems, itemPlan{request: item, profile: profile, option: option, duration: dur})
	}

	longestDuration := calculateMaxDuration(plannedItems)
	if longestDuration <= 0 {
		return Plan{}, errors.New("calculated schedule duration must be positive")
	}

	var startTime time.Time
	var targetFinish time.Time

	switch req.Mode {
	case PlanModeStartNow:
		if baseStart.IsZero() {
			baseStart = time.Now()
		}
		startTime = baseStart
		targetFinish = startTime.Add(longestDuration)
	case PlanModeFinishBy:
		if req.TargetFinishTime.IsZero() {
			return Plan{}, errMissingFinishTime
		}
		targetFinish = req.TargetFinishTime
		startTime = targetFinish.Add(-longestDuration)
	default:
		return Plan{}, fmt.Errorf("unsupported plan mode: %s", req.Mode)
	}

	steps := make([]PlanStep, 0, len(plannedItems))
	for _, item := range plannedItems {
		offset := longestDuration - item.duration
		step := PlanStep{
			FoodID:   item.request.FoodID,
			Level:    item.request.SelectedLevel,
			Offset:   offset,
			Duration: item.duration,
			Message:  fmt.Sprintf("Start %s (%s)", item.profile.Name, item.option.Level),
		}
		steps = append(steps, step)
	}

	sort.SliceStable(steps, func(i, j int) bool {
		if steps[i].Offset == steps[j].Offset {
			return steps[i].FoodID < steps[j].FoodID
		}
		return steps[i].Offset < steps[j].Offset
	})

	for i := range steps {
		steps[i].Sequence = i + 1
	}

	return Plan{
		ID:               req.PlanID,
		StartTime:        startTime,
		TargetFinishTime: targetFinish,
		TotalDuration:    longestDuration,
		Steps:            steps,
	}, nil
}

func findDonenessOption(profile FoodProfile, level string) (DonenessOption, bool) {
	for _, opt := range profile.DonenessLevels {
		if opt.Level == level {
			return opt, true
		}
	}
	return DonenessOption{}, false
}

func calculateMaxDuration(items []itemPlan) time.Duration {
	var max time.Duration
	for _, item := range items {
		if item.duration > max {
			max = item.duration
		}
	}
	return max
}
