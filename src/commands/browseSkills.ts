import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { SkillsManager, SkillEntry } from '../skills/SkillsManager';
import { ERR_NO_SKILLS, CONF_SHOW_RISK_BADGE } from '../constants';
import { RecentSkills } from '../recentSkills';
import { FavoriteSkills } from '../favoriteSkills';
import { FuzzySearch } from '../skills/FuzzySearch';
import { ProjectLocalInstaller } from '../installers/projectLocalInstaller';
import { InstallOptions } from '../installers/types';
import { openSkillsInChat } from '../chat/openInChat';
import { AgentActivityTracker } from '../activity/AgentActivityTracker';
import { trackSkillResolveAndInstall } from '../activity/trackSkillInstall';

/**
 * Parses special filter prefixes from browse query text.
 * Supported:
 *  /cat:ai      /cat:security
 *  /installed
 *
 * Returns the remaining query text and any active filters.
 */
interface BrowseFilters {
  category?: string;
  installedOnly?: boolean;
  risk?: 'safe' | 'unknown' | 'none';
  query: string;
}

function parseFilters(raw: string): BrowseFilters {
  let text = raw;
  const filters: BrowseFilters = { query: '' };

  // /cat:<category>
  const catMatch = text.match(/\/cat:([^\s]+)/i);
  if (catMatch) {
    filters.category = catMatch[1].toLowerCase();
    text = text.replace(catMatch[0], '');
  }

  // /installed
  if (/\/installed\b/i.test(text)) {
    filters.installedOnly = true;
    text = text.replace(/\/installed\b/i, '');
  }

  // /risk:safe  /risk:unknown  /risk:none
  const riskMatch = text.match(/\/risk:(safe|unknown|none)/i);
  if (riskMatch) {
    filters.risk = riskMatch[1].toLowerCase() as BrowseFilters['risk'];
    text = text.replace(riskMatch[0], '');
  }

  filters.query = text.trim().toLowerCase();
  return filters;
}

function applyFilters(
  skills: SkillEntry[],
  filters: BrowseFilters,
  manager: SkillsManager
): SkillEntry[] {
  let result = skills;
  if (filters.category) {
    result = result.filter((s) => s.category.toLowerCase().includes(filters.category!));
  }
  if (filters.installedOnly) {
    result = result.filter((s) => manager.isInstalled(s.id));
  }
  if (filters.risk) {
    result = result.filter((s) => s.risk === filters.risk);
  }
  return result;
}

function riskBadge(risk: SkillEntry['risk']): string {
  if (risk === 'safe') {
    return ' $(shield)';
  }
  if (risk === 'unknown') {
    return ' $(warning)';
  }
  return '';
}

function isRiskBadgeEnabled(): boolean {
  return vscode.workspace.getConfiguration().get<boolean>(CONF_SHOW_RISK_BADGE, true);
}

function toQuickPickItem(skill: SkillEntry, isFavorite = false): vscode.QuickPickItem {
  const showRisk = isRiskBadgeEnabled();
  const badge = showRisk && skill.risk !== 'none' ? riskBadge(skill.risk) : '';
  const riskLabel = showRisk && skill.risk !== 'none' ? ` · ${skill.risk}` : '';
  const categoryStr = skill.category !== 'uncategorized' ? skill.category : '';
  const description = categoryStr
    ? `${categoryStr}${riskLabel}`
    : riskLabel
      ? skill.risk
      : undefined;

  return {
    label: isFavorite
      ? `$(star-full) /${skill.id}${badge}`
      : `$(symbol-event) /${skill.id}${badge}`,
    description,
    detail: skill.description,
  };
}

