package domain_test

import (
	"testing"
	"time"

	"github.com/borfast/cooking-times/internal/domain"
)

func TestApplyAdjustmentsRemovesItems(t *testing.T) {
	plan := domain.Plan{
		ID:              "plan-1",
		StartTime:        time.Unix(0, 0),
		TargetFinishTime: time.Unix(1800, 0),
		TotalDuration:    30 * time.Minute,
		Steps: []domain.PlanStep{
			{Sequence: 1, FoodID: "steak", Message: "Start steak", Offset: 0, Duration: 30 * time.Minute},
			{Sequence: 2, FoodID: "asparagus", Message: "Start asparagus", Offset: 20 * time.Minute, Duration: 10 * time.Minute},
		},
	}

	adj := domain.PlanAdjustment{
		RemoveFoodIDs: []string{"asparagus"},
	}

	updated := domain.ApplyAdjustments(plan, adj)

	if len(updated.Steps) != 1 {
		t.Fatalf("expected 1 step remaining, got %d", len(updated.Steps))
	}

	if updated.Steps[0].FoodID != "steak" {
		t.Fatalf("expected steak to remain, got %s", updated.Steps[0].FoodID)
	}
}

func TestApplyAdjustmentsExtendsDuration(t *testing.T) {
	plan := domain.Plan{
		ID:              "plan-1",
		StartTime:        time.Unix(0, 0),
		TargetFinishTime: time.Unix(1200, 0),
		TotalDuration:    20 * time.Minute,
		Steps: []domain.PlanStep{
			{Sequence: 1, FoodID: "salmon", Message: "Start salmon", Offset: 0, Duration: 20 * time.Minute},
			{Sequence: 2, FoodID: "salmon", Message: "Serve salmon", Offset: 20 * time.Minute, Duration: 0},
		},
	}

	adj := domain.PlanAdjustment{
		UpdateDurations: map[string]time.Duration{"salmon": 25 * time.Minute},
	}

	updated := domain.ApplyAdjustments(plan, adj)

	if updated.TotalDuration != 25*time.Minute {
		t.Fatalf("expected total duration 25m, got %v", updated.TotalDuration)
	}

	if updated.TargetFinishTime != plan.StartTime.Add(25*time.Minute) {
		t.Fatalf("expected finish time adjusted, got %v", updated.TargetFinishTime)
	}
}
