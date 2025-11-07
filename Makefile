.PHONY: fmt lint test tidy

fmt:
	go fmt ./...

lint:
	go vet ./...
	@if command -v staticcheck >/dev/null 2>&1; then \
		staticcheck ./...; \
	else \
		echo "staticcheck not found; skipping"; \
	fi

test:
	go test ./...

tidy:
	go mod tidy
