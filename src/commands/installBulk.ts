import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { SkillsManager } from '../skills/SkillsManager';
import { SkillEntry } from '../skills/types';
import { SkillsTreeProvider } from '../tree/SkillsTreeProvider';
import {
  CategoryItem,
  CollectionItem,
  UserCollectionItem,
  RecommendedSectionItem,
} from '../tree/nodes';
import { InstallOptions, InstallResult } from '../installers/types';
import { ProjectLocalInstaller } from '../installers/projectLocalInstaller';
import { SkillUpdateTracker } from '../skills/SkillUpdateTracker';
import { maybePushToChat } from '../chat/openInChat';
import { patchGitignoreOnFirstInstall } from '../gitignore/patchGitignore';
import { AgentActivityTracker } from '../activity/AgentActivityTracker';
import { trackSkillResolveAndInstall } from '../activity/trackSkillInstall';
import { isValidSkillId, isPathWithin } from '../security';

// ─── Path helper ──────────────────────────────────────────────────────────────

function computeTargetPath(skillId: string, workspaceRoot: string): string {
  return new ProjectLocalInstaller().targetPath({ skillId, skillContent: '', workspaceRoot });
}

/**
 * Write a skill file (and any companions) directly — no modal prompts.
 * Decisions about skip/overwrite are made at the batch level before this call.
 */
function writeDirectly(destPath: string, opts: InstallOptions): InstallResult {
  try {
    const skillDir = path.dirname(destPath);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(destPath, opts.skillContent, 'utf-8');

    if (opts.skillFiles) {
      for (const [relPath, content] of opts.skillFiles) {
        if (relPath === 'SKILL.md') {
          continue;
        }
        const companionDest = path.join(skillDir, relPath);
        fs.mkdirSync(path.dirname(companionDest), { recursive: true });
        fs.writeFileSync(companionDest, content, 'utf-8');
      }
    }

    return { success: true, destPath, message: `Installed to ${destPath}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, destPath, message: `Failed: ${msg}` };
  }
}

// ─── Core bulk install logic ───────────────────────────────────────────────────

interface InstallCounts {
  installed: number;
  skipped: number;
  failed: number;
  cancelled: boolean;
  /** IDs that were successfully written to disk in this operation. */
  installedIds: string[];
}

async function installSingleSkill(
  skill: SkillEntry,
  workspaceRoot: string,
  overwriteExisting: boolean | null,
  manager: SkillsManager,
  tracker: SkillUpdateTracker | undefined,
  activityTracker?: AgentActivityTracker
): Promise<'installed' | 'skipped' | 'failed'> {
  const destPath = computeTargetPath(skill.id, workspaceRoot);
  if (overwriteExisting === false && fs.existsSync(destPath)) {
    return 'skipped';
  }

  const writeSkill = async (
    skillFiles: Map<string, string>,
    content: string
  ): Promise<{ success: boolean; message?: string } | undefined> => {
    if (!isValidSkillId(skill.id)) {
      return { success: false, message: 'invalid skill id' };
    }

    const skillDir = path.dirname(destPath);
    for (const relPath of skillFiles.keys()) {
      if (relPath === 'SKILL.md') {
        continue;
      }
      const resolvedPath = path.join(skillDir, relPath);
      if (!isPathWithin(skillDir, resolvedPath)) {
        return { success: false, message: 'invalid companion path' };
      }
    }

    const opts: InstallOptions = {
      skillId: skill.id,
      skillContent: content,
      skillFiles: skillFiles.size > 1 ? skillFiles : undefined,
      workspaceRoot,
    };
    const result = writeDirectly(destPath, opts);
    if (result.success && tracker) {
      tracker.setHash(skill.id, content);
    }
    return { success: result.success, message: result.message };
  };

  try {
    if (activityTracker) {
      const outcome = await trackSkillResolveAndInstall(
        activityTracker,
        skill.id,
        manager,
        skill,
        writeSkill
      );
      if (!outcome) {
        return 'failed';
      }
      return outcome.success ? 'installed' : 'failed';
    }

    const skillFiles = await manager.readSkillDirectory(skill);
    const content = skillFiles.get('SKILL.md') ?? (await manager.readContent(skill));
    if (!content) {
      return 'failed';
    }
    const outcome = await writeSkill(skillFiles, content);
    return outcome?.success ? 'installed' : 'failed';
  } catch {
    return 'failed';
  }
}

function reportResults(counts: InstallCounts): void {
  const parts = [`${counts.installed} installed`];
  if (counts.skipped > 0) {
    parts.push(`${counts.skipped} skipped`);
  }
  if (counts.failed > 0) {
    parts.push(`${counts.failed} failed`);
  }
  if (counts.cancelled) {
    parts.push('cancelled');
  }
  vscode.window.showInformationMessage(`AI Skills bulk install complete: ${parts.join(' · ')}.`);
}

export async function bulkInstall(
  skills: SkillEntry[],
  label: string,
  manager: SkillsManager,
  tracker?: SkillUpdateTracker,
  context?: vscode.ExtensionContext,
  activityTracker?: AgentActivityTracker
): Promise<void> {
  if (skills.length === 0) {
    vscode.window.showInformationMessage('AI Skills: No skills to install.');
    return;
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showErrorMessage(
      'AI Skills: No workspace folder is open. Open a project folder first, then install skills.'
    );
    return;
  }

  let overwriteExisting: boolean | null = null;
  const cfg = vscode.workspace.getConfiguration('aiSkills');
  const confirmOverwrite = cfg.get<boolean>('confirmOverwrite', true);

  if (confirmOverwrite) {
    const conflicting = skills.filter((s) => fs.existsSync(computeTargetPath(s.id, workspaceRoot)));
    if (conflicting.length > 0) {
      const choice = await vscode.window.showWarningMessage(
        `${conflicting.length} of ${skills.length} skills are already installed. What would you like to do?`,
        { modal: true },
        'Skip Existing',
        'Overwrite All',
        'Cancel'
      );
      if (!choice || choice === 'Cancel') {
        return;
      }
      overwriteExisting = choice === 'Overwrite All';
    }
  } else {
    overwriteExisting = true;
  }

  const counts: InstallCounts = {
    installed: 0,
    skipped: 0,
    failed: 0,
    cancelled: false,
    installedIds: [],
  };

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Installing ${label}…`,
      cancellable: true,
    },
    async (progress, token) => {
      for (let i = 0; i < skills.length; i++) {
        if (token.isCancellationRequested) {
          counts.cancelled = true;
          break;
        }
        progress.report({
          message: `(${i + 1}/${skills.length}) ${skills[i].id}`,
          increment: (1 / skills.length) * 100,
        });
        const outcome = await installSingleSkill(
          skills[i],
          workspaceRoot,
          overwriteExisting,
          manager,
          tracker,
          activityTracker
        );
        counts[outcome]++;
        if (outcome === 'installed') {
          counts.installedIds.push(skills[i].id);
        }
      }
    }
  );

  reportResults(counts);
  // Patch .gitignore on the first bulk install in this workspace
  if (context && counts.installed > 0) {
    await patchGitignoreOnFirstInstall(context);
  }
  // Push successfully installed skills into chat, honouring the openChatOnInstall setting.
  await maybePushToChat(counts.installedIds);
}

