import * as vscode from 'vscode';
import { SkillsManager } from '../skills/SkillsManager';
import { SkillEntry } from '../skills/types';
import { isValidSkillId, isPathWithin } from '../security';
import { SkillUpdateTracker } from '../skills/SkillUpdateTracker';
import { ProjectLocalInstaller } from '../installers/projectLocalInstaller';
import { AgentActivityTracker } from '../activity/AgentActivityTracker';
import { trackSkillResolveAndInstall } from '../activity/trackSkillInstall';
import * as path from 'path';
import * as fs from 'fs';

interface BatchInstallInput {
  /** Array of skill IDs to install */
  skillIds: string[];
  /** Optional category filter - if provided, installs all skills in category instead of skillIds */
  category?: string;
  /** Overwrite existing skills without prompting. Default: false */
  overwrite?: boolean;
  /** Response format. Default: markdown */
  outputFormat?: 'markdown' | 'json';
}

export interface BatchInstallResult {
  skillId: string;
  success: boolean;
  message: string;
  installedPath?: string;
}

interface BatchInstallJsonResponse {
  summary: {
    total: number;
    installed: number;
    skipped: number;
    failed: number;
  };
  results: BatchInstallResult[];
}

/**
 * Language Model Tool that installs multiple skills in a single operation.
 * Supports installing by individual skill IDs or by category.
 */
export class BatchInstallTool implements vscode.LanguageModelTool<BatchInstallInput> {
  constructor(
    private readonly manager: SkillsManager,
    private readonly tracker: SkillUpdateTracker,
    private readonly activityTracker?: AgentActivityTracker
  ) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<BatchInstallInput>,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    const { skillIds, category } = options.input;

    let count: number;
    let description: string;

    if (category) {
      const skillsInCategory = this.manager.getByCategory(category);
      count = skillsInCategory.length;
      description = `category "${category}" (${count} skills)`;
    } else {
      count = skillIds?.length ?? 0;
      description = `${count} skill${count !== 1 ? 's' : ''}`;
    }

    return {
      confirmationMessages: {
        title: 'Install Multiple Skills',
        message: new vscode.MarkdownString(
          `Install ${description} to your workspace?\n\nThis will create skill files in \`.agent/skills/\`.`
        ),
      },
      invocationMessage: `Installing ${count} skill${count !== 1 ? 's' : ''}…`,
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<BatchInstallInput>,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const { skillIds, category, overwrite = false, outputFormat = 'markdown' } = options.input;

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          'Error: No workspace folder open. Please open a workspace folder before installing skills.'
        ),
      ]);
    }

    const workspaceRoot = workspaceFolder.uri.fsPath;

    // Determine which skills to install
    let skillsToInstall: SkillEntry[] = [];

    if (category) {
      // Install all skills in category
      skillsToInstall = this.manager.getByCategory(category);
      if (skillsToInstall.length === 0) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(
            `No skills found in category "${category}". Use aiSkills_searchSkills to find available categories.`
          ),
        ]);
      }
    } else if (skillIds && Array.isArray(skillIds)) {
      // Install specific skills
      const invalidIds: string[] = [];
      const notFoundIds: string[] = [];

      for (const id of skillIds) {
        if (!isValidSkillId(id)) {
          invalidIds.push(id);
          continue;
        }

        const skill = this.manager.findById(id);
        if (!skill) {
          notFoundIds.push(id);
          continue;
        }

        skillsToInstall.push(skill);
      }

      if (invalidIds.length > 0 || notFoundIds.length > 0) {
        let errorMsg = 'Batch install encountered invalid skills:\n';
        if (invalidIds.length > 0) {
          errorMsg += `- Invalid IDs: ${invalidIds.join(', ')}\n`;
        }
        if (notFoundIds.length > 0) {
          errorMsg += `- Not found: ${notFoundIds.join(', ')}\n`;
        }
        errorMsg += '\nUse aiSkills_searchSkills to find valid skill IDs.';
        return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(errorMsg)]);
      }
    }

    if (skillsToInstall.length === 0) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          'No skills to install. Provide valid skill IDs or a category name.'
        ),
      ]);
    }

    // Perform batch installation
    const results: BatchInstallResult[] = [];
    let installedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const skill of skillsToInstall) {
      if (token.isCancellationRequested) {
        break;
      }

      const result = await installSkill(
        skill,
        workspaceRoot,
        overwrite,
        this.manager,
        this.tracker,
        this.activityTracker
      );

      results.push(result);

      if (result.success) {
        installedCount++;
      } else if (
        result.message.includes('skipped') ||
        result.message.includes('already installed')
      ) {
        skippedCount++;
      } else {
        failedCount++;
      }
    }

    const response =
      outputFormat === 'json'
        ? JSON.stringify(
            buildBatchInstallJsonResponse(results, installedCount, skippedCount, failedCount)
          )
        : buildBatchInstallResponse(results, installedCount, skippedCount, failedCount);
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(response)]);
  }
}

