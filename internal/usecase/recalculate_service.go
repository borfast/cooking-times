package usecase

import (
	"context"
	"errors"

	"github.com/borfast/cooking-times/internal/domain"
)

// RecalculateService coordinates mid-session plan adjustments.
type RecalculateService struct {
	planStore PlanStore
	foodRepo  FoodRepository
}

// NewRecalculateService constructs the service.
func NewRecalculateService(planStore PlanStore, foodRepo FoodRepository) (*RecalculateService, error) {
	if planStore == nil || foodRepo == nil {
		return nil, errors.New("recalculate service requires stores")
	}
	return &RecalculateService{planStore: planStore, foodRepo: foodRepo}, nil
}

// Recalculate applies adjustments and persists the updated plan.
func (s *RecalculateService) Recalculate(ctx context.Context, request domain.PlanAdjustmentRequest) (domain.Plan, error) {
	if request.PlanID == "" {
		return domain.Plan{}, errors.New("plan_id required")
	}

	plan, err := s.planStore.GetPlan(ctx, request.PlanID)
	if err != nil {
		return domain.Plan{}, err
	}

	profiles, err := s.foodRepo.AllProfiles(ctx)
	if err != nil {
		return domain.Plan{}, err
	}

	profileMap := make(map[string]domain.FoodProfile, len(profiles))
	for _, profile := range profiles {
		profileMap[profile.ID] = profile
	}

	adj := request.ToAdjustment(profileMap)
	updated := domain.ApplyAdjustments(plan, adj)

	if err := s.planStore.SavePlan(ctx, updated); err != nil {
		return domain.Plan{}, err
	}

	return updated, nil
}
