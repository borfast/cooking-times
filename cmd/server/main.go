package main

import (
	"crypto/tls"
	"log"
	"net/http"
	"os"

	"github.com/borfast/cooking-times/internal/adapters/storage"
	planhttp "github.com/borfast/cooking-times/internal/interfaces/http"
	"github.com/borfast/cooking-times/internal/usecase"
)

const (
	certPath = "cmd/server/certs/localhost-cert.pem"
	keyPath  = "cmd/server/certs/localhost-key.pem"
)

func main() {
	if err := run(); err != nil {
		log.Fatalf("server exited: %v", err)
	}
}

func run() error {
	if err := ensureTLSFiles(); err != nil {
		return err
	}

	repo := storage.NewEmbeddedFoodRepository()
	planStore := storage.NewInMemoryPlanStore()
	timerStore := storage.NewInMemoryTimerStore()

	planService, err := usecase.NewPlanService(repo, planStore, usecase.RealClock{})
	if err != nil {
		return err
	}

	planRecovery, err := usecase.NewPlanRecoveryService(planStore)
	if err != nil {
		return err
	}

	recalcService, err := usecase.NewRecalculateService(planStore, repo)
	if err != nil {
		return err
	}

	timerService, err := usecase.NewTimerSessionService(planStore, timerStore, usecase.RealClock{})
	if err != nil {
		return err
	}

	rootMux := http.NewServeMux()
	rootMux.Handle("/api/v1/foods", planhttp.NewFoodsHandler(repo))
	rootMux.Handle("/api/v1/plans/generate", planhttp.NewPlanRouter(planService))
	rootMux.Handle("/api/v1/plans/recalculate", planhttp.NewRecalculateHandler(recalcService))
	rootMux.Handle("/api/v1/plans/", planhttp.NewGetPlanHandler(planRecovery))
	rootMux.Handle("/api/v1/timer/", planhttp.NewTimerRouter(timerService))
	rootMux.HandleFunc("/", servePlannerPage)
	rootMux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("web/static"))))

	server := &http.Server{
		Addr:      ":8443",
		Handler:   rootMux,
		TLSConfig: &tls.Config{MinVersion: tls.VersionTLS12},
	}

	log.Printf("Starting Cooking Schedule Planner server on https://localhost:8443")
	return server.ListenAndServeTLS(certPath, keyPath)
}

func servePlannerPage(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, "web/templates/plan.html")
}

func ensureTLSFiles() error {
	if _, err := os.Stat(certPath); err != nil {
		return err
	}
	if _, err := os.Stat(keyPath); err != nil {
		return err
	}
	return nil
}
