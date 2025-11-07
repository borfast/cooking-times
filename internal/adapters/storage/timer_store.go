package storage

import (
	"context"
	"sync"

	"github.com/borfast/cooking-times/internal/domain"
	"github.com/borfast/cooking-times/internal/usecase"
)

// InMemoryTimerStore keeps timer sessions per plan ID.
type InMemoryTimerStore struct {
	mu       sync.RWMutex
	sessions map[string]*domain.TimerSession
}

// NewInMemoryTimerStore constructs an empty timer store.
func NewInMemoryTimerStore() *InMemoryTimerStore {
	return &InMemoryTimerStore{sessions: make(map[string]*domain.TimerSession)}
}

// SaveSession persists the session snapshot.
func (s *InMemoryTimerStore) SaveSession(_ context.Context, session *domain.TimerSession) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	clone := *session
	s.sessions[session.PlanID()] = &clone
	return nil
}

// GetSession returns the stored session for a plan ID.
func (s *InMemoryTimerStore) GetSession(_ context.Context, planID string) (*domain.TimerSession, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	session, ok := s.sessions[planID]
	if !ok {
		return nil, usecase.ErrTimerSessionNotFound
	}
	clone := *session
	return &clone, nil
}
