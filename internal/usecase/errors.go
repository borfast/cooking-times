package usecase

import "errors"

var (
	ErrPlanNotFound         = errors.New("plan not found")
	ErrTimerSessionNotFound = errors.New("timer session not found")
)
