package storage

import (
	"context"
	_ "embed"
	"encoding/json"
	"sync"

	"github.com/borfast/cooking-times/internal/domain"
)

//go:embed foods.json
var embeddedFoods []byte

// EmbeddedFoodRepository loads food profiles from an embedded JSON dataset.
type EmbeddedFoodRepository struct {
	once     sync.Once
	profiles []domain.FoodProfile
	err      error
}

// NewEmbeddedFoodRepository constructs a repository backed by embedded data.
func NewEmbeddedFoodRepository() *EmbeddedFoodRepository {
	return &EmbeddedFoodRepository{}
}

// AllProfiles returns every available food profile.
func (r *EmbeddedFoodRepository) AllProfiles(ctx context.Context) ([]domain.FoodProfile, error) {
	r.once.Do(func() {
		var payload struct {
			Foods []domain.FoodProfile `json:"foods"`
		}
		r.err = json.Unmarshal(embeddedFoods, &payload)
		if r.err != nil {
			return
		}
		r.profiles = payload.Foods
	})

	if r.err != nil {
		return nil, r.err
	}

	copyProfiles := make([]domain.FoodProfile, len(r.profiles))
	copy(copyProfiles, r.profiles)
	return copyProfiles, nil
}
