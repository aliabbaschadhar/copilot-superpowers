# Changelog

All notable changes to the **Copilot Superpowers** extension are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [Unreleased] — Project rename

### Added

- **Live Agent Activity** sidebar section shows real-time resolve/install steps for sidebar installs, browse, bulk/collection installs, Copilot LM tools, and `@aiSkills` chat loads. Exactly two steps per operation (`Loading skill` → `Installed` / `Done`) with a permanent status panel (Skill, Status, Time) below the steps. Spacer rows separate the section from the catalog above (no divider line). Section is always visible at the bottom of the Skills tree.

### Changed

- Uses **Bun** scripts (e.g., `bun run compile:watch`) for the pre-launch/compile workflow, matching project scripts and `bun.lock`.
- Extension renamed from **AI Agent Superpowers** (`agent-superpowers`) to **Copilot Superpowers** (`copilot-superpowers`).
- Auto-patches the workspace `.gitignore` with `.agent/skills/` and `.agent/skills-catalog.md` the first time a skill is installed — keeping installed skills local and untracked.

### Fixed

- Added a workspace file watcher for the local `.agent/skills/` directory to automatically refresh the Skills tree view when skills are added, modified, or deleted without requiring manual refreshes.

---

## [1.0.0] - 2026-03-10

**Theme:** Initial Release — Full-Featured Skill Browser & Installer

### ✨ Major Features

#### Sidebar Skills Browser

- Activity Bar panel organization of 940+ AI skills
- Hierarchical category structure (AI, Backend, Frontend, DevOps, Security, Data, Mobile, Creative)
- Instant skill previews in side panel
- Rich metadata display (category, risk level, description)
- Favorites & recent skills quick-access sections
- Recommended skills based on project tech stack detection

#### Browse & Paste Command (Ctrl+Shift+/)

- Searchable QuickPick over all skills
- Fuzzy search on skill names and descriptions
- One-keystroke copy of `/<skill-id>` to clipboard
- Auto-paste detection into Claude Code or Gemini CLI terminals
- Configurable auto-paste delay for slower systems

#### Multi-Agent Installation

- **Claude Code**: `~/.claude/skills/{id}/SKILL.md`
- **Gemini CLI**: `~/.gemini/skills/{id}/SKILL.md`
- **Cursor**: Both project-scoped (`.cursor/rules/{id}.mdc`) and global (`~/.cursor/rules/{id}.mdc`)
- **GitHub Copilot**: Idempotent append to `.github/copilot-instructions.md` (no duplicates)
- **Generic Path**: Custom user-specified directory for other tools

#### Installation Features

- **Auto-Detection**: Detects running editor (Cursor vs VS Code) and pre-suggests appropriate agent
- **Overwrite Confirmation**: Ask before replacing existing skill files (configurable)
- **Preview Before Install**: View full SKILL.md content before committing any changes
- **Bulk Operations**:
  - Copy multiple skill IDs at once
  - Install entire categories in one click
  - Bootstrap full agent setup with "Install All"
- **Uninstall Management**: Remove skills with single click, proper cleanup of directories

#### Workspace Technology Detection

- Automatic `package.json` scanning
- File extension-based tech detection
- Curated skill recommendations: React → `react-patterns`, FastAPI → `fastapi-builder`, etc.
- "Recommended" tree section with relevant skills highlighted

#### Data & Persistence

- **Favorites**: Persistent via VS Code GlobalState
- **Recent Skills**: LRU list in GlobalState, quick access to last 10 used skills
- **Installation State**: Tracks which skills are installed for tree status display

#### Offline-First Architecture

- **All 940+ skills bundled** inside `.vsix` — zero network dependency
- Works completely offline (no CDN, no central server)
- Optional background remote sync keeps library fresh when online
- Non-blocking sync — full functionality while refresh happens in background

#### Configuration Options

| Setting                     | Purpose                                                        |
| --------------------------- | -------------------------------------------------------------- |
| `aiSkills.defaultAgent`     | Pre-select install target (auto/claude/cursor/copilot/generic) |
| `aiSkills.claudeSkillsPath` | Override Claude Code skills directory                          |
| `aiSkills.geminiSkillsPath` | Override Gemini CLI skills directory                           |
| `aiSkills.cursorScope`      | Project vs global Cursor rules scope                           |
| `aiSkills.confirmOverwrite` | Prompt before overwriting skill files                          |
| `aiSkills.showRiskBadge`    | Show/hide risk level badge in QuickPick                        |
| `aiSkills.autoPasteDelayMs` | Auto-paste timing (tunable for slow hardware)                  |

### 🎯 Skill Content

- **940+ expertly-crafted skills** across 15+ domains:
  - AI & LLM specialization (agent architecture, RAG, prompt engineering)
  - Backend patterns (APIs, databases, microservices)
  - Frontend frameworks (React, Angular, Vue, Svelte, Next.js)
  - DevOps & Cloud (AWS, Kubernetes, Terraform, Docker)
  - Security (pentesting, zero-trust, API security, authentication)
  - Data & Analytics (SQL, A/B testing, data modeling)
  - Mobile (Android, iOS, React Native)
  - 3D & Creative (Three.js, WebGL, algorithmic art)
  - ...and many more specialized domains

### ⚙️ Technical Highlights

- **Zero Runtime Dependencies** (except Fuse.js for fuzzy search)
- **TypeScript 5.x** — Full type safety
- **esbuild Bundling** — Optimized `.vsix`
- **Bun Runtime** — Fast script execution for prebuild pipeline
- **No Telemetry** — 100% privacy-focused
- **VS Code ^1.85.0** — No proposed APIs, stable API only

### 📊 Performance

- Extension activation: <200ms
- Fuzzy search: Instant across all 940+ skills
- Sidebar refresh: <100ms
- Memory footprint: <50MB

### 🔒 Security & Privacy

- ✅ No data sent to external servers
- ✅ No telemetry or usage tracking
- ✅ No home directory scanning (unless explicitly configured)
- ✅ All skills are static Markdown — no code execution
- ✅ 100% local operation

---

## How to Update

When a new version is released, VS Code will prompt you to update. Or manually:

1. Open **Extensions** (`Ctrl+Shift+X`)
2. Find **Copilot Superpowers**
3. Click **Update**
4. Reload VS Code

---

## Support

- 🐛 **Found a bug?** [Report it](https://github.com/aliabbaschadhar/copilot-superpowers/issues)
- 💡 **Have a feature idea?** [Open a discussion](https://github.com/aliabbaschadhar/copilot-superpowers/discussions)
- 📖 **Need help?** Check [README.md](README.md)