async function handleSkillSelection(
  skillId: string,
  manager: SkillsManager,
  recentSkills: RecentSkills,
  activityTracker?: AgentActivityTracker
): Promise<void> {
  recentSkills.add(skillId);

  const skill = manager.findById(skillId);
  if (!skill) {
    vscode.window.showWarningMessage(`Skill '${skillId}' not found.`);
    return;
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showWarningMessage('Open a workspace folder to install skills project-locally.');
    return;
  }

  const runInstall = async (skillFiles: Map<string, string>, content: string) => {
    return await installSkillLocally(skill.id, content, skillFiles, workspaceRoot);
  };

  if (activityTracker) {
    const outcome = await trackSkillResolveAndInstall(
      activityTracker,
      skillId,
      manager,
      skill,
      runInstall
    );
    if (!outcome?.success) {
      vscode.window.showErrorMessage(
        outcome?.message || `Failed to resolve or install skill '${skillId}'.`
      );
      return;
    }
  } else {
    const skillFiles = await manager.readSkillDirectory(skill);
    const content = skillFiles.get('SKILL.md') ?? (await manager.readContent(skill));
    if (!content) {
      vscode.window.showWarningMessage(`Skill '${skillId}' has no readable content.`);
      return;
    }
    const outcome = await installSkillLocally(skill.id, content, skillFiles, workspaceRoot);
    if (!outcome.success) {
      vscode.window.showErrorMessage(
        outcome.message || `Failed to install skill '${skillId}' locally.`
      );
      return;
    }
  }

  await openSkillsInChat([skill.id]);
}

async function installSkillLocally(
  skillId: string,
  content: string,
  skillFiles: Map<string, string>,
  workspaceRoot: string
): Promise<{ success: boolean; message?: string }> {
  const skillInstallDir = path.join(workspaceRoot, '.agent', 'skills', skillId);
  if (fs.existsSync(path.join(skillInstallDir, 'SKILL.md'))) {
    return { success: true };
  }
  const opts: InstallOptions = {
    skillId,
    skillContent: content,
    skillFiles: skillFiles.size > 1 ? skillFiles : undefined,
    workspaceRoot,
  };
  try {
    const result = await new ProjectLocalInstaller().install(opts);
    return { success: result.success, message: result.message };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, message };
  }
}

// Chat injection is handled by the shared openSkillsInChat utility (src/chat/openInChat.ts).

