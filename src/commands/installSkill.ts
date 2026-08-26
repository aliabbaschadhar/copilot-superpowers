import * as vscode from 'vscode';
import { SkillsManager } from '../skills/SkillsManager';
import { ProjectLocalInstaller } from '../installers/projectLocalInstaller';
import { InstallOptions } from '../installers/types';
import { ERR_SKILL_NOT_FOUND } from '../constants';
import { RecentSkills } from '../recentSkills';
import { SkillUpdateTracker } from '../skills/SkillUpdateTracker';
import { maybePushToChat } from '../chat/openInChat';
import { patchGitignoreOnFirstInstall } from '../gitignore/patchGitignore';
import { AgentActivityTracker } from '../activity/AgentActivityTracker';
import { trackSkillResolveAndInstall } from '../activity/trackSkillInstall';
import { isValidSkillId } from '../security';

export function registerInstallCommand(
  manager: SkillsManager,
  recentSkills: RecentSkills,
  tracker?: SkillUpdateTracker,
  context?: vscode.ExtensionContext,
  activityTracker?: AgentActivityTracker
): vscode.Disposable {
  return vscode.commands.registerCommand('aiSkills.install', async (skillId?: string) => {
    let resolvedId = skillId;

    if (!resolvedId) {
      const skills = manager.getAll();
      const picked = await vscode.window.showQuickPick(
        skills.map((s) => ({ label: s.id, description: s.description })),
        { placeHolder: 'Select skill to install…', matchOnDetail: true }
      );
      if (!picked) {
        return;
      }
      resolvedId = picked.label;
    }

    const skill = manager.findById(resolvedId);
    if (!skill) {
      vscode.window.showErrorMessage(ERR_SKILL_NOT_FOUND(resolvedId));
      return;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    const runInstall = async () => {
      if (!resolvedId || !isValidSkillId(resolvedId)) {
        return {
          success: false,
          message: `Invalid skill ID '${resolvedId || ''}'.`,
        };
      }

      if (!workspaceRoot) {
        return {
          success: false,
          message: 'No workspace folder is open. Open a project folder first, then install skills.',
        };
      }

      if (!activityTracker) {
        const skillFiles = await manager.readSkillDirectory(skill);
        const content = skillFiles.get('SKILL.md') ?? (await manager.readContent(skill));
        if (!content) {
          return { success: false, message: 'Content missing' };
        }
        const opts: InstallOptions = {
          skillId: resolvedId!,
          skillContent: content,
          skillFiles: skillFiles.size > 1 ? skillFiles : undefined,
          workspaceRoot,
          tracker,
        };
        const result = await new ProjectLocalInstaller().install(opts);
        return { success: result.success, message: result.message };
      }

      return trackSkillResolveAndInstall(
        activityTracker,
        resolvedId!,
        manager,
        skill,
        async (skillFiles, content) => {
          if (!workspaceRoot) {
            return {
              success: false,
              message:
                'No workspace folder is open. Open a project folder first, then install skills.',
            };
          }
          const opts: InstallOptions = {
            skillId: resolvedId!,
            skillContent: content,
            skillFiles: skillFiles.size > 1 ? skillFiles : undefined,
            workspaceRoot,
            tracker,
          };
          const result = await new ProjectLocalInstaller().install(opts);
          return { success: result.success, message: result.message };
        }
      );
    };

    let outcome: { success: boolean; message?: string } | undefined;
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Installing '${resolvedId}'…`,
        cancellable: false,
      },
      async () => {
        outcome = await runInstall();
      }
    );

    if (!outcome) {
      return;
    }

    if (outcome.success) {
      recentSkills.add(resolvedId!);
      if (context) {
        await patchGitignoreOnFirstInstall(context);
      }
      let destPath: string | undefined;
      if (workspaceRoot) {
        try {
          destPath = new ProjectLocalInstaller().targetPath({
            skillId: resolvedId!,
            skillContent: '',
            workspaceRoot,
          });
        } catch {
          // ignore
        }
      }
      const displayPath = destPath
        ? vscode.workspace.asRelativePath(destPath)
        : `.agent/skills/${resolvedId}/SKILL.md`;
      const action = await vscode.window.showInformationMessage(
        `Installed to ${displayPath}`,
        'Open File'
      );
      if (action === 'Open File' && destPath) {
        try {
          await vscode.window.showTextDocument(vscode.Uri.file(destPath));
        } catch {
          // File may not be readable in all editors
        }
      }
      await maybePushToChat([resolvedId!]);
    } else {
      vscode.window.showErrorMessage(`AI Skills: ${outcome.message ?? 'Install failed'}`);
    }
  });
}

/** Argument shapes that VSCode may pass from tree context menus */
type TreeItemArg = { skill: { id: string } } | string | undefined;

/** Also register the tree-context install command (same handler, different command id). */
export function registerInstallFromTreeCommand(_manager: SkillsManager): vscode.Disposable {
  return vscode.commands.registerCommand('aiSkills.installFromTree', async (item?: TreeItemArg) => {
    let skillId: string | undefined;
    if (item && typeof item === 'object' && 'skill' in item) {
      skillId = item.skill.id;
    } else if (typeof item === 'string') {
      skillId = item;
    }
    await vscode.commands.executeCommand('aiSkills.install', skillId);
  });
}
