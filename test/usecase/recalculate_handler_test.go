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

type stubRecalculateService struct {
	plan domain.Plan
	err  error
}

func (s *stubRecalculateService) Recalculate(ctx context.Context, req domain.PlanAdjustmentRequest) (domain.Plan, error) {
	return s.plan, s.err
}

func TestRecalculateHandlerReturnsUpdatedPlan(t *testing.T) {
	plan := domain.Plan{ID: "plan-2", TotalDuration: 25 * time.Minute}
	svc := &stubRecalculateService{plan: plan}
	handler := httpiface.NewRecalculateHandler(svc)

	body := map[string]any{
		"plan_id":         "plan-2",
		"remove_food_ids": []string{"asparagus"},
	}
	payload, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/plans/recalculate", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}
