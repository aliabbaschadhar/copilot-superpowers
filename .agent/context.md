# Context — Work Log & Context Tracker

Running log of decisions, discoveries, and session context for the **AI Agent Superpowers** extension.

---

## Session Log

### 2026-06-02 (CodeRabbit Review Resolutions — feature/live-agent-activity)

**Status:** Completed.

**What was changed:**

- **`src/commands/browseSkills.ts`** — Surfaced `outcome.message` in error toasts on install failures.
- **`src/commands/installSkill.ts`** — Integrated `isValidSkillId` validator in `runInstall` and computed real target path for the success notification.
- **`src/commands/installBulk.ts` & `src/extension.ts`** — Updated registration wrappers to accept and pass `tracker` and `context` arguments. Pushed `treeProvider` to extension subscriptions.
- **`src/chat/SkillsChatParticipant.ts`** — Deferred `isValidSkillId` validation to happen after exact/fuzzy resolution.
- **`src/tools/requestSkillTool.ts`** — Dynamicized install status check (`isInstalled`) during loading to track newly installed skills.
- **`src/tree/SkillsTreeProvider.ts`** — Placed the `Live Agent Activity` section at the end of the tree, separated from the above categories by 5 blank spacer items (`ActivitySectionGapItem`).

### 2026-06-02 (Skills Tree Auto-Refresh File System Watcher)

**Status:** Completed.

**What was changed:**

- **`src/tree/SkillsTreeProvider.ts`** — Implemented `vscode.workspace.createFileSystemWatcher` monitoring the `.agent/skills/` directory.
- **`src/tree/SkillsTreeProvider.ts`** — Added event listener to `onDidChange` on the watcher to trigger `this._onDidChangeTreeData.fire()` on file creation, deletion, or modification events.
- **`src/extension.ts`** — Implemented `setupSkillsFileWatcher` to watch the project-local `.agent/skills/` directory for any file system events (creation, modification, deletion). Pushed to extension subscriptions for leak protection.
- **`CHANGELOG.md`** — Documented the automatic sidebar tree view refresh fix under the `[Unreleased]` section.

### 2026-03-11 (README & documentation — editor-only focus)

**Status:** Complete.

**What was changed:**

- **`README.md`** — Fixed "Winsurf" → "Windsurf" typo in tagline. Removed stale `aiSkills.autoPasteDelayMs` row from the Configuration table (setting no longer exists in `package.json`). Clarified Quick Start text to say "editor's AI chat" (not "AI chat") to make the editor-only scope explicit.
- **`package.json`** — Fixed `description` field: corrected casing ("Windsurf", "AntiGravity"), removed "zed" (no installer exists for it), consistent with README.

---

### 2026-03-10 (Copilot LM Tool — aiSkills_requestSkill)

**Status:** Implemented. Copilot can now install and load skills on-demand during response generation.

**What was implemented:**

- **`src/tools/requestSkillTool.ts`** — New `RequestSkillTool` class implementing `vscode.LanguageModelTool<{ skillId: string }>`. `prepareInvocation` validates the skill ID and shows a native VS Code confirmation dialog when the skill is not yet installed. `invoke` installs the skill via the existing `aiSkills.install` command pipeline, then reads and returns the full `SKILL.md` content as a `LanguageModelToolResult`. Fast-path skips install and confirmation when the skill is already present.
- **`src/extension.ts`** — Imports `registerRequestSkillTool` and pushes the returned Disposable onto `context.subscriptions`.
- **`package.json`** — `engines.vscode` bumped to `^1.90.0` (required for stable `vscode.lm.registerTool`). `@types/vscode` bumped to `^1.90.0`. Added `contributes.languageModelTools` entry with full `modelDescription`, `inputSchema`, and `canBeReferencedInPrompt: true`.
- **`.github/copilot-instructions.md`** — Added _"Using the Skill Request Tool"_ section with trigger-to-skillId mapping table, usage examples, behavior, and rules.
- **`CHANGELOG.md`** — Added feature entry under `[Unreleased]`.

**Key constraint met:** No proposed VS Code APIs used. `vscode.lm.registerTool` is stable from VS Code 1.90.

### 2026-03-10 (Documentation cleanup)

**Status:** Removed 7 redundant/bloat markdown files; rewrote README.md from 440 lines → 85 lines.

