package usecase

import (
	"context"
	"errors"
	"time"

	"github.com/borfast/cooking-times/internal/domain"
)

// TimerSessionStore persists timer sessions for recovery.
type TimerSessionStore interface {
	SaveSession(ctx context.Context, session *domain.TimerSession) error
	GetSession(ctx context.Context, planID string) (*domain.TimerSession, error)
}

// TimerSessionService orchestrates timer lifecycle events.
type TimerSessionService struct {
	planStore    PlanStore
	sessionStore TimerSessionStore
	clock        Clock
}

// NewTimerSessionService constructs the service.
func NewTimerSessionService(planStore PlanStore, sessionStore TimerSessionStore, clock Clock) (*TimerSessionService, error) {
	if planStore == nil {
		return nil, errors.New("timer service requires plan store")
	}
	if sessionStore == nil {
		return nil, errors.New("timer service requires session store")
	}
	if clock == nil {
		clock = RealClock{}
	}
	return &TimerSessionService{planStore: planStore, sessionStore: sessionStore, clock: clock}, nil
}

// StartSession creates or resets a timer session for the provided plan.
func (s *TimerSessionService) StartSession(ctx context.Context, planID string) (*domain.TimerSession, error) {
	plan, err := s.planStore.GetPlan(ctx, planID)
	if err != nil {
		return nil, err
	}

	session := domain.NewTimerSession(plan.ID, plan.Steps)
	session.Start(s.clock.Now())
	if err := s.sessionStore.SaveSession(ctx, session); err != nil {
		return nil, err
	}
	return session, nil
}

// CurrentSession returns the active session for a plan.
func (s *TimerSessionService) CurrentSession(ctx context.Context, planID string) (*domain.TimerSession, error) {
	session, err := s.sessionStore.GetSession(ctx, planID)
	if err != nil {
		return nil, err
	}
	return session, nil
}

// Pause pauses the active session.
func (s *TimerSessionService) Pause(ctx context.Context, planID string) (*domain.TimerSession, error) {
	session, err := s.CurrentSession(ctx, planID)
	if err != nil {
		return nil, err
	}
	session.Pause()
	if err := s.sessionStore.SaveSession(ctx, session); err != nil {
		return nil, err
	}
	return session, nil
}

// Resume resumes the active session at the provided timestamp.
func (s *TimerSessionService) Resume(ctx context.Context, planID string) (*domain.TimerSession, error) {
	session, err := s.CurrentSession(ctx, planID)
	if err != nil {
		return nil, err
	}
	session.Resume(s.clock.Now())
	if err := s.sessionStore.SaveSession(ctx, session); err != nil {
		return nil, err
	}
	return session, nil
}

// Acknowledge marks a step as complete and persists the session.
func (s *TimerSessionService) Acknowledge(ctx context.Context, planID string, sequence int) (*domain.TimerSession, error) {
	session, err := s.CurrentSession(ctx, planID)
	if err != nil {
		return nil, err
	}
	session.Acknowledge(sequence)
	if err := s.sessionStore.SaveSession(ctx, session); err != nil {
		return nil, err
	}
	return session, nil
}

// Advance is primarily for testing to simulate elapsed time.
func (s *TimerSessionService) Advance(ctx context.Context, planID string, delta time.Duration) (*domain.TimerSession, error) {
	session, err := s.CurrentSession(ctx, planID)
	if err != nil {
		return nil, err
	}
	session.AdvanceBy(delta)
	if err := s.sessionStore.SaveSession(ctx, session); err != nil {
		return nil, err
	}
	return session, nil
}
