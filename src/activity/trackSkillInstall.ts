import { AgentActivityTracker, yieldToUi } from './AgentActivityTracker';
import { SkillsManager } from '../skills/SkillsManager';
import { SkillEntry } from '../skills/types';

/**
 * Resolves skill files and runs install while emitting two sidebar steps:
 * Loading skill → Installed (done).
 */
export interface SkillInstallOutcome {
  success: boolean;
  message?: string;
}

async function resolveSkillFilesAndContent(
  skill: SkillEntry,
  manager: SkillsManager
): Promise<{ skillFiles: Map<string, string>; content: string | undefined }> {
  let skillFiles = await manager.readSkillDirectory(skill);
  let content: string | undefined;
  if (skillFiles.size === 0) {
    content = (await manager.readContent(skill)) ?? undefined;
    if (content) {
      skillFiles = new Map([['SKILL.md', content]]);
    }
  } else {
    content = skillFiles.get('SKILL.md') ?? (await manager.readContent(skill)) ?? undefined;
  }
  return { skillFiles, content };
}

function handleInstallOutcome(
  result: SkillInstallOutcome | undefined,
  tracker: AgentActivityTracker
): void {
  if (result === undefined) {
    tracker.fail('Cancelled');
    return;
  }
  if (result.success) {
    tracker.completeDone();
  } else {
    tracker.fail(result.message ?? 'Failed');
  }
}

export async function trackSkillResolveAndInstall(
  tracker: AgentActivityTracker,
  skillId: string,
  manager: SkillsManager,
  skill: SkillEntry,
  install: (
    skillFiles: Map<string, string>,
    content: string
  ) => Promise<SkillInstallOutcome | undefined>
): Promise<SkillInstallOutcome | undefined> {
  tracker.beginSkillOperation(skillId, true);
  try {
    await yieldToUi();

    const { skillFiles, content } = await resolveSkillFilesAndContent(skill, manager);
    if (!content) {
      tracker.fail('Content missing');
      return undefined;
    }

    tracker.finishLoading(skillFiles.size);
    await yieldToUi();
    tracker.startInstalling();
    await yieldToUi();

    const result = await install(skillFiles, content);
    handleInstallOutcome(result, tracker);
    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    tracker.fail(msg);
    throw err;
  }
}

/**
 * Load-only (chat / already installed): Loading skill → Done.
 */
export async function trackSkillResolveAndLoad(
  tracker: AgentActivityTracker,
  skillId: string,
  manager: SkillsManager,
  skill: SkillEntry
): Promise<Map<string, string>> {
  tracker.beginSkillOperation(skillId, false);
  try {
    await yieldToUi();

    const skillFiles = await manager.readSkillDirectory(skill);
    if (skillFiles.size === 0) {
      tracker.fail('Content missing');
      return new Map();
    }

    tracker.finishLoading(skillFiles.size);
    await yieldToUi();
    tracker.completeLoadOnly();
    return skillFiles;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    tracker.fail(msg);
    throw err;
  }
}
