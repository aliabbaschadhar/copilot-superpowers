import * as vscode from 'vscode';
import { SkillsManager } from '../skills/SkillsManager';
import { FuzzySearch } from '../skills/FuzzySearch';
import { log } from '../logger';
import { AgentActivityTracker } from '../activity/AgentActivityTracker';
import { trackSkillResolveAndLoad } from '../activity/trackSkillInstall';
import { isValidSkillId } from '../security';

// ── Constants ──────────────────────────────────────────────────────────────

export const PARTICIPANT_ID = 'aiSkills.participant';

/**
 * Prompt shown when the user invokes @aiSkills without a skill ID.
 */
const HELP_TEXT = `
**AI Agent Skills** — type a skill name after \`@aiSkills\` to activate it.

Examples:
- \`@aiSkills plan-writing\`
- \`@aiSkills react-patterns\`
- \`@aiSkills /plan-writing\`

You can also type \`@aiSkills list\` to see all installed skills,
or \`@aiSkills search <query>\` to find skills.
`.trim();

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Concatenates all skill files into a single markdown block the model can read.
 * SKILL.md is first; supplementary files follow with clear file-name headers.
 */
function buildSkillContext(skillId: string, files: Map<string, string>): string {
  const parts: string[] = [
    `> **Skill activated: \`${skillId}\`** — the following guidance is now in your context.\n`,
  ];

  const main = files.get('SKILL.md');
  if (main) {
    parts.push(main);
  }

  const others = [...files.entries()]
    .filter(([name]) => name !== 'SKILL.md')
    .sort(([a], [b]) => a.localeCompare(b));

  for (const [name, content] of others) {
    parts.push(`\n---\n**${name}**\n\n${content}`);
  }

  return parts.join('\n\n');
}

/**
 * Strips a leading slash if the user typed "/skill-id" instead of "skill-id".
 */
function normaliseQuery(raw: string): string {
  return raw.trim().replace(/^\//, '').trim();
}

// ── Request handler ────────────────────────────────────────────────────────

function handleHelp(response: vscode.ChatResponseStream): vscode.ChatResult {
  response.markdown(HELP_TEXT);
  return {};
}

function handleList(
  manager: SkillsManager,
  response: vscode.ChatResponseStream
): vscode.ChatResult {
  const installedIds = manager.getInstalledIds();
  if (installedIds.size === 0) {
    response.markdown(
      'No skills are installed in this workspace yet. Use the sidebar or `Ctrl+Shift+/` to install some.'
    );
    return {};
  }
  const lines = [...installedIds].sort().map((id) => `- \`${id}\``);
  response.markdown(`**Installed skills (${installedIds.size}):**\n\n${lines.join('\n')}`);
  return {};
}

function handleSearch(
  manager: SkillsManager,
  raw: string,
  response: vscode.ChatResponseStream
): vscode.ChatResult {
  const query = raw.slice(7).trim();
  if (!query) {
    response.markdown('Please provide a search term, e.g. `@aiSkills search react`.');
    return {};
  }
  const fuzzy = new FuzzySearch(manager.getAll());
  const results = fuzzy.search(query).slice(0, 10);
  if (results.length === 0) {
    response.markdown(`No skills found for **${query}**.`);
    return {};
  }
  const installedIds = manager.getInstalledIds();
  const lines = results.map((s) => {
    const badge = installedIds.has(s.id) ? ' ✓' : '';
    return `- \`${s.id}\`${badge} — ${s.description}`;
  });
  response.markdown(`**Skills matching "${query}":**\n\n${lines.join('\n')}`);
  return {};
}

async function handleActivate(
  manager: SkillsManager,
  activityTracker: AgentActivityTracker | undefined,
  skillId: string,
  response: vscode.ChatResponseStream
): Promise<vscode.ChatResult> {
  // Try exact match first, then fuzzy fallback
  let skill = manager.findById(skillId);
  if (!skill) {
    const fuzzy = new FuzzySearch(manager.getAll());
    const results = fuzzy.search(skillId);
    if (results.length > 0) {
      skill = results[0];
    }
  }

  if (!skill || !isValidSkillId(skill.id)) {
    response.markdown(
      `Skill **\`${skill?.id || skillId}\`** is not a valid skill identifier.\n\n` +
        `Try \`@aiSkills search ${skillId}\` to find similar skills.`
    );
    return {};
  }

  log(`SkillsChatParticipant: loading "${skill.id}"…`);
  response.progress(`Loading skill: ${skill.id}…`);

  const skillFiles = activityTracker
    ? await trackSkillResolveAndLoad(activityTracker, skill.id, manager, skill)
    : await manager.readSkillDirectory(skill);

  if (skillFiles.size === 0) {
    response.markdown(
      `Could not read content for **\`${skill.id}\`**. ` +
        `Try refreshing the catalog: run "AI Skills: Refresh Catalog".`
    );
    return {};
  }

  const context = buildSkillContext(skill.id, skillFiles);
  response.markdown(context);

  // Offer a follow-up to also install the skill locally
  if (!manager.isInstalled(skill.id)) {
    response.button({
      title: '$(cloud-download) Install to workspace',
      command: 'aiSkills.install',
      arguments: [skill.id],
    });
  }

  log(`SkillsChatParticipant: delivered "${skill.id}" (${skillFiles.size} file(s))`);
  return { metadata: { skillId: skill.id } };
}

async function handleRequest(
  manager: SkillsManager,
  activityTracker: AgentActivityTracker | undefined,
  request: vscode.ChatRequest,
  _context: vscode.ChatContext,
  response: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
  const raw = request.prompt.trim();

  if (!raw || raw === 'help' || raw === '?') {
    return handleHelp(response);
  }

  if (raw.toLowerCase() === 'list') {
    return handleList(manager, response);
  }

  if (raw.toLowerCase().startsWith('search ')) {
    return handleSearch(manager, raw, response);
  }

  if (token.isCancellationRequested) {
    return {};
  }

  const skillId = normaliseQuery(raw);
  return handleActivate(manager, activityTracker, skillId, response);
}

// ── Follow-up provider ─────────────────────────────────────────────────────

/**
 * After a skill is delivered, suggest common next actions.
 */
function provideFollowups(
  result: vscode.ChatResult,
  _context: vscode.ChatContext,
  _token: vscode.CancellationToken
): vscode.ChatFollowup[] {
  const skillId = (result.metadata as Record<string, unknown> | undefined)?.skillId as
    | string
    | undefined;
  if (!skillId) {
    return [];
  }
  return [
    {
      label: `$(symbol-event) Use another skill`,
      prompt: '',
      participant: PARTICIPANT_ID,
    },
    {
      label: `$(list-unordered) List installed skills`,
      prompt: 'list',
      participant: PARTICIPANT_ID,
    },
  ];
}

// ── Registration ───────────────────────────────────────────────────────────

/**
 * Creates and registers the @aiSkills chat participant.
 * Returns a Disposable for cleanup on deactivation.
 */
export function registerSkillsChatParticipant(
  manager: SkillsManager,
  activityTracker?: AgentActivityTracker
): vscode.Disposable {
  const participant = vscode.chat.createChatParticipant(
    PARTICIPANT_ID,
    (request, context, response, token) =>
      handleRequest(manager, activityTracker, request, context, response, token)
  );

  participant.iconPath = new vscode.ThemeIcon('symbol-event');
  participant.followupProvider = { provideFollowups };

  log('SkillsChatParticipant: registered');
  return participant;
}
