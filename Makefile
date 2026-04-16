.PHONY: up start down stop restart logs ps open open-api clean rebuild menu help

COMPOSE  = docker compose
APP_URL  = http://localhost:5500
API_URL  = http://localhost:5500/tasks

## ── Lifecycle ────────────────────────────────────────────────────────────────

up: ## Start all services in the background
	$(COMPOSE) up -d

start: up ## Alias for 'up'

down: ## Stop and remove containers (data is preserved in db.json)
	$(COMPOSE) down

stop: down ## Alias for 'down'

restart: ## Restart all services
	$(COMPOSE) restart

rebuild: ## Rebuild images and restart (use after changing nginx.conf)
	$(COMPOSE) up -d --build --force-recreate

## ── Observability ────────────────────────────────────────────────────────────

ps: ## Show running containers
	$(COMPOSE) ps

logs: ## Stream logs from all services (Ctrl+C to exit)
	$(COMPOSE) logs -f

## ── Shortcuts ────────────────────────────────────────────────────────────────

open: ## Open the app in the default browser
	open $(APP_URL)

open-api: ## Open the json-server API in the default browser
	open $(API_URL)

## ── Cleanup ──────────────────────────────────────────────────────────────────

clean: ## Stop containers and remove volumes / orphans
	$(COMPOSE) down --volumes --remove-orphans

## ── Menu ───────────────────────────────────────────────────────────────────

menu: ## Launch the interactive menu (default)
	@./scripts/menu.sh

## ── Help ─────────────────────────────────────────────────────────────────────

help: ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := menu
