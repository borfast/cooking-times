package domain_test

import (
	"testing"
	"time"

	"github.com/borfast/cooking-times/internal/domain"
)

func BenchmarkGeneratePlan(b *testing.B) {
	profiles := map[string]domain.FoodProfile{
		"steak": {
			ID:             "steak",
			Name:           "Steak",
			DonenessLevels: []domain.DonenessOption{{Level: "medium", CookMinutes: 30}},
		},
		"potatoes": {
			ID:             "potatoes",
			Name:           "Potatoes",
			DonenessLevels: []domain.DonenessOption{{Level: "soft", CookMinutes: 45}},
		},
		"asparagus": {
			ID:             "asparagus",
			Name:           "Asparagus",
			DonenessLevels: []domain.DonenessOption{{Level: "tender", CookMinutes: 10}},
		},
	}

	req := domain.PlanRequest{
		Mode: domain.PlanModeStartNow,
		Items: []domain.PlanItemRequest{
			{FoodID: "steak", SelectedLevel: "medium"},
			{FoodID: "potatoes", SelectedLevel: "soft"},
			{FoodID: "asparagus", SelectedLevel: "tender"},
		},
	}

	base := time.Now()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := domain.GeneratePlan(req, profiles, base); err != nil {
			b.Fatalf("generate plan failed: %v", err)
		}
	}
}