**Deleted:**

- `DOCS_INDEX.md`, `DOCS_SUMMARY.md`, `DOCUMENTATION_COMPLETE.md` — auto-generated doc summaries, no value for end users
- `MARKETPLACE_CHECKLIST.md`, `MARKETPLACE_READY.md`, `MARKETPLACE_SUBMISSION.md` — internal publisher checklists, not OSS-relevant
- `QUICK_START.md` — content merged into the new slim README

**Remaining .md files:** README.md · CHANGELOG.md · CONTRIBUTING.md · SECURITY.md · CODE_OF_CONDUCT.md

---

### 2026-03-10

**Status:** Security audit complete — 5 vulnerabilities patched, all compile-clean.

**Vulnerabilities fixed:**

- **CRITICAL — Path traversal in `ProjectLocalInstaller.targetPath`**: `skillId` was used unsanitized in `path.join`; now blocked by `isValidSkillId()` + `isPathWithin()`.
- **CRITICAL — Path traversal in `uninstallSkill.ts`**: `resolvedId` was used unsanitized in `path.join`; same guards applied.
- **CRITICAL — Companion file path traversal in `BaseInstaller.install`**: `skillFiles` map keys from remote/bundled manifests were joined without validation; now filtered through `isSafeRelativePath()` + `isPathWithin()`.
- **HIGH — Unvalidated URL scheme in `RemoteSync.fetchIndex`**: User-configurable `remoteIndexUrl` accepted `file://` schemes; now strictly requires `https:`.
- **HIGH — Unvalidated `skill.path` from remote JSON in `SkillsRepository`**: `skill.path` from remote index was used in `readContent` / `readSkillDirectory` without checking for `..` traversal; now guarded by new `isSafeSkillPath()` method.

**New file:** `src/security.ts` — shared utilities: `isValidSkillId`, `isPathWithin`, `isHttpsUrl`, `isSafeRelativePath`.

### 2026-03-09

**Status:** Active development — full sidebar feature overhaul complete, ready for testing.

**What was implemented (sidebar overhaul):**

- **Favorites CRUD:** `toggleFavorite` command with inline star button on all skill types; `clearFavorites` command with confirmation on the Favorites section header.
- **Custom User Collections:** `UserCollections` class (globalState), full CRUD commands — `createCollection`, `editCollection`, `deleteCollection`, `addToCollection`, `removeFromCollection`. Collections displayed as `UserCollectionItem` nodes under a new Collections section header.
- **All Categories wrapper:** `AllCategoriesItem` tree node collapses all category nodes under a single `$(folder-library)` header, reducing sidebar clutter.
- **Skill update detection:** `SkillUpdateTracker` class records SHA-256 hashes of installed skill content. `SkillsManager.getSkillsWithUpdates(tracker)` returns outdated skills. After remote sync, outdated skills are highlighted with `$(arrow-up)` icon and `aiSkills.updatesAvailable` context key.
- **Batch update command:** `updateAllSkills` shows notification with count and Update All/Review options, calls `bulkInstall()`, re-hashes.
- **Auto-install on workspace open:** WorkspaceScanner recommendations trigger a notification ("Install X recommended skills?") with Install/Pick/Dismiss options; dismissed state stored in workspaceState.
- **RemoteSync retry logic:** 3 retries with 1s/2s/4s back-off, immediate null return on 4xx errors.
- **Fixed recommended install `when`-clause:** regex `/^skill-recommended(?!.*\.installed)/` correctly shows install button only on non-installed recommended skills.

**Known issues / tech debt:**

- `InstallationDetector` does a full disk scan on every tree refresh — should be memoized or event-driven.
- No real test coverage for installer classes.
- `WorkspaceScanner` only reads the root `package.json`; monorepos with nested packages are not scanned.
- Webview preview is plain text; no syntax highlighting for Markdown.

**What was fixed (browse & bulk-copy skill delivery):**

