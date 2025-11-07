package http

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/borfast/cooking-times/internal/domain"
)

// FoodRepository exposes food profile retrieval operations.
type FoodRepository interface {
	AllProfiles(ctx context.Context) ([]domain.FoodProfile, error)
}

// NewFoodsHandler returns an HTTP handler for retrieving food profiles.
func NewFoodsHandler(repo FoodRepository) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		profiles, err := repo.AllProfiles(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to retrieve food profiles")
			return
		}

		// Transform to a simpler structure for the frontend
		type levelOption struct {
			Level string `json:"level"`
			Label string `json:"label"`
		}

		type foodOption struct {
			ID     string        `json:"id"`
			Name   string        `json:"name"`
			Levels []levelOption `json:"levels"`
		}

		foods := make([]foodOption, 0, len(profiles))
		for _, profile := range profiles {
			levels := make([]levelOption, 0, len(profile.DonenessLevels))
			for _, doneness := range profile.DonenessLevels {
				levels = append(levels, levelOption{
					Level: doneness.Level,
					Label: capitalize(doneness.Level),
				})
			}
			foods = append(foods, foodOption{
				ID:     profile.ID,
				Name:   profile.Name,
				Levels: levels,
			})
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"foods": foods})
	})
}

// capitalize converts the first character to uppercase
func capitalize(s string) string {
	if s == "" {
		return s
	}
	if s == "well" {
		return "Well done"
	}
	// Simple capitalization for first letter
	runes := []rune(s)
	if len(runes) > 0 {
		if runes[0] >= 'a' && runes[0] <= 'z' {
			runes[0] = runes[0] - 32
		}
	}
	return string(runes)
}
