package e2e_test

import (
	"context"
	"testing"
	"time"

	"github.com/borfast/cooking-times/internal/adapters/storage"
	"github.com/borfast/cooking-times/internal/domain"
	"github.com/borfast/cooking-times/internal/usecase"
)

type fakeClock struct {
	now time.Time
}

func (c *fakeClock) Now() time.Time {
	return c.now
}

func (c *fakeClock) Advance(d time.Duration) {
	c.now = c.now.Add(d)
}

func TestTimerSessionOperationsStayWithinBudget(t *testing.T) {
	planStore := storage.NewInMemoryPlanStore()
	timerStore := storage.NewInMemoryTimerStore()

	plan := domain.Plan{
		ID:               "plan-perf",
		StartTime:        time.Now(),
		TargetFinishTime: time.Now().Add(30 * time.Minute),
		TotalDuration:    30 * time.Minute,
		Steps: []domain.PlanStep{
			{Sequence: 1, FoodID: "steak", Message: "Start steak", Offset: 0, Duration: 30 * time.Minute},
			{Sequence: 2, FoodID: "asparagus", Message: "Start asparagus", Offset: 20 * time.Minute, Duration: 10 * time.Minute},
		},
	}

	ctx := context.Background()
	if err := planStore.SavePlan(ctx, plan); err != nil {
		t.Fatalf("failed saving plan: %v", err)
	}

	clock := &fakeClock{now: time.Unix(0, 0)}
	timerSvc, err := usecase.NewTimerSessionService(planStore, timerStore, clock)
	if err != nil {
		t.Fatalf("failed creating timer service: %v", err)
	}

	start := time.Now()
	if _, err := timerSvc.StartSession(ctx, plan.ID); err != nil {
		t.Fatalf("start session failed: %v", err)
	}
	if elapsed := time.Since(start); elapsed > 200*time.Millisecond {
		t.Fatalf("timer start exceeded budget: %v", elapsed)
	}

	clock.Advance(50 * time.Millisecond)

	resumeStart := time.Now()
	if _, err := timerSvc.Resume(ctx, plan.ID); err != nil {
		t.Fatalf("resume failed: %v", err)
	}
	if elapsed := time.Since(resumeStart); elapsed > 200*time.Millisecond {
		t.Fatalf("timer resume exceeded budget: %v", elapsed)
	}
}
