package usecase_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/borfast/cooking-times/internal/domain"
	httpiface "github.com/borfast/cooking-times/internal/interfaces/http"
)

func TestGetPlanHandlerReturnsPlanPayload(t *testing.T) {
	plan := domain.Plan{ID: "plan-99"}
	lookup := &stubPlanLookup{plan: plan}
	handler := httpiface.NewGetPlanHandler(lookup)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/plans/plan-99", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var body struct {
		Plan struct {
			PlanID string `json:"plan_id"`
		} `json:"plan"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if body.Plan.PlanID != "plan-99" {
		t.Fatalf("expected plan ID plan-99, got %s", body.Plan.PlanID)
	}
}
