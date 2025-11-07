package storage

import (
	"context"
	"sync"

	"github.com/borfast/cooking-times/internal/domain"
	"github.com/borfast/cooking-times/internal/usecase"
)

// InMemoryPlanStore keeps plans in memory for the current server process.
type InMemoryPlanStore struct {
	mu    sync.RWMutex
	plans map[string]domain.Plan
}

// NewInMemoryPlanStore constructs an empty plan store.
func NewInMemoryPlanStore() *InMemoryPlanStore {
	return &InMemoryPlanStore{plans: make(map[string]domain.Plan)}
}

// SavePlan stores or replaces a plan by its identifier.
func (s *InMemoryPlanStore) SavePlan(_ context.Context, plan domain.Plan) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.plans[plan.ID] = plan
	return nil
}

// GetPlan retrieves a plan by identifier.
func (s *InMemoryPlanStore) GetPlan(_ context.Context, planID string) (domain.Plan, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	plan, ok := s.plans[planID]
	if !ok {
		return domain.Plan{}, usecase.ErrPlanNotFound
	}
	return plan, nil
}
