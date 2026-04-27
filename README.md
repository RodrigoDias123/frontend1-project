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
├── app-enterprise.html
├── app.html
├── index.html
├── manifest.json
├── service-worker.js
├── data/
│   └── db.json
├── public/
│   └── icons/
├── src/
│   ├── components/
│   │   ├── app-navbar.js
│   │   └── task-card.js
│   ├── css/
│   │   ├── enterprise-app.css
│   │   ├── features.css
│   │   ├── landing.css
│   │   └── styles.css
│   └── js/
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
│       ├── tech-debt.js
│       └── register-empresa.js
└── .dockerignore
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

- O projeto está preparado para oferecer uma experiência leve e direta.
- Há suporte para vista empresarial e pessoal no mesmo código.
- O foco está em produtividade para equipas de desenvolvimento e programadores individuais.
