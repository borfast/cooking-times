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

type stubTimerService struct {
	session *domain.TimerSession
	calls   []string
}

func (s *stubTimerService) StartSession(ctx context.Context, planID string) (*domain.TimerSession, error) {
	s.calls = append(s.calls, "start:"+planID)
	return s.session, nil
}

func (s *stubTimerService) CurrentSession(ctx context.Context, planID string) (*domain.TimerSession, error) {
	s.calls = append(s.calls, "state:"+planID)
	return s.session, nil
}

func (s *stubTimerService) Pause(ctx context.Context, planID string) (*domain.TimerSession, error) {
	s.calls = append(s.calls, "pause:"+planID)
	return s.session, nil
}

func (s *stubTimerService) Resume(ctx context.Context, planID string) (*domain.TimerSession, error) {
	s.calls = append(s.calls, "resume:"+planID)
	return s.session, nil
}

func (s *stubTimerService) Acknowledge(ctx context.Context, planID string, sequence int) (*domain.TimerSession, error) {
	s.calls = append(s.calls, "ack:"+planID)
	return s.session, nil
}

func TestTimerStateEndpointReturnsSession(t *testing.T) {
	steps := []domain.PlanStep{{Sequence: 1, FoodID: "steak", Message: "Start steak"}}
	session := domain.NewTimerSession("plan-123", steps)
	svc := &stubTimerService{session: session}

	handler := httpiface.NewTimerRouter(svc)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/timer/state?planId=plan-123", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestTimerStartEndpoint(t *testing.T) {
	session := domain.NewTimerSession("plan-123", nil)
	svc := &stubTimerService{session: session}
	handler := httpiface.NewTimerRouter(svc)

	body, _ := json.Marshal(map[string]any{"plan_id": "plan-123"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/timer/start", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	expected := "start:plan-123"
	if len(svc.calls) == 0 || svc.calls[0] != expected {
		t.Fatalf("expected call %s, got %#v", expected, svc.calls)
	}
}

func init() {
	// ensure domain timer session supports start/resume operations in tests
	s := domain.NewTimerSession("noop", nil)
	s.Start(time.Now())
}
