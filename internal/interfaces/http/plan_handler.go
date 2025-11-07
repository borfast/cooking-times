package http

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/borfast/cooking-times/internal/domain"
	"github.com/borfast/cooking-times/internal/usecase"
)

// PlanService exposes plan generation operations needed by HTTP handlers.
type PlanService interface {
	Generate(ctx context.Context, req domain.PlanRequest) (domain.Plan, error)
}

// PlanLookupService defines retrieval contract for saved plans.
type PlanLookupService interface {
	Get(ctx context.Context, planID string) (domain.Plan, error)
}

// NewPlanRouter wires the plan generation endpoint.
func NewPlanRouter(service PlanService) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/plans/generate", func(w http.ResponseWriter, r *http.Request) {
		handleGeneratePlan(w, r, service)
	})
	return mux
}

// NewGetPlanHandler returns an HTTP handler for plan retrieval.
func NewGetPlanHandler(service PlanLookupService) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		planID, err := extractPlanID(r)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		plan, err := service.Get(r.Context(), planID)
		if err != nil {
			status := http.StatusNotFound
			if !errors.Is(err, usecase.ErrPlanNotFound) {
				status = http.StatusInternalServerError
			}
			writeError(w, status, err.Error())
			return
		}

		writePlanResponse(w, plan)
	})
}

type planGenerationRequest struct {
	Mode         string            `json:"mode"`
	TargetFinish string            `json:"target_finish_time"`
	PlanID       string            `json:"plan_id"`
	Items        []planItemPayload `json:"items"`
}

type planItemPayload struct {
	FoodID        string `json:"food_id"`
	SelectedLevel string `json:"selected_level"`
}

type planResponse struct {
	Plan planView `json:"plan"`
}

type planView struct {
	ID                   string         `json:"plan_id"`
	StartTime            time.Time      `json:"start_time"`
	TargetFinishTime     time.Time      `json:"target_finish_time"`
	TotalDurationSeconds int64          `json:"total_duration_seconds"`
	Steps                []planStepView `json:"steps"`
}

type planStepView struct {
	Sequence        int    `json:"sequence_number"`
	FoodID          string `json:"food_id"`
	Level           string `json:"level"`
	Message         string `json:"message"`
	OffsetSeconds   int64  `json:"offset_seconds"`
	DurationSeconds int64  `json:"duration_seconds"`
}

func handleGeneratePlan(w http.ResponseWriter, r *http.Request, service PlanService) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var reqBody planGenerationRequest
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}

	domainReq, err := mapPlanRequest(reqBody)
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, domain.ErrMissingFinishTime) {
			status = http.StatusUnprocessableEntity
		}
		writeError(w, status, err.Error())
		return
	}

	plan, err := service.Generate(r.Context(), domainReq)
	if err != nil {
		status := mapDomainError(err)
		writeError(w, status, err.Error())
		return
	}

	writePlanResponse(w, plan)
}

func mapPlanRequest(req planGenerationRequest) (domain.PlanRequest, error) {
	result := domain.PlanRequest{}
	result.Mode = domain.PlanMode(req.Mode)
	result.PlanID = req.PlanID

	switch result.Mode {
	case domain.PlanModeStartNow:
		// Start time resolved by service using provided base time.
	case domain.PlanModeFinishBy:
		if req.TargetFinish == "" {
			return domain.PlanRequest{}, domain.ErrMissingFinishTime
		}
		parsed, err := time.Parse(time.RFC3339, req.TargetFinish)
		if err != nil {
			return domain.PlanRequest{}, err
		}
		result.TargetFinishTime = parsed
	default:
		return domain.PlanRequest{}, errors.New("unsupported mode")
	}

	for _, item := range req.Items {
		result.Items = append(result.Items, domain.PlanItemRequest{FoodID: item.FoodID, SelectedLevel: item.SelectedLevel})
	}

	return result, nil
}

func mapDomainError(err error) int {
	switch {
	case errors.Is(err, domain.ErrNoItems), errors.Is(err, domain.ErrUnknownFood), errors.Is(err, domain.ErrUnknownDoneness), errors.Is(err, domain.ErrMissingFinishTime):
		return http.StatusUnprocessableEntity
	case errors.Is(err, usecase.ErrPlanNotFound):
		return http.StatusNotFound
	default:
		return http.StatusInternalServerError
	}
}

func writePlanResponse(w http.ResponseWriter, plan domain.Plan) {
	payload := planResponse{Plan: mapPlanToView(plan)}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}

func mapPlanToView(plan domain.Plan) planView {
	steps := make([]planStepView, 0, len(plan.Steps))
	for _, step := range plan.Steps {
		steps = append(steps, planStepView{
			Sequence:        step.Sequence,
			FoodID:          step.FoodID,
			Level:           step.Level,
			Message:         step.Message,
			OffsetSeconds:   int64(step.Offset / time.Second),
			DurationSeconds: int64(step.Duration / time.Second),
		})
	}

	return planView{
		ID:                   plan.ID,
		StartTime:            plan.StartTime,
		TargetFinishTime:     plan.TargetFinishTime,
		TotalDurationSeconds: int64(plan.TotalDuration / time.Second),
		Steps:                steps,
	}
}

func extractPlanID(r *http.Request) (string, error) {
	trimmed := strings.TrimPrefix(r.URL.Path, "/api/v1/plans/")
	if trimmed == r.URL.Path {
		return "", errors.New("invalid plan identifier")
	}
	trimmed = strings.Trim(trimmed, "/")
	if trimmed == "" {
		return "", errors.New("invalid plan identifier")
	}
	return trimmed, nil
}
