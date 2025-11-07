package usecase_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/borfast/cooking-times/internal/adapters/storage"
	planhttp "github.com/borfast/cooking-times/internal/interfaces/http"
)

func TestFoodsHandlerReturnsAllProfiles(t *testing.T) {
	repo := storage.NewEmbeddedFoodRepository()
	handler := planhttp.NewFoodsHandler(repo)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/foods", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	var response struct {
		Foods []struct {
			ID     string `json:"id"`
			Name   string `json:"name"`
			Levels []struct {
				Level string `json:"level"`
				Label string `json:"label"`
			} `json:"levels"`
		} `json:"foods"`
	}

	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if len(response.Foods) == 0 {
		t.Fatal("expected at least one food, got none")
	}

	// Verify steak is present with correct levels
	var foundSteak bool
	for _, food := range response.Foods {
		if food.ID == "steak" {
			foundSteak = true
			if food.Name != "Ribeye Steak" {
				t.Errorf("expected name 'Ribeye Steak', got '%s'", food.Name)
			}
			if len(food.Levels) == 0 {
				t.Error("expected steak to have doneness levels")
			}
			// Check for at least one level
			var hasRare bool
			for _, level := range food.Levels {
				if level.Level == "rare" {
					hasRare = true
					if level.Label != "Rare" {
						t.Errorf("expected label 'Rare', got '%s'", level.Label)
					}
				}
			}
			if !hasRare {
				t.Error("expected steak to have 'rare' level")
			}
		}
	}

	if !foundSteak {
		t.Error("expected to find steak in foods list")
	}
}

func TestFoodsHandlerRejectsNonGetRequests(t *testing.T) {
	repo := storage.NewEmbeddedFoodRepository()
	handler := planhttp.NewFoodsHandler(repo)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/foods", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected status 405, got %d", w.Code)
	}
}