export function registerBrowseCommand(
  manager: SkillsManager,
  recentSkills: RecentSkills,
  favoriteSkills: FavoriteSkills,
  activityTracker?: AgentActivityTracker
): vscode.Disposable {
  return vscode.commands.registerCommand('aiSkills.browse', async () => {
    const skills = manager.getAll();

    if (skills.length === 0) {
      vscode.window.showErrorMessage(ERR_NO_SKILLS);
      return;
    }

    const fuzzy = new FuzzySearch(skills);

    function buildItems(query: string): vscode.QuickPickItem[] {
      const filters = parseFilters(query);
      const hasFilters = !!(filters.category || filters.installedOnly);
      const textQuery = filters.query;

      if (!textQuery && !hasFilters) {
        const favIds = favoriteSkills.get();
        const favEntries = favIds
          .map((id) => manager.findById(id))
          .filter((s): s is SkillEntry => s !== undefined);

        const recentIds = recentSkills.get();
        const recentEntries = recentIds
          .map((id) => manager.findById(id))
          .filter((s): s is SkillEntry => s !== undefined);

        return [
          ...(favEntries.length > 0
            ? [
                { label: '⭐ Favorites', kind: vscode.QuickPickItemKind.Separator },
                ...favEntries.map((s) => toQuickPickItem(s, true)),
              ]
            : []),
          ...(recentEntries.length > 0
            ? [
                { label: 'Recently Used', kind: vscode.QuickPickItemKind.Separator },
                ...recentEntries.map((s) => toQuickPickItem(s, favoriteSkills.has(s.id))),
              ]
            : []),
          {
            label: 'Filter tips: /installed  #tag',
            kind: vscode.QuickPickItemKind.Separator,
          },
          { label: 'All Skills', kind: vscode.QuickPickItemKind.Separator },
          ...skills.map((s) => toQuickPickItem(s, favoriteSkills.has(s.id))),
        ];
      }

      // Apply structured filters first
      let filtered = hasFilters ? applyFilters(skills, filters, manager) : skills;

      if (textQuery && FuzzySearch.isTagQuery(textQuery)) {
        const tag = textQuery.slice(1);
        const results = fuzzy.searchByTag(textQuery).filter((s) => filtered.includes(s));
        return [
          {
            label: `$(tag) #${tag} — ${results.length} skill(s)`,
            kind: vscode.QuickPickItemKind.Separator,
          },
          ...results.map((s) => toQuickPickItem(s, favoriteSkills.has(s.id))),
        ];
      }

      // Fuzzy text search within filtered set
      if (textQuery) {
        const fuzzyFiltered = new FuzzySearch(filtered);
        const results = fuzzyFiltered.search(textQuery);
        const filterLabel = [
          filters.category ? `cat:${filters.category}` : '',
          filters.installedOnly ? 'installed' : '',
        ]
          .filter(Boolean)
          .join(' + ');

        return [
          ...(filterLabel
            ? [
                {
                  label: `$(filter) ${filterLabel} — ${results.length} result(s)`,
                  kind: vscode.QuickPickItemKind.Separator,
                },
              ]
            : []),
          ...results.map((s) => toQuickPickItem(s, favoriteSkills.has(s.id))),
        ];
      }

      // Filters only, no text query
      const filterLabel = [
        filters.category ? `cat:${filters.category}` : '',
        filters.installedOnly ? 'installed' : '',
      ]
        .filter(Boolean)
        .join(' + ');

      return [
        {
          label: `$(filter) ${filterLabel} — ${filtered.length} skill(s)`,
          kind: vscode.QuickPickItemKind.Separator,
        },
        ...filtered.map((s) => toQuickPickItem(s, favoriteSkills.has(s.id))),
      ];
    }

    const qp = vscode.window.createQuickPick();
    qp.placeholder = 'Search skills — select one or more, then press Enter';
    qp.canSelectMany = true;
    qp.matchOnDetail = false;
    qp.matchOnDescription = false;
    qp.items = buildItems('');

    // VS Code's QuickPick applies its own label filter on top of qp.items.
    // Persist filter tokens separately and strip them from qp.value so VS Code's
    // built-in filter only sees the plain text query.
    let persistedFilters: { category?: string; installedOnly?: boolean } = {};
    let suppressChange = false;

    qp.onDidChangeValue((value) => {
      if (suppressChange) {
        return;
      }

      const parsed = parseFilters(value);

      // Absorb any newly typed filter tokens into persisted state
      if (parsed.category !== undefined) {
        persistedFilters.category = parsed.category;
      }
      if (parsed.installedOnly) {
        persistedFilters.installedOnly = true;
      }

      // Reconstruct full filter expression so buildItems sees everything
      const fullExpression = [
        persistedFilters.category ? `/cat:${persistedFilters.category}` : '',
        persistedFilters.installedOnly ? '/installed' : '',
        parsed.query,
      ]
        .filter(Boolean)
        .join(' ');

      qp.items = buildItems(fullExpression);

      // Strip filter tokens from displayed input so VS Code's native filter
      // only runs against the plain text query.
      const hasNewTokens = /\/cat:|\/installed\b/i.test(value);
      if (hasNewTokens) {
        suppressChange = true;
        qp.value = parsed.query;
        suppressChange = false;
      }
    });

    qp.show();

    await new Promise<void>((resolve) => {
      qp.onDidAccept(async () => {
        // In canSelectMany mode, activeItems holds the item that was just
        // confirmed with Enter. If the user checked several items via Space and
        // then pressed Enter, selectedItems contains all checked entries.
        // Fall back to activeItems[0] so a plain Enter still works.
        const picked =
          qp.selectedItems.length > 0
            ? [...qp.selectedItems]
            : qp.activeItems.length > 0
              ? [qp.activeItems[0]]
              : [];

        qp.hide();
        resolve();

        const validPicked = picked.filter(
          (item) => item.kind !== vscode.QuickPickItemKind.Separator
        );

        if (validPicked.length === 0) {
          return;
        }

        for (const item of validPicked) {
          // Strip all codicons and the leading "/" to extract the bare skill ID.
          // Labels look like: "$(symbol-event) /skill-id $(shield)"
          const skillId = item.label
            .replace(/\$\([^)]+\)\s*/g, '') // remove every $(icon) and trailing whitespace
            .replace(/^\//, '') // remove leading slash
            .trim();
          await handleSkillSelection(skillId, manager, recentSkills, activityTracker);
        }
      });

      qp.onDidHide(() => resolve());
    });

    qp.dispose();
  });
}
