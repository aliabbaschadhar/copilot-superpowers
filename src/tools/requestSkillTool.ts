import * as vscode from 'vscode';
import { SkillsManager } from '../skills/SkillsManager';
import { isValidSkillId } from '../security';
import { log } from '../logger';
import { AgentActivityTracker } from '../activity/AgentActivityTracker';
import { trackSkillResolveAndLoad } from '../activity/trackSkillInstall';

interface RequestSkillInput {
  skillId: string;
  /** Response format. Default: markdown */
  outputFormat?: 'markdown' | 'json';
}

/**
 * A VS Code Language Model Tool that GitHub Copilot can call during response
 * generation to install and load a skill from the catalog into its context.
 *
 * Flow:
 *  1. Copilot detects that a domain-specific skill would improve its answer.
 *  2. Copilot calls this tool with the kebab-case skill ID.
 *  3. `prepareInvocation` validates the ID and, when the skill is not yet
 *     installed, surfaces a user confirmation dialog (so nothing installs
 *     silently).
 *  4. `invoke` installs the skill if needed, then returns the full SKILL.md
 *     content as a LanguageModelToolResult so Copilot can incorporate it.
 */
export class RequestSkillTool implements vscode.LanguageModelTool<RequestSkillInput> {
  constructor(
    private readonly manager: SkillsManager,
    private readonly activityTracker?: AgentActivityTracker
  ) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<RequestSkillInput>,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.PreparedToolInvocation> {
    const { skillId } = options.input;

    // If already installed: fast-path — no confirmation needed, just load.
    if (this.manager.isInstalled(skillId)) {
      return {
        invocationMessage: `Loading skill **${skillId}**…`,
      };
    }

    // Validate before showing a confirmation so we never prompt for garbage.
    if (!isValidSkillId(skillId)) {
      return {
        invocationMessage: `Skill ID is invalid.`,
      };
    }

    if (!this.manager.findById(skillId)) {
      return {
        invocationMessage: `Skill **${skillId}** not found in the catalog.`,
      };
    }

    // Skill exists but is not installed — ask the user for permission.
    return {
      confirmationMessages: {
        title: 'Install & Use Skill',
        message: new vscode.MarkdownString(
          `Copilot wants to install the **${skillId}** skill from the AI Agent Skills catalog and use it in this response.\n\nThis will create \`.agent/skills/${skillId}/\` in your workspace.`
        ),
      },
      invocationMessage: `Installing skill **${skillId}**…`,
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<RequestSkillInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const { skillId, outputFormat = 'markdown' } = options.input;

    // Security: always re-validate even if prepareInvocation passed.
    if (!isValidSkillId(skillId)) {
      log(`RequestSkillTool: rejected invalid skillId "${skillId}"`);
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `Error: "${skillId}" is not a valid skill ID. Use a kebab-case identifier like "react-patterns".`
        ),
      ]);
    }

    const skill = this.manager.findById(skillId);
    if (!skill) {
      log(`RequestSkillTool: skill "${skillId}" not found in catalog`);
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `Skill "${skillId}" was not found in the catalog. Run "AI Skills: Refresh Catalog" or check the skills catalog for the correct ID.`
        ),
      ]);
    }

    const wasInstalled = this.manager.isInstalled(skillId);
    if (!wasInstalled) {
      log(`RequestSkillTool: installing "${skillId}"…`);
      try {
        await vscode.commands.executeCommand('aiSkills.install', skillId);
        this.manager.invalidateInstallCache();
        log(`RequestSkillTool: installed "${skillId}"`);
      } catch (err) {
        log(`RequestSkillTool: install failed for "${skillId}": ${String(err)}`);
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(
            `Failed to install skill "${skillId}". Please install it manually via the AI Skills sidebar or run "AI Skills: Install Skill".`
          ),
        ]);
      }

      const isInstalledNow = this.manager.isInstalled(skillId);
      if (!isInstalledNow) {
        log(`RequestSkillTool: install check failed for "${skillId}" after invalidating cache`);
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(
            `Failed to install skill "${skillId}". Please install it manually via the AI Skills sidebar or run "AI Skills: Install Skill".`
          ),
        ]);
      }
    } else {
      log(`RequestSkillTool: "${skillId}" already installed, loading content`);
    }

    const skillFiles =
      this.activityTracker && this.manager.isInstalled(skillId)
        ? await trackSkillResolveAndLoad(this.activityTracker, skillId, this.manager, skill)
        : await this.manager.readSkillDirectory(skill);
    if (skillFiles.size === 0) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `Skill "${skillId}" was installed but its content could not be read.`
        ),
      ]);
    }

    const combined = buildCombinedContent(skillId, skillFiles);
    const response =
      outputFormat === 'json'
        ? JSON.stringify({
            skillId,
            files: [...skillFiles.entries()].map(([path, content]) => ({ path, content })),
            combinedText: combined,
          })
        : combined;

    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(response)]);
  }
}

/**
 * Concatenates all files in a skill directory into a single string.
 * SKILL.md is always placed first; remaining files follow in sorted order,
 * each clearly separated by a filename header so Copilot knows the source.
 */
function buildCombinedContent(skillId: string, files: Map<string, string>): string {
  const parts: string[] = [
    `The following is the "${skillId}" skill. Apply its guidance to your response:\n`,
  ];

  // SKILL.md first
  const main = files.get('SKILL.md');
  if (main) {
    parts.push(`=== SKILL.md ===\n${main}`);
  }

  // All other files in deterministic order
  const others = [...files.entries()]
    .filter(([name]) => name !== 'SKILL.md')
    .sort(([a], [b]) => a.localeCompare(b));

  for (const [name, content] of others) {
    parts.push(`=== ${name} ===\n${content}`);
  }

  return parts.join('\n\n');
}

/**
 * Registers the RequestSkillTool with the VS Code language model system and
 * returns a Disposable to clean up on extension deactivation.
 */
export function registerRequestSkillTool(
  manager: SkillsManager,
  activityTracker?: AgentActivityTracker
): vscode.Disposable {
  return vscode.lm.registerTool(
    'aiSkills_requestSkill',
    new RequestSkillTool(manager, activityTracker)
  );
}
