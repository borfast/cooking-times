package http

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/borfast/cooking-times/internal/domain"
	"github.com/borfast/cooking-times/internal/usecase"
)

// TimerService exposes timer session operations needed by HTTP handlers.
type TimerService interface {
	StartSession(ctx context.Context, planID string) (*domain.TimerSession, error)
	CurrentSession(ctx context.Context, planID string) (*domain.TimerSession, error)
	Pause(ctx context.Context, planID string) (*domain.TimerSession, error)
	Resume(ctx context.Context, planID string) (*domain.TimerSession, error)
	Acknowledge(ctx context.Context, planID string, sequence int) (*domain.TimerSession, error)
}

// NewTimerRouter wires timer-related endpoints.
func NewTimerRouter(service TimerService) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/timer/state", func(w http.ResponseWriter, r *http.Request) {
		handleTimerState(w, r, service)
	})
	mux.HandleFunc("/api/v1/timer/start", func(w http.ResponseWriter, r *http.Request) {
		handleTimerStart(w, r, service)
	})
	mux.HandleFunc("/api/v1/timer/pause", func(w http.ResponseWriter, r *http.Request) {
		handleTimerPause(w, r, service)
	})
	mux.HandleFunc("/api/v1/timer/resume", func(w http.ResponseWriter, r *http.Request) {
		handleTimerResume(w, r, service)
	})
	mux.HandleFunc("/api/v1/timer/acknowledge", func(w http.ResponseWriter, r *http.Request) {
		handleTimerAcknowledge(w, r, service)
	})
	return mux
}

func handleTimerState(w http.ResponseWriter, r *http.Request, service TimerService) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	planID := r.URL.Query().Get("planId")
	if planID == "" {
		writeTimerError(w, http.StatusBadRequest, "planId query parameter required")
		return
	}

	session, err := service.CurrentSession(r.Context(), planID)
	if err != nil {
		status := http.StatusNotFound
		if err != usecase.ErrTimerSessionNotFound {
			status = http.StatusInternalServerError
		}
		writeTimerError(w, status, err.Error())
		return
	}

	writeTimerState(w, session)
}

func handleTimerStart(w http.ResponseWriter, r *http.Request, service TimerService) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	planID, err := decodePlanID(r)
	if err != nil {
		writeTimerError(w, http.StatusBadRequest, err.Error())
		return
	}

	session, err := service.StartSession(r.Context(), planID)
	if err != nil {
		writeTimerError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeTimerState(w, session)
}

func handleTimerPause(w http.ResponseWriter, r *http.Request, service TimerService) {
	session, err := mutateSession(w, r, service.Pause)
	if err != nil {
		return
	}
	writeTimerState(w, session)
}

func handleTimerResume(w http.ResponseWriter, r *http.Request, service TimerService) {
	session, err := mutateSession(w, r, service.Resume)
	if err != nil {
		return
	}
	writeTimerState(w, session)
}

func handleTimerAcknowledge(w http.ResponseWriter, r *http.Request, service TimerService) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var payload struct {
		PlanID         string `json:"plan_id"`
		SequenceNumber int    `json:"sequence_number"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeTimerError(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}
	if payload.PlanID == "" {
		writeTimerError(w, http.StatusBadRequest, "plan_id required")
		return
	}

	session, err := service.Acknowledge(r.Context(), payload.PlanID, payload.SequenceNumber)
	if err != nil {
		writeTimerError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeTimerState(w, session)
}

func mutateSession(w http.ResponseWriter, r *http.Request, fn func(context.Context, string) (*domain.TimerSession, error)) (*domain.TimerSession, error) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return nil, errors.New("method not allowed")
	}

	planID, err := decodePlanID(r)
	if err != nil {
		writeTimerError(w, http.StatusBadRequest, err.Error())
		return nil, err
	}

	session, err := fn(r.Context(), planID)
	if err != nil {
		writeTimerError(w, http.StatusInternalServerError, err.Error())
		return nil, err
	}
	return session, nil
}

func decodePlanID(r *http.Request) (string, error) {
	var payload struct {
		PlanID string `json:"plan_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		return "", err
	}
	if payload.PlanID == "" {
		return "", errors.New("plan_id required")
	}
	return payload.PlanID, nil
}

func writeTimerState(w http.ResponseWriter, session *domain.TimerSession) {
	response := mapTimerSession(session)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(response)
}

func mapTimerSession(session *domain.TimerSession) timerStateResponse {
	pending := session.PendingSteps()
	steps := make([]timerStep, 0, len(pending))
	for _, step := range pending {
		steps = append(steps, timerStep{
			Sequence:        step.Sequence,
			FoodID:          step.FoodID,
			Message:         step.Message,
			Level:           step.Level,
			OffsetSeconds:   int64(step.Offset / time.Second),
			DurationSeconds: int64(step.Duration / time.Second),
		})
	}

	return timerStateResponse{
		PlanID:         session.PlanID(),
		ElapsedSeconds: int64(session.Elapsed() / time.Second),
		Paused:         session.IsPaused(),
		PendingSteps:   steps,
	}
}

type timerStateResponse struct {
	PlanID         string      `json:"plan_id"`
	ElapsedSeconds int64       `json:"elapsed_seconds"`
	Paused         bool        `json:"paused"`
	PendingSteps   []timerStep `json:"pending_steps"`
}

type timerStep struct {
	Sequence        int    `json:"sequence_number"`
	FoodID          string `json:"food_id"`
	Message         string `json:"message"`
	Level           string `json:"level"`
	OffsetSeconds   int64  `json:"offset_seconds"`
	DurationSeconds int64  `json:"duration_seconds"`
}

func writeTimerError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}
