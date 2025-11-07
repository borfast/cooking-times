package usecase_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/borfast/cooking-times/internal/domain"
	httpiface "github.com/borfast/cooking-times/internal/interfaces/http"
)

type stubPlanLookup struct {
	plan domain.Plan
	err  error
}

func (s *stubPlanLookup) Get(_ context.Context, planID string) (domain.Plan, error) {
	return s.plan, s.err
}

func TestGetPlanHandlerReturnsStoredPlan(t *testing.T) {
	plan := domain.Plan{ID: "plan-45"}
	lookup := &stubPlanLookup{plan: plan}
	handler := httpiface.NewGetPlanHandler(lookup)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/plans/plan-45", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestGetPlanHandlerValidatesID(t *testing.T) {
	lookup := &stubPlanLookup{}
	handler := httpiface.NewGetPlanHandler(lookup)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/plans/", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}
