#!/usr/bin/env bash
# menu.sh — Dev Tasks interactive menu

set -euo pipefail

APP_URL="http://localhost:5500"
API_URL="http://localhost:3001/tasks"

# ── Colors ────────────────────────────────────────────────────────────────────
BOLD='\033[1m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
DIM='\033[2m'
RESET='\033[0m'

# ── Helpers ───────────────────────────────────────────────────────────────────
header() {
  clear
  echo -e "${CYAN}${BOLD}"
  echo "  ██████╗ ███████╗██╗   ██╗    ████████╗ █████╗ ███████╗██╗  ██╗███████╗"
  echo "  ██╔══██╗██╔════╝██║   ██║       ██╔══╝██╔══██╗██╔════╝██║ ██╔╝██╔════╝"
  echo "  ██║  ██║█████╗  ██║   ██║       ██║   ███████║███████╗█████╔╝ ███████╗"
  echo "  ██║  ██║██╔══╝  ╚██╗ ██╔╝       ██║   ██╔══██║╚════██║██╔═██╗ ╚════██║"
  echo "  ██████╔╝███████╗ ╚████╔╝        ██║   ██║  ██║███████║██║  ██╗███████║"
  echo "  ╚═════╝ ╚══════╝  ╚═══╝         ╚═╝   ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚══════╝"
  echo -e "${RESET}"
  echo -e "  ${DIM}Kanban Board — http://localhost:5500${RESET}"
  echo
}

status_line() {
  local app_status api_status
  if docker compose ps --format '{{.Name}} {{.State}}' 2>/dev/null | grep -q "devtasks running"; then
    app_status="${GREEN}● running${RESET}"
  else
    app_status="${RED}○ stopped${RESET}"
  fi
  echo -e "  devtasks  ${app_status}"
  echo
}

pause() { echo; read -rp "  Prima ENTER para continuar..." _; }

# ── Actions ───────────────────────────────────────────────────────────────────
do_start() {
  echo -e "${YELLOW}  A iniciar os containers...${RESET}"
  docker compose up -d
  echo -e "${GREEN}  Feito.${RESET}"
  pause
}

do_stop() {
  echo -e "${YELLOW}  A parar os containers...${RESET}"
  docker compose down
  echo -e "${GREEN}  Feito.${RESET}"
  pause
}

do_restart() {
  echo -e "${YELLOW}  A reiniciar os containers...${RESET}"
  docker compose restart
  echo -e "${GREEN}  Feito.${RESET}"
  pause
}

do_rebuild() {
  echo -e "${YELLOW}  A reconstruir as imagens...${RESET}"
  docker compose up -d --build --force-recreate
  echo -e "${GREEN}  Feito.${RESET}"
  pause
}

do_logs() {
  echo -e "${DIM}  Ctrl+C para sair dos logs${RESET}"
  echo
  docker compose logs -f
}

do_open() {
  echo -e "  A abrir ${CYAN}${APP_URL}${RESET} ..."
  open "${APP_URL}"
  pause
}

do_ps() {
  docker compose ps
  pause
}

do_clean() {
  echo -e "${RED}  Isto vai remover containers, volumes e redes.${RESET}"
  read -rp "  Tens a certeza? (s/N): " confirm
  if [[ "${confirm,,}" == "s" ]]; then
    docker compose down --volumes --remove-orphans
    echo -e "${GREEN}  Limpo.${RESET}"
  else
    echo "  Cancelado."
  fi
  pause
}

# ── Menu loop ─────────────────────────────────────────────────────────────────
while true; do
  header
  status_line

  echo -e "  ${BOLD}Lifecycle${RESET}"
  echo -e "  ${CYAN}1)${RESET} Iniciar          ${DIM}(make start)${RESET}"
  echo -e "  ${CYAN}2)${RESET} Parar            ${DIM}(make stop)${RESET}"
  echo -e "  ${CYAN}3)${RESET} Reiniciar        ${DIM}(make restart)${RESET}"
  echo -e "  ${CYAN}4)${RESET} Reconstruir      ${DIM}(make rebuild)${RESET}"
  echo
  echo -e "  ${BOLD}Observabilidade${RESET}"
  echo -e "  ${CYAN}5)${RESET} Estado dos containers"
  echo -e "  ${CYAN}6)${RESET} Logs — todos os serviços"
  echo
  echo -e "  ${BOLD}Atalhos${RESET}"
  echo -e "  ${CYAN}9)${RESET} Abrir no browser"
  echo
  echo -e "  ${BOLD}Limpeza${RESET}"
  echo -e "  ${CYAN}c)${RESET} Limpar tudo ${DIM}(containers + volumes)${RESET}"
  echo
  echo -e "  ${CYAN}q)${RESET} Sair"
  echo
  read -rp "  Opção: " opt

  case "${opt}" in
    1) do_start   ;;
    2) do_stop    ;;
    3) do_restart ;;
    4) do_rebuild ;;
    5) do_ps      ;;
    6) do_logs    ;;
    9) do_open    ;;
    c|C) do_clean ;;
    q|Q) echo; exit 0 ;;
    *) echo -e "  ${RED}Opção inválida.${RESET}"; sleep 1 ;;
  esac
done
