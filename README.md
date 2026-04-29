# Dev Tasks

Um projeto de gestão de tarefas e projetos para programadores e equipas, com modo pessoal e empresarial. Esta aplicação é uma interface web estática construída com HTML, CSS e JavaScript puro.

## Visão geral

- Nome: **Dev Tasks**
- Objetivo: Gestão de projetos e tarefas com quadro Kanban, calendário, métricas e gestão de equipa.
- Plataforma: Frontend estático, sem _build step_ obrigatório.
- Idioma principal: Português.

## Funcionalidades principais

- Quadro Kanban com colunas **To Do**, **Doing** e **Done**
- Drag & drop para movimentar tarefas
- Modo pessoal e modo empresarial
- Vista de calendário para prazos e planeamento
- Estatísticas e análise de produtividade
- Suporte a Markdown e realce de sintaxe em descrições
- Exportação de tarefas em JSON/CSV
- Gestão de utilizadores, papéis e equipa no modo empresarial
- Interface responsiva e adaptada para dedicação de programadores

## Páginas principais

- `index.html` — Página de landing com visão geral do produto e links para os modos
- `app.html` — App pessoal
- `app-enterprise.html` — App empresarial
- `service-worker.js` — Possível suporte offline/PWA

## Estrutura do projeto

```text
.
├── .dockerignore
├── .DS_Store
├── Makefile
├── README.md
├── app-enterprise.html
├── app.html
├── data/
│   └── db.json
├── docker-compose.yml
├── favicon.ico
├── index.html
├── login.html
├── manifest.json
├── public/
│   └── icons/
│       ├── icon-192.png
│       └── icon-512.png
├── register.html
├── scripts/
│   ├── dev-task
│   └── menu.sh
├── service-worker.js
├── src/
│   ├── components/
│   │   ├── app-navbar.js
│   │   └── task-card.js
│   ├── css/
│   │   ├── enterprise-app.css
│   │   ├── features.css
│   │   ├── landing.css
│   │   ├── login.css
│   │   ├── register.css
│   │   └── styles.css
│   └── js/
│       ├── .DS_Store
│       ├── api.js
│       ├── app-enterprise.js
│       ├── app.js
│       ├── auth.js
│       ├── automations.js
│       ├── board.js
│       ├── deep-work.js
│       ├── estimates.js
│       ├── export.js
│       ├── git-tools.js
│       ├── localApi.js
│       ├── markdown.js
│       ├── modal.js
│       ├── org-users.js
│       ├── pomodoro.js
│       ├── post-mortem.js
│       ├── shortcuts.js
│       ├── stats.js
│       ├── storage.js
│       └── tech-debt.js
```

## Tecnologias usadas

- HTML5
- CSS3
- Vanilla JavaScript (ES Modules)
- Bootstrap 5
- Bootstrap Icons
- SortableJS (drag & drop)
- Chart.js (gráficos)
- marked.js (Markdown)
- highlight.js (realce de sintaxe)

## Como executar

1. Abra o ficheiro `index.html` no seu navegador.
2. Alternativamente, sirva os ficheiros com um servidor HTTP local, por exemplo:

```bash
python3 -m http.server 8000
```

3. Navegue para `http://localhost:8000`.

## Instalação local

Não há dependências Node.js obrigatórias no repositório atual. Basta abrir os ficheiros diretamente ou usar um servidor local.

## PWA / Manifest

O ficheiro `manifest.json` define a aplicação como PWA com:

- `name`: Dev Tasks — Kanban
- `short_name`: Dev Tasks
- `display`: standalone
- `theme_color`: `#0d1117`
- Ícones para 192x192 e 512x512 em `public/icons`

## Notas adicionais
-
## Cobertura dos Requisitos do Projeto

Este projeto cobre todos os requisitos solicitados para um sistema de tarefas moderno:

- **CRUD de tarefas:** Implementado em `src/js/api.js`, `app.js`, `modal.js`.
- **Mock API:** Suporte via `localApi.js` e `storage.js`, além de integração com `json-server`.
- **Formulário com validação:** Implementado em `modal.js` (`task-form`, `_validate`).
- **Biblioteca externa:** Uso de Bootstrap e Chart.js.
- **Responsivo:** Layout responsivo com Bootstrap e CSS customizado.
- **PWA:** `manifest.json` e `service-worker.js` configurados.
- **Local Storage:** Persistência local em múltiplos módulos.
- **Canvas:** Gráficos via Chart.js em `stats.js`.
- **Web Component:** `<task-card>` implementado em `src/components/task-card.js`.
- **Date API:** Uso de `new Date().toISOString()` para datas.
- **Deploy no Github Pages:** Suporte e exemplos de uso.
- **Lighthouse:** Estrutura pronta para atingir todos os scores verdes.
- **Portfólio:** Pronto para ser apresentado em páginas de portfólio.

**Observação:** Caso deseje, pode ser facilmente expandido para incluir Geolocation ou outros recursos nativos.

- O projeto está preparado para oferecer uma experiência leve e direta.
- Há suporte para vista empresarial e pessoal no mesmo código.
- O foco está em produtividade para equipas de desenvolvimento e programadores individuais.