- **`aiSkills.browse` (Ctrl+Shift+/):** Replaced broken `workbench.action.chat.open isPartialQuery` call (which required the skill to already be installed globally — it never was). Now: reads the entire skill folder (`SKILL.md` + all companion files), installs project-locally to `.agent/skills/{id}/`, concatenates all file content (with `=== filename ===` section headers), writes to clipboard, then focuses the detected agent chat panel. User pastes with Ctrl+V.
- **`aiSkills.bulkCopy`:** Now installs each selected skill project-locally before copying. Clipboard content changed from bare `skill-id` lines to `/skill-id` lines (correct format for agent invocation). Success toast reports install count.
- **`buildCombinedContent` helper:** Added to `browseSkills.ts` — iterates the `Map<string, string>` returned by `readSkillDirectory()` and produces a single string with all skill files concatenated.

---

### 2026-03-08

**Status:** Active development — v1.1.0 released, v1.2.0 planning in progress.

**What exists:**

- Full VS Code extension skeleton with Activity Bar sidebar tree, Browse QuickPick, preview webview, and installer pipeline.
- 940+ skills bundled inside the `.vsix` via `assets/skills/` — works completely offline.
- Five agent installers: Claude Code, Gemini CLI, Cursor (project + global), GitHub Copilot, Generic.
- Background remote sync that merges new skills from a GitHub raw index without blocking startup.
- Workspace technology scanner that recommends relevant skills based on detected frameworks.
- Favorites and recents, both backed by `GlobalState`.
- `WorkspaceScanner` detects tech stack from package.json / file extensions.

**Recent changes (v1.1.0 — 2026-03-06):**

- Added Gemini CLI support (`~/.gemini/skills/{id}/SKILL.md`).
- Skill count updated to 940+.
- New `aiSkills.geminiSkillsPath` config.

**Recent changes (2026-03-08 — project-local install refactor):**

- All skills now install project-locally to `{workspaceRoot}/.agent/skills/{id}/SKILL.md`.
- `ProjectLocalInstaller` added (`src/installers/projectLocalInstaller.ts`) extending `BaseInstaller`.
- Agent-type picker removed from `installSkill.ts` and `installBulk.ts`.
- `InstallationDetector` stripped to check only `.agent/skills/{id}/SKILL.md`.
- `uninstallSkill.ts` simplified to `fs.rmSync` the `.agent/skills/{id}/` folder.
- Removed config keys: `aiSkills.defaultAgent`, `aiSkills.claudeSkillsPath`, `aiSkills.geminiSkillsPath`, `aiSkills.cursorScope`.

**Known issues / tech debt:**

- `InstallationDetector` does a full disk scan on every tree refresh — should be memoized or event-driven.
- No real test coverage for installer classes.
- `WorkspaceScanner` only reads the root `package.json`; monorepos with nested packages are not scanned.
- Remote sync has no retry logic or exponential back-off.
- Webview preview is plain text; no syntax highlighting for Markdown.

---

## Key Decisions

| Date       | Decision                                  | Rationale                                                                                                |
| ---------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 2026-03-10 | Copilot LM Tool (`aiSkills_requestSkill`) | On-demand skill injection during Copilot responses without requiring pre-installation                    |
| 2026-03-10 | `engines.vscode` bumped to `^1.90.0`      | `vscode.lm.registerTool` is stable from 1.90; no proposed API flag needed                                |
| 2026-03-08 | Project-local install (.agent/skills/)    | Skills scoped to workspace; avoids polluting global agent configs; aligns with repo-committed skill sets |
| 2026-03-06 | Separate `RemoteSync` class               | Separation of concerns; sync can be swapped (e.g., GraphQL later)                                        |
| 2026-03-05 | Fuse.js as sole runtime dep               | Fast, zero-config fuzzy search with no server round-trips                                                |
| 2026-03-05 | `esbuild` + `Bun` build chain             | Fastest TS bundling; Bun for script execution parity                                                     |

---

## Active Context

- **Current branch:** `dev`
- **Next milestone:** v1.2.0
- **Priority work items:** See `plan.md`
- **Editor target:** VS Code ^1.90.0 — no proposed APIs used

---

## Glossary

| Term       | Definition                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------- |
| Skill      | A `SKILL.md` file containing specialized AI agent instructions, identified by a kebab-case `id`     |
| SkillEntry | TypeScript interface representing a skill in the in-memory index                                    |
| Install    | Copying a skill's `SKILL.md` to an AI agent's config directory                                      |
| Source     | Origin of a skill: `bundle` (shipped in `.vsix`), `remote` (synced), or `local` (user's own folder) |
| Risk       | `safe` = no system access; `unknown` = requires agent judgment; `none` = not rated                  |
