package domain

import "time"

// TimerSession tracks alert progression for a cooking plan.
type TimerSession struct {
	planID     string
	steps      []PlanStep
	currentIdx int
	startedAt  time.Time
	elapsed    time.Duration
	paused     bool
}

// NewTimerSession constructs a timer session for the provided steps.
func NewTimerSession(planID string, steps []PlanStep) *TimerSession {
	cloned := make([]PlanStep, len(steps))
	copy(cloned, steps)
	return &TimerSession{planID: planID, steps: cloned}
}

// PlanID returns the plan identifier associated with this session.
func (s *TimerSession) PlanID() string {
	return s.planID
}

// Start records the session start time.
func (s *TimerSession) Start(start time.Time) {
	s.startedAt = start
	s.elapsed = 0
	s.paused = false
}

// AdvanceBy manually adjusts elapsed time (used for testing/time travel).
func (s *TimerSession) AdvanceBy(delta time.Duration) {
	s.elapsed += delta
}

// Pause marks the session as paused without altering elapsed time.
func (s *TimerSession) Pause() {
	s.paused = true
}

// Resume resumes the session and recalculates elapsed time based on the provided timestamp.
func (s *TimerSession) Resume(at time.Time) {
	s.paused = false
	if !s.startedAt.IsZero() {
		s.elapsed = at.Sub(s.startedAt)
	}
}

// IsPaused reports whether the session is currently paused.
func (s *TimerSession) IsPaused() bool {
	return s.paused
}

// Elapsed returns the total elapsed time since the session began (excluding pauses accounted via AdvanceBy).
func (s *TimerSession) Elapsed() time.Duration {
	return s.elapsed
}

// NextAlert returns the next pending step alert.
func (s *TimerSession) NextAlert() PlanStep {
	if s.currentIdx >= len(s.steps) {
		return PlanStep{}
	}
	return s.steps[s.currentIdx]
}

// Acknowledge marks the provided sequence number as handled.
func (s *TimerSession) Acknowledge(sequence int) {
	if s.currentIdx >= len(s.steps) {
		return
	}
	if s.steps[s.currentIdx].Sequence == sequence {
		s.currentIdx++
	}
}

// PendingSteps returns all remaining steps yet to be acknowledged.
func (s *TimerSession) PendingSteps() []PlanStep {
	if s.currentIdx >= len(s.steps) {
		return nil
	}
	remaining := make([]PlanStep, len(s.steps)-s.currentIdx)
	copy(remaining, s.steps[s.currentIdx:])
	return remaining
}

// Steps returns a copy of all steps managed by the session.
func (s *TimerSession) Steps() []PlanStep {
	dup := make([]PlanStep, len(s.steps))
	copy(dup, s.steps)
	return dup
}
