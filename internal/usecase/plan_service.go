package usecase

import (
	"context"
	"errors"
	"log"
	"time"

	"github.com/borfast/cooking-times/internal/domain"
	"github.com/google/uuid"
)

// FoodRepository exposes read access to food profiles.
type FoodRepository interface {
	AllProfiles(ctx context.Context) ([]domain.FoodProfile, error)
}

// PlanStore persists generated plans for recovery and recalculation.
type PlanStore interface {
	SavePlan(ctx context.Context, plan domain.Plan) error
	GetPlan(ctx context.Context, planID string) (domain.Plan, error)
}

// Clock abstracts time access for deterministic testing.
type Clock interface {
	Now() time.Time
}

// RealClock implements Clock using time.Now.
type RealClock struct{}

// Now returns the current time.
func (RealClock) Now() time.Time { return time.Now() }

// PlanService coordinates plan generation across repositories and domain logic.
type PlanService struct {
	repo  FoodRepository
	store PlanStore
	clock Clock
}

// NewPlanService constructs a PlanService.
func NewPlanService(repo FoodRepository, store PlanStore, clock Clock) (*PlanService, error) {
	if repo == nil {
		return nil, errors.New("plan service requires a repository")
	}
	if store == nil {
		return nil, errors.New("plan service requires a store")
	}
	if clock == nil {
		clock = RealClock{}
	}
	return &PlanService{repo: repo, store: store, clock: clock}, nil
}

// Generate orchestrates plan creation for the provided request and persists the result.
func (s *PlanService) Generate(ctx context.Context, req domain.PlanRequest) (domain.Plan, error) {
	start := time.Now()
	profiles, err := s.repo.AllProfiles(ctx)
	if err != nil {
		return domain.Plan{}, err
	}

	profileMap := make(map[string]domain.FoodProfile, len(profiles))
	for _, profile := range profiles {
		profileMap[profile.ID] = profile
	}

	var baseStart time.Time
	if req.Mode == domain.PlanModeStartNow {
		baseStart = s.clock.Now()
	}

	if req.PlanID == "" {
		req.PlanID = uuid.NewString()
	}

	plan, err := domain.GeneratePlan(req, profileMap, baseStart)
	if err != nil {
		return domain.Plan{}, err
	}

	if err := s.store.SavePlan(ctx, plan); err != nil {
		return domain.Plan{}, err
	}

	duration := time.Since(start)
	log.Printf("plan_service.generate plan_id=%s items=%d elapsed_ms=%.2f", plan.ID, len(req.Items), float64(duration.Microseconds())/1000.0)

	return plan, nil
}

// Get returns a previously generated plan.
func (s *PlanService) Get(ctx context.Context, planID string) (domain.Plan, error) {
	return s.store.GetPlan(ctx, planID)
}
