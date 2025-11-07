package usecase_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/borfast/cooking-times/internal/domain"
	httpiface "github.com/borfast/cooking-times/internal/interfaces/http"
)

type stubPlanGenerator struct {
	plan    domain.Plan
	err     error
	lastReq domain.PlanRequest
}

func (s *stubPlanGenerator) Generate(_ context.Context, req domain.PlanRequest) (domain.Plan, error) {
	s.lastReq = req
	return s.plan, s.err
}

func TestPlanGenerateHandlerStartNow(t *testing.T) {
	plan := domain.Plan{
		ID:               "plan-123",
		StartTime:        time.Date(2025, 1, 1, 17, 0, 0, 0, time.UTC),
		TargetFinishTime: time.Date(2025, 1, 1, 17, 30, 0, 0, time.UTC),
		TotalDuration:    30 * time.Minute,
		Steps: []domain.PlanStep{
			{Sequence: 1, FoodID: "steak", Level: "medium", Offset: 0, Duration: 30 * time.Minute, Message: "Start Steak (medium)"},
		},
	}

	stub := &stubPlanGenerator{plan: plan}
	handler := httpiface.NewPlanRouter(stub)

	body := map[string]any{
		"mode":    "start_now",
		"plan_id": "plan-123",
		"items":   []map[string]string{{"food_id": "steak", "selected_level": "medium"}},
	}
	payload, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/plans/generate", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Plan struct {
			PlanID               string `json:"plan_id"`
			TotalDurationSeconds int64  `json:"total_duration_seconds"`
		} `json:"plan"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp.Plan.TotalDurationSeconds != int64((30*time.Minute)/time.Second) {
		t.Fatalf("expected total duration 1800s, got %d", resp.Plan.TotalDurationSeconds)
	}

	if stub.lastReq.Mode != domain.PlanModeStartNow {
		t.Fatalf("expected mode start_now, got %s", stub.lastReq.Mode)
	}

	if len(stub.lastReq.Items) != 1 || stub.lastReq.Items[0].FoodID != "steak" {
		t.Fatalf("unexpected request items: %+v", stub.lastReq.Items)
	}

	if stub.lastReq.PlanID != "plan-123" {
		t.Fatalf("expected plan ID propagated, got %s", stub.lastReq.PlanID)
	}

	if resp.Plan.PlanID != "plan-123" {
		t.Fatalf("expected plan ID plan-123, got %s", resp.Plan.PlanID)
	}
}

func TestPlanGenerateHandlerValidationError(t *testing.T) {
	stub := &stubPlanGenerator{err: domain.ErrNoItems}
	handler := httpiface.NewPlanRouter(stub)

	body := map[string]any{"mode": "start_now", "items": []any{}}
	payload, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/plans/generate", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d", rec.Code)
	}
}
