# Copilot Superpowers

> Browse, preview, and install **940+ AI agent skills** for GitHub Copilot, Cursor, Windsurf and AntiGravity.

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/aliabbaschadhar.copilot-superpowers?label=Marketplace&color=0078d4)](https://marketplace.visualstudio.com/items?itemName=aliabbaschadhar.copilot-superpowers)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/aliabbaschadhar.copilot-superpowers)](https://marketplace.visualstudio.com/items?itemName=aliabbaschadhar.copilot-superpowers)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Install

1. Open VS Code Extensions (`Ctrl+Shift+X`)
2. Search **"Copilot Superpowers"** by aliabbaschadhar
3. Click **Install** — no config needed, works offline

---

## Features

| Feature                       | How                                                                |
| ----------------------------- | ------------------------------------------------------------------ |
| **Sidebar browser**           | Activity Bar → brain icon — browse 940+ skills by category         |
| **Quick browse**              | `Ctrl+Shift+/` — fuzzy-search, select, `/<id>` copied to clipboard |
| **Preview**                   | View `SKILL.md` content before installing                          |
| **One-click install**         | Install any skill to your agent's config directory                 |
| **Workspace recommendations** | Auto-detects your stack and suggests relevant skills               |
| **Favorites & Recents**       | Quick access to your most-used skills                              |
| **Bulk install**              | Install an entire category or all skills at once                   |
| **Language Model Tools**      | 7 AI tools for Copilot to discover, install, and manage skills     |

### Install targets

| Agent          | Path                              |
| -------------- | --------------------------------- |
| GitHub Copilot | `.github/copilot-instructions.md` |
| Cursor         | `.cursor/instructions.md`         |
| Windsurf       | `.windsurf/instructions.md`       |
| AntiGravity    | `.antigravity/instructions.md`    |

---

## Quick Start

- Press `Ctrl+Shift+/` in VS Code
- Type a skill name (e.g. "react", "security", "aws")
- Press Enter — `/<skill-id>` is copied to your clipboard
- Paste into your editor's AI chat

Or open the sidebar, click any skill → **Install** to make it a persistent rule.

---

## Skill Categories

`ai-engineer` · `react-patterns` · `api-design-principles` · `aws-serverless` ·
`api-security-best-practices` · `android-jetpack-compose-expert` · `3d-web-experience` ·
`sql-query-optimizer` · `kubernetes-patterns` · and **930+ more**.

---

## Configuration

Search `aiSkills.` in VS Code Settings (`Ctrl+,`):

| Setting                     | Default | Description                       |
| --------------------------- | ------- | --------------------------------- |
| `aiSkills.confirmOverwrite` | `true`  | Prompt before overwriting a skill |
| `aiSkills.showRiskBadge`    | `true`  | Risk level in Browse QuickPick    |
| `aiSkills.localSkillsPath`  | `""`    | Custom local skills folder        |
| `aiSkills.remoteIndexUrl`   | `""`    | Override remote index URL         |

---

## Editor Integration

After installing skills, add this to your editor in `.github/copilot-instructions.md` or `.cursor/instructions.md` or `.windsurf/instructions.md` or `.antigravity/instructions.md` so agent automatically discovers and uses them:

````markdown
## AI Agent Skills

This project uses Copilot Superpowers skills stored in `.agent/skills/`.

### How to use skills

- Each installed skill lives at `.agent/skills/<skill-id>/SKILL.md`
- Before answering domain-specific questions, check if a relevant skill exists:
  - React / frontend → `.agent/skills/react-patterns/SKILL.md`
  - API design → `.agent/skills/api-design-principles/SKILL.md`
  - Security → `.agent/skills/api-security-best-practices/SKILL.md`
  - AI / agents → `.agent/skills/ai-agents-architect/SKILL.md`
  - …and so on for any other installed skill

### Loading a skill

Reference a skill file directly in your prompt:

```
#file:.agent/skills/react-patterns/SKILL.md
```

Or use the **Language Model Tools** for programmatic access:

| Tool                     | Description                           | Example                                                |
| ------------------------ | ------------------------------------- | ------------------------------------------------------ |
| `aiSkills_requestSkill`  | Install & load a skill's full content | `{"skillId": "react-patterns"}`                        |
| `aiSkills_listInstalled` | List all installed skills             | `{"category": "react", "limit": 10}`                   |
| `aiSkills_searchSkills`  | Search catalog by keyword             | `{"query": "aws", "limit": 15}`                        |
| `aiSkills_getSkillInfo`  | Get skill metadata                    | `{"skillId": "api-design", "includePreview": false}`   |
| `aiSkills_checkUpdates`  | Check for skill updates               | `{"skillId": "react-patterns"}` (or omit for all)      |
| `aiSkills_batchInstall`  | Install multiple skills               | `{"skillIds": ["react", "ts"], "category": "backend"}` |

Example tool call:

```
#tool:aiSkills_requestSkill {"skillId": "react-patterns"}
```

- If the skill is **already installed**, it loads instantly with no prompt.
- If the skill is **not installed**, VS Code will ask for confirmation before writing any file.

### Skill catalog

Browse all 940+ available skills:

- Open `assets/skills-catalog.md` (or `.agent/skills-catalog.md` after a sync)
- Or press `Ctrl+Shift+/` in VS Code to fuzzy-search and install skills

### Rules

1. Always check `.agent/skills/` before answering domain-specific questions.
2. When loading a skill, apply its guidance to your entire response.
3. Only reference skill IDs you can confirm exist in the catalog — never guess.
````

> **Tip:** You can also auto-generate this block by running **AI Skills: Copy Copilot Instructions** from the Command Palette (`Ctrl+Shift+P`).

---

## Language Model Tools (for AI Assistants)

This extension provides **7 Language Model Tools** that GitHub Copilot and other AI assistants can use programmatically during chat sessions:

### 1. `aiSkills_requestSkill` — Install & Load Skill

**Purpose:** Install a skill (if needed) and load its full content into the AI's context.

**Input Schema:**

```json
{
  "skillId": "string" // Required: The kebab-case skill ID
}
```

**When to use:** When you need domain-specific knowledge that a skill provides. Always check the catalog first before calling.

**Example:**

```
#tool:aiSkills_requestSkill {"skillId": "api-design-principles"}
```

---

### 2. `aiSkills_listInstalled` — List Installed Skills

**Purpose:** Discover what skills are already installed in the current workspace.

**Input Schema:**

```json
{
  "category": "string", // Optional: Filter by category
  "limit": "number" // Optional: Max results (default: 100)
}
```

**When to use:** When you need to know what skills are available without installing new ones.

**Example:**

```
#tool:aiSkills_listInstalled {"category": "react", "limit": 20}
```

---

### 3. `aiSkills_searchSkills` — Search Skill Catalog

**Purpose:** Search the full catalog (940+ skills) by keyword using fuzzy matching.

**Input Schema:**

```json
{
  "query": "string", // Required: Search keyword
  "category": "string", // Optional: Filter by category
  "limit": "number", // Optional: Max results (default: 20)
  "includeInstalled": "boolean" // Optional: Show install status (default: true)
}
```

**When to use:** When the user asks for skill recommendations or you need to discover relevant skills.

**Example:**

```
#tool:aiSkills_searchSkills {"query": "aws lambda", "limit": 10}
```

---

### 4. `aiSkills_getSkillInfo` — Get Skill Metadata

**Purpose:** Retrieve detailed information about a specific skill without installing it.

**Input Schema:**

```json
{
  "skillId": "string", // Required: The skill ID
  "includePreview": "boolean" // Optional: Include content preview if installed (default: false)
}
```

**When to use:** When you need to verify a skill exists or get its description before installing.

**Example:**

```
#tool:aiSkills_getSkillInfo {"skillId": "react-patterns", "includePreview": false}
```

---

### 5. `aiSkills_checkUpdates` — Check for Updates

**Purpose:** Check if installed skills have newer versions available in the catalog.

**Input Schema:**

```json
{
  "skillId": "string" // Optional: Check specific skill. Omit to check all installed skills.
}
```

**When to use:** Periodically or when the user asks about skill updates.

**Example:**

```
#tool:aiSkills_checkUpdates {}  // Check all installed skills
#tool:aiSkills_checkUpdates {"skillId": "react-patterns"}  // Check specific skill
```

---

### 6. `aiSkills_batchInstall` — Install Multiple Skills

**Purpose:** Install multiple skills in a single operation, either by ID list or by category.

**Input Schema:**

```json
{
  "skillIds": ["string"], // Optional: Array of skill IDs to install
  "category": "string", // Optional: Install all skills in a category (overrides skillIds)
  "overwrite": "boolean" // Optional: Overwrite existing skills (default: false)
}
```

**When to use:** When setting up a project with multiple skills or installing an entire category.

**Example:**

```
#tool:aiSkills_batchInstall {"skillIds": ["react-patterns", "typescript-best-practices"]}
#tool:aiSkills_batchInstall {"category": "api-design"}  // Install all API design skills
```

---

### 7. `aiSkills_planInstall` — Plan Install from Intent

**Purpose:** Convert a natural-language request into recommended skill IDs and optionally install them in one step.

**Input Schema:**

```json
{
  "query": "string", // Required: Natural language request
  "limit": "number", // Optional: Max recommendations (default: 8)
  "includeInstalled": "boolean", // Optional: Include already installed skills (default: true)
  "install": "boolean", // Optional: Install recommendations after confirmation (default: false)
  "overwrite": "boolean", // Optional: Overwrite existing installed files (default: false)
  "outputFormat": "\"markdown\"|\"json\"" // Optional: Response format (default: "markdown")
}
```

**When to use:** When the user asks to install a set of skills by intent (e.g. "react testing", "API security").

**Example:**

```
#tool:aiSkills_planInstall {"query": "react testing", "install": false}
#tool:aiSkills_planInstall {"query": "secure REST APIs", "install": true, "outputFormat": "json"}
```

---

## Tool Usage Best Practices

1. **Check catalog first** — Only call tools with skill IDs you can confirm exist
2. **No arbitrary limits** — You can call multiple tools but ensure they're relevant
3. **Call early** — Invoke tools at the start of your response so content is in context
4. **Handle errors gracefully** — If a tool fails, proceed without retrying
5. **Respect user confirmation** — Installation tools show confirmation dialogs for uninstalled skills
6. **Use JSON when chaining tools** — Set `outputFormat: "json"` for machine-readable responses

---

## Development

This extension uses [Bun](https://bun.sh) for installs and scripts (see `bun.lock`).

```bash
bun install
bun run compile        # one-off build
bun run compile:watch  # watch mode (also used by F5 preLaunchTask)
```

To start the Extension Development Host, first run `bun run compile:watch` in a terminal (or optionally create a VS Code task named "compile:watch" that runs that command), then press **F5** to launch the Extension Development Host — do not use `npm install` / `npm run` for local development.

---

## Contributing & Support

- Bugs / features → [GitHub Issues](https://github.com/aliabbaschadhar/copilot-superpowers/issues)
- Pull requests → see [CONTRIBUTING.md](CONTRIBUTING.md)
- Security → see [SECURITY.md](SECURITY.md)
- Changelog → [CHANGELOG.md](CHANGELOG.md)

MIT License · Built by [aliabbaschadhar](https://github.com/aliabbaschadhar) ❤️