// ─── Bulk uninstall helper ────────────────────────────────────────────────────

async function bulkUninstallSkills(
  skills: SkillEntry[],
  label: string,
  workspaceRoot: string,
  treeProvider: SkillsTreeProvider
): Promise<void> {
  if (skills.length === 0) {
    vscode.window.showInformationMessage('AI Skills: No installed skills to remove.');
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `Remove ${skills.length} installed skill(s) from ${label}?`,
    { modal: true },
    'Remove All',
    'Cancel'
  );
  if (confirm !== 'Remove All') {
    return;
  }

  let removed = 0;
  let failed = 0;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Uninstalling ${label}…`,
      cancellable: false,
    },
    async () => {
      for (const skill of skills) {
        const skillDir = path.join(workspaceRoot, '.agent', 'skills', skill.id);
        try {
          fs.rmSync(skillDir, { recursive: true, force: true });
          removed++;
        } catch {
          failed++;
        }
      }
    }
  );

  treeProvider.refreshAfterInstall();

  const msg =
    failed > 0
      ? `AI Skills: Removed ${removed} skill(s). ${failed} failed — see Output for details.`
      : `AI Skills: Removed ${removed} skill(s) from ${label}.`;
  vscode.window.showInformationMessage(msg);
}

// ─── Command registrations ─────────────────────────────────────────────────────

/** Right-click a category node → "Install All in Category" */
export function registerInstallCategoryCommand(
  manager: SkillsManager,
  tracker?: SkillUpdateTracker,
  context?: vscode.ExtensionContext,
  activityTracker?: AgentActivityTracker
): vscode.Disposable {
  return vscode.commands.registerCommand(
    'aiSkills.installCategory',
    async (item?: CategoryItem) => {
      if (!item?.category) {
        vscode.window.showErrorMessage('AI Skills: No category selected.');
        return;
      }
      const skills = manager.getByCategory(item.category);
      await bulkInstall(
        skills,
        `"${item.category}" (${skills.length} skills)`,
        manager,
        tracker,
        context,
        activityTracker
      );
    }
  );
}

/** Toolbar button / summary node → "Install All Skills" (respects active filter) */
export function registerInstallAllCommand(
  manager: SkillsManager,
  treeProvider: SkillsTreeProvider,
  tracker?: SkillUpdateTracker,
  context?: vscode.ExtensionContext,
  activityTracker?: AgentActivityTracker
): vscode.Disposable {
  return vscode.commands.registerCommand('aiSkills.installAll', async () => {
    const skills = treeProvider.getFilteredSkills();
    const label = treeProvider.isFiltering()
      ? `filtered results (${skills.length} skills)`
      : `all skills (${skills.length})`;
    await bulkInstall(skills, label, manager, tracker, context, activityTracker);
  });
}
/** Right-click a fully-installed category node → "Uninstall All in Category" */
export function registerUninstallCategoryCommand(
  manager: SkillsManager,
  treeProvider: SkillsTreeProvider
): vscode.Disposable {
  return vscode.commands.registerCommand(
    'aiSkills.uninstallCategory',
    async (item?: CategoryItem) => {
      if (!item?.category) {
        vscode.window.showErrorMessage('AI Skills: No category selected.');
        return;
      }
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        vscode.window.showErrorMessage('AI Skills: No workspace folder is open.');
        return;
      }
      const installedSkills = manager
        .getByCategory(item.category)
        .filter((s) => manager.isInstalled(s.id));
      await bulkUninstallSkills(
        installedSkills,
        `"${item.category}" category`,
        workspaceRoot,
        treeProvider
      );
    }
  );
}

/** Right-click a fully-installed collection node → "Uninstall Collection" */
export function registerUninstallCollectionCommand(
  manager: SkillsManager,
  treeProvider: SkillsTreeProvider
): vscode.Disposable {
  return vscode.commands.registerCommand(
    'aiSkills.uninstallCollection',
    async (item?: CollectionItem | UserCollectionItem) => {
      if (!item?.collection) {
        vscode.window.showErrorMessage('AI Skills: No collection selected.');
        return;
      }
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        vscode.window.showErrorMessage('AI Skills: No workspace folder is open.');
        return;
      }
      const installedSkills = item.collection.skillIds
        .map((id) => manager.findById(id))
        .filter((s): s is SkillEntry => s !== undefined)
        .filter((s) => manager.isInstalled(s.id));
      await bulkUninstallSkills(
        installedSkills,
        `"${item.collection.name}" collection`,
        workspaceRoot,
        treeProvider
      );
    }
  );
}

/** Right-click a collection node → "Install Collection" */
export function registerInstallCollectionCommand(
  manager: SkillsManager,
  tracker?: SkillUpdateTracker,
  context?: vscode.ExtensionContext,
  activityTracker?: AgentActivityTracker
): vscode.Disposable {
  return vscode.commands.registerCommand(
    'aiSkills.installCollection',
    async (item?: CollectionItem | UserCollectionItem | RecommendedSectionItem) => {
      // Handle RecommendedSectionItem
      if (item instanceof RecommendedSectionItem) {
        if (item.skills.length === 0) {
          vscode.window.showErrorMessage('AI Skills: No recommended skills available.');
          return;
        }
        await bulkInstall(
          item.skills,
          `recommended skills (${item.skills.length} skills)`,
          manager,
          tracker,
          context,
          activityTracker
        );
        return;
      }

      // Handle CollectionItem and UserCollectionItem
      if (!item || !(item instanceof CollectionItem || item instanceof UserCollectionItem)) {
        vscode.window.showErrorMessage('AI Skills: No collection selected.');
        return;
      }

      const collection = item.collection;
      const skillIds = collection.skillIds;
      const skills = skillIds
        .map((id) => manager.findById(id))
        .filter((s): s is SkillEntry => s !== undefined);

      if (skills.length === 0) {
        vscode.window.showErrorMessage('AI Skills: No valid skills found in this collection.');
        return;
      }

      await bulkInstall(
        skills,
        `"${collection.name}" collection (${skills.length} skills)`,
        manager,
        tracker,
        context,
        activityTracker
      );
    }
  );
}
