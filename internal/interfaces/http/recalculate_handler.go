package http

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/borfast/cooking-times/internal/domain"
)

// RecalculateService exposes plan adjustment operations.
type RecalculateService interface {
	Recalculate(ctx context.Context, request domain.PlanAdjustmentRequest) (domain.Plan, error)
}

// NewRecalculateHandler returns an HTTP handler for plan recalculation.
func NewRecalculateHandler(service RecalculateService) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		var payload domain.PlanAdjustmentRequest
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON payload")
			return
		}

		updated, err := service.Recalculate(r.Context(), payload)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		writePlanResponse(w, updated)
	})
}
