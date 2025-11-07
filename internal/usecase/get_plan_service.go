package usecase

import (
	"context"
	"errors"

	"github.com/borfast/cooking-times/internal/domain"
)

// PlanRecoveryService retrieves saved plans for session recovery.
type PlanRecoveryService struct {
	store PlanStore
}

// NewPlanRecoveryService constructs the service.
func NewPlanRecoveryService(store PlanStore) (*PlanRecoveryService, error) {
	if store == nil {
		return nil, errors.New("plan recovery service requires a store")
	}
	return &PlanRecoveryService{store: store}, nil
}

// Get returns the stored plan for the provided identifier.
func (s *PlanRecoveryService) Get(ctx context.Context, planID string) (domain.Plan, error) {
	return s.store.GetPlan(ctx, planID)
}