export async function installSkill(
  skill: SkillEntry,
  workspaceRoot: string,
  overwrite: boolean,
  manager: SkillsManager,
  tracker: SkillUpdateTracker,
  activityTracker?: AgentActivityTracker
): Promise<BatchInstallResult> {
  try {
    const installer = new ProjectLocalInstaller();
    const destPath = installer.targetPath({
      skillId: skill.id,
      skillContent: '',
      workspaceRoot,
    });

    if (!overwrite && fs.existsSync(destPath)) {
      return {
        skillId: skill.id,
        success: true,
        message: `Skipped - already installed at ${destPath}`,
        installedPath: destPath,
      };
    }

    const writeSkill = async (
      skillFiles: Map<string, string>,
      content: string
    ): Promise<{ success: boolean; message?: string } | undefined> => {
      if (!isValidSkillId(skill.id)) {
        return { success: false, message: 'invalid skill id' };
      }

      const skillDir = path.dirname(destPath);
      // Validate all paths first
      for (const relPath of skillFiles.keys()) {
        if (relPath === 'SKILL.md') {
          continue;
        }
        const companionDest = path.join(skillDir, relPath);
        if (!isPathWithin(skillDir, companionDest)) {
          return { success: false, message: 'invalid companion path' };
        }
      }

      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(destPath, content, 'utf-8');

      for (const [relPath, fileContent] of skillFiles.entries()) {
        if (relPath === 'SKILL.md') {
          continue;
        }
        const companionDest = path.join(skillDir, relPath);
        fs.mkdirSync(path.dirname(companionDest), { recursive: true });
        fs.writeFileSync(companionDest, fileContent, 'utf-8');
      }

      tracker.setHash(skill.id, content);
      manager.invalidateInstallCache();

      return { success: true, message: `Installed to ${destPath}` };
    };

    if (activityTracker) {
      const outcome = await trackSkillResolveAndInstall(
        activityTracker,
        skill.id,
        manager,
        skill,
        writeSkill
      );
      if (!outcome) {
        return { skillId: skill.id, success: false, message: 'Failed to read skill content' };
      }
      return {
        skillId: skill.id,
        success: outcome.success,
        message: outcome.message ?? (outcome.success ? `Installed to ${destPath}` : 'Failed'),
        installedPath: outcome.success ? destPath : undefined,
      };
    }

    let skillFiles = await manager.readSkillDirectory(skill);
    let content = skillFiles.get('SKILL.md');
    if (!content) {
      content = (await manager.readContent(skill)) ?? undefined;
      if (content) {
        skillFiles = new Map([['SKILL.md', content]]);
      }
    }
    if (!content) {
      return { skillId: skill.id, success: false, message: 'Failed to read skill content' };
    }
    const outcome = await writeSkill(skillFiles, content);
    return {
      skillId: skill.id,
      success: outcome?.success ?? false,
      message: outcome?.message ?? 'Failed',
      installedPath: outcome?.success ? destPath : undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { skillId: skill.id, success: false, message: `Failed: ${msg}` };
  }
}

function buildBatchInstallJsonResponse(
  results: BatchInstallResult[],
  installed: number,
  skipped: number,
  failed: number
): BatchInstallJsonResponse {
  return {
    summary: {
      total: results.length,
      installed,
      skipped,
      failed,
    },
    results,
  };
}

function buildBatchInstallResponse(
  results: BatchInstallResult[],
  installed: number,
  skipped: number,
  failed: number
): string {
  const total = results.length;

  let response = `## Batch Install Complete\n\n`;
  response += `**Total:** ${total} | **Installed:** ${installed} | **Skipped:** ${skipped} | **Failed:** ${failed}\n\n`;

  if (installed > 0) {
    response += '### ✅ Installed Skills:\n\n';
    const installedResults = results.filter((r) => r.success && !r.message.includes('Skipped'));
    for (const result of installedResults) {
      response += `- **${result.skillId}** → ${result.installedPath}\n`;
    }
    response += '\n';
  }

  if (skipped > 0) {
    response += '### ⏭️ Skipped Skills:\n\n';
    const skippedResults = results.filter(
      (r) => r.message.includes('Skipped') || r.message.includes('already installed')
    );
    for (const result of skippedResults) {
      response += `- **${result.skillId}**: ${result.message}\n`;
    }
    response += '\n';
  }

  if (failed > 0) {
    response += '### ❌ Failed Skills:\n\n';
    const failedResults = results.filter((r) => !r.success);
    for (const result of failedResults) {
      response += `- **${result.skillId}**: ${result.message}\n`;
    }
    response += '\n';
  }

  response += '---\n';
  response += '**Next steps:**\n';
  response += '- Use `aiSkills_listInstalled` to see all installed skills\n';
  response += "- Use `aiSkills_requestSkill` to load a skill into Copilot's context\n";

  return response;
}

export function registerBatchInstallTool(
  manager: SkillsManager,
  tracker: SkillUpdateTracker,
  activityTracker?: AgentActivityTracker
): vscode.Disposable {
  return vscode.lm.registerTool(
    'aiSkills_batchInstall',
    new BatchInstallTool(manager, tracker, activityTracker)
  );
}
