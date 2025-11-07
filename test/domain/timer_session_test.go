package domain_test

import (
	"testing"
	"time"

	"github.com/borfast/cooking-times/internal/domain"
)

func TestTimerSessionCreatesAlertsInOrder(t *testing.T) {
	steps := []domain.PlanStep{
		{Sequence: 1, FoodID: "steak", Message: "Start steak", Offset: 0, Duration: 30 * time.Minute},
		{Sequence: 2, FoodID: "asparagus", Message: "Start asparagus", Offset: 20 * time.Minute, Duration: 10 * time.Minute},
	}

	session := domain.NewTimerSession("plan-1", steps)

	alert := session.NextAlert()
	if alert.Sequence != 1 {
		t.Fatalf("expected first alert sequence 1, got %d", alert.Sequence)
	}

	session.Acknowledge(alert.Sequence)

	next := session.NextAlert()
	if next.Sequence != 2 {
		t.Fatalf("expected second alert sequence 2, got %d", next.Sequence)
	}
}

func TestTimerSessionPauseAndResume(t *testing.T) {
	steps := []domain.PlanStep{
		{Sequence: 1, FoodID: "steak", Message: "Start steak", Offset: 0, Duration: 30 * time.Minute},
		{Sequence: 2, FoodID: "asparagus", Message: "Start asparagus", Offset: 20 * time.Minute, Duration: 10 * time.Minute},
	}

	session := domain.NewTimerSession("plan-1", steps)

	session.Start(time.Unix(0, 0))
	session.AdvanceBy(10 * time.Minute)
	session.Pause()

	if !session.IsPaused() {
		t.Fatalf("expected session to be paused")
	}

	session.Resume(time.Unix(int64(15*time.Minute/time.Second), 0))
	if session.Elapsed() != 15*time.Minute {
		t.Fatalf("expected elapsed 15m after resume, got %v", session.Elapsed())
	}
}
