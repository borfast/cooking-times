package domain_test

import (
	"testing"
	"time"

	"github.com/borfast/cooking-times/internal/domain"
)

func TestGeneratePlanStartNow(t *testing.T) {
	profiles := map[string]domain.FoodProfile{
		"steak": {
			ID:   "steak",
			Name: "Steak",
			DonenessLevels: []domain.DonenessOption{
				{Level: "medium", CookMinutes: 30},
			},
		},
		"asparagus": {
			ID:   "asparagus",
			Name: "Asparagus",
			DonenessLevels: []domain.DonenessOption{
				{Level: "tender", CookMinutes: 10},
			},
		},
	}

	req := domain.PlanRequest{
		Mode: domain.PlanModeStartNow,
		Items: []domain.PlanItemRequest{
			{FoodID: "steak", SelectedLevel: "medium"},
			{FoodID: "asparagus", SelectedLevel: "tender"},
		},
	}

	start := time.Date(2025, 1, 1, 17, 0, 0, 0, time.UTC)

	plan, err := domain.GeneratePlan(req, profiles, start)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if !plan.StartTime.Equal(start) {
		t.Fatalf("expected start time %v, got %v", start, plan.StartTime)
	}

	expectedTotal := 30 * time.Minute
	if plan.TotalDuration != expectedTotal {
		t.Fatalf("expected total duration %v, got %v", expectedTotal, plan.TotalDuration)
	}

	if len(plan.Steps) != 2 {
		t.Fatalf("expected 2 steps, got %d", len(plan.Steps))
	}

	if plan.Steps[0].FoodID != "steak" || plan.Steps[0].Offset != 0 {
		t.Fatalf("expected steak to start immediately, got %+v", plan.Steps[0])
	}

	expectedOffset := 20 * time.Minute
	if plan.Steps[1].FoodID != "asparagus" || plan.Steps[1].Offset != expectedOffset {
		t.Fatalf("expected asparagus offset %v, got %+v", expectedOffset, plan.Steps[1])
	}
}

func TestGeneratePlanFinishBy(t *testing.T) {
	profiles := map[string]domain.FoodProfile{
		"potatoes": {
			ID:             "potatoes",
			Name:           "Potatoes",
			DonenessLevels: []domain.DonenessOption{{Level: "soft", CookMinutes: 45}},
		},
		"salmon": {
			ID:             "salmon",
			Name:           "Salmon",
			DonenessLevels: []domain.DonenessOption{{Level: "medium", CookMinutes: 15}},
		},
	}

	targetFinish := time.Date(2025, 1, 1, 19, 0, 0, 0, time.UTC)

	req := domain.PlanRequest{
		Mode:             domain.PlanModeFinishBy,
		TargetFinishTime: targetFinish,
		Items: []domain.PlanItemRequest{
			{FoodID: "potatoes", SelectedLevel: "soft"},
			{FoodID: "salmon", SelectedLevel: "medium"},
		},
	}

	plan, err := domain.GeneratePlan(req, profiles, time.Time{})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	expectedStart := targetFinish.Add(-45 * time.Minute)
	if !plan.StartTime.Equal(expectedStart) {
		t.Fatalf("expected start %v, got %v", expectedStart, plan.StartTime)
	}

	if plan.Steps[0].FoodID != "potatoes" || plan.Steps[0].Offset != 0 {
		t.Fatalf("expected potatoes start at 0, got %+v", plan.Steps[0])
	}

	expectedSalmonOffset := 30 * time.Minute
	if plan.Steps[1].FoodID != "salmon" || plan.Steps[1].Offset != expectedSalmonOffset {
		t.Fatalf("expected salmon offset %v, got %+v", expectedSalmonOffset, plan.Steps[1])
	}

	if !plan.TargetFinishTime.Equal(targetFinish) {
		t.Fatalf("expected target finish %v, got %v", targetFinish, plan.TargetFinishTime)
	}
}
