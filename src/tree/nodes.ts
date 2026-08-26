import * as vscode from 'vscode';
import { SkillEntry } from '../skills/types';
import { DESCRIPTION_TRUNCATE_LENGTH } from '../constants';
import { TECH_DISPLAY_NAMES } from '../skills/techSkillMap';
import { SkillCollection } from '../skills/collections';
import { UserCollection } from '../skills/UserCollections';
import { ActivityEntry, ActivityState } from '../activity/AgentActivityTracker';

/** Human-readable display names for category slugs shown in the sidebar. */
const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  'ai-ml': 'AI & Machine Learning',
  api: 'API',
  'app-builder': 'App Builder',
  architecture: 'Architecture',
  auth: 'Auth & Identity',
  automation: 'Automation',
  backend: 'Backend',
  'blockchain-web3': 'Blockchain & Web3',
  'cloud-devops': 'Cloud & DevOps',
  'code-quality': 'Code Quality',
  consulting: 'Consulting',
  'content-documentation': 'Content & Docs',
  creative: 'Creative',
  'data-engineering': 'Data Engineering',
  database: 'Database',
  design: 'Design',
  'developer-tools': 'Developer Tools',
  dotnet: '.NET',
  ecommerce: 'E-commerce',
  'embedded-systems': 'Embedded Systems',
  fintech: 'Fintech',
  frontend: 'Frontend',
  'game-development': 'Game Development',
  golang: 'Go',
  'hr-team': 'HR & Team',
  'javascript-typescript': 'JavaScript / TypeScript',
  'marketing-growth': 'Marketing & Growth',
  media: 'Media',
  'meta-skills': 'Meta Skills',
  mobile: 'Mobile',
  networking: 'Networking',
  'office-productivity': 'Office Productivity',
  operations: 'Operations',
  performance: 'Performance',
  'product-management': 'Product Management',
  'programming-languages': 'Programming Languages',
  python: 'Python',
  research: 'Research',
  rust: 'Rust',
  security: 'Security',
  'startup-business': 'Startup & Business',
  testing: 'Testing',
  'workflow-planning': 'Workflow & Planning',
  writing: 'Writing',
};

/** Maps category slug to a VS Code theme icon id. */
const CATEGORY_ICONS: Record<string, string> = {
  ai: 'hubot',
  'ai-ml': 'hubot',
  security: 'shield',
  testing: 'beaker',
  frontend: 'browser',
  backend: 'server',
  database: 'database',
  data: 'graph',
  'data-engineering': 'graph',
  cloud: 'cloud',
  'cloud-devops': 'cloud',
  devops: 'server-process',
  mobile: 'device-mobile',
  documentation: 'book',
  'content-documentation': 'book',
  api: 'symbol-interface',
  'game-development': 'game',
  meta: 'settings-gear',
  'meta-skills': 'settings-gear',
  architecture: 'symbol-class',
  'developer-tools': 'tools',
  'code-quality': 'symbol-keyword',
  python: 'symbol-misc',
  'javascript-typescript': 'symbol-misc',
  automation: 'zap',
  auth: 'key',
  'office-productivity': 'file-text',
  'marketing-growth': 'megaphone',
  'product-management': 'project',
  'workflow-planning': 'checklist',
  research: 'search',
  'startup-business': 'rocket',
  fintech: 'credit-card',
  ecommerce: 'package',
  networking: 'radio-tower',
  operations: 'gear',
  'hr-team': 'organization',
  design: 'symbol-color',
  creative: 'paintcan',
  writing: 'pencil',
  media: 'play',
  'blockchain-web3': 'link',
  'embedded-systems': 'circuit-board',
  dotnet: 'symbol-misc',
  golang: 'symbol-misc',
  rust: 'symbol-misc',
  jvm: 'symbol-misc',
  'programming-languages': 'symbol-misc',
  desktop: 'window',
  'app-builder': 'layers',
  consulting: 'comment-discussion',
  performance: 'dashboard',
};

function activityIcon(state: ActivityState): vscode.ThemeIcon {
  switch (state) {
    case 'pending':
      return new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('descriptionForeground'));
    case 'running':
      return new vscode.ThemeIcon('sync~spin');
    case 'success':
      return new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('testing.iconPassed'));
    case 'error':
      return new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
  }
}

export class ActivitySectionDividerItem extends vscode.TreeItem {
  readonly contextValue = 'activityDivider';

  constructor() {
    super('────────────────', vscode.TreeItemCollapsibleState.None);
    this.tooltip = '';
    this.iconPath = new vscode.ThemeIcon('blank', new vscode.ThemeColor('editorGroup.border'));
  }
}

export class ActivitySectionGapItem extends vscode.TreeItem {
  readonly contextValue = 'activityGap';

  constructor(index?: number) {
    super('\u00A0', vscode.TreeItemCollapsibleState.None);
    if (index !== undefined) {
      this.id = `activity-gap-${index}`;
    }
    this.tooltip = '';
  }
}

export class LiveAgentActivitySectionItem extends vscode.TreeItem {
  readonly contextValue = 'liveAgentActivity';

  constructor(isActive: boolean) {
    super('Live Agent Activity', vscode.TreeItemCollapsibleState.Expanded);
    this.id = 'liveAgentActivity';
    this.description = isActive ? 'active' : 'idle';
    this.tooltip = 'Real-time status of skill resolve and install operations';
    this.iconPath = new vscode.ThemeIcon('pulse');
  }
}

export class ActivityStepsGapItem extends vscode.TreeItem {
  readonly contextValue = 'activityStepsGap';

  constructor() {
    super('\u00A0', vscode.TreeItemCollapsibleState.None);
    this.id = 'activity-steps-gap';
    this.tooltip = '';
  }
}

export class ActivityStatusLineItem extends vscode.TreeItem {
  readonly contextValue = 'activityStatusLine';

  constructor(label: string, value: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = value;
    this.iconPath = new vscode.ThemeIcon(
      'circle-small',
      new vscode.ThemeColor('descriptionForeground')
    );
  }
}

export class AgentActivityPlaceholderItem extends vscode.TreeItem {
  readonly contextValue = 'agentActivityPlaceholder';

  constructor() {
    super('No activity yet — install a skill to see status', vscode.TreeItemCollapsibleState.None);
    this.tooltip = 'Install or load a skill to see resolve and install progress here.';
    this.iconPath = new vscode.ThemeIcon('info', new vscode.ThemeColor('descriptionForeground'));
  }
}

export class AgentActivityItem extends vscode.TreeItem {
  readonly contextValue = 'agentActivity';

  constructor(entry: ActivityEntry) {
    super(entry.label, vscode.TreeItemCollapsibleState.None);
    this.id = entry.id;
    this.description = entry.statusText || undefined;
    this.iconPath = activityIcon(entry.state);
  }
}

export class SummaryItem extends vscode.TreeItem {
  readonly contextValue = 'summary';

  constructor(total: number, installed: number) {
    super('Skills Summary', vscode.TreeItemCollapsibleState.None);
    const notInstalled = total - installed;
    this.description = `${total} total · ${installed} installed · ${notInstalled} available`;
    this.tooltip = new vscode.MarkdownString(
      '**Skills Overview**\n\n' +
        `- Total: **${total}**\n` +
        `- Installed: **${installed}**\n` +
        `- Not installed: **${notInstalled}**`
    );
    this.iconPath = new vscode.ThemeIcon('library');
  }
}

export class CategoryItem extends vscode.TreeItem {
  readonly contextValue: string;

  constructor(
    public readonly category: string,
    public readonly skillCount: number,
    isFiltered = false,
    installedCount = 0
  ) {
    const displayName = CATEGORY_DISPLAY_NAMES[category.toLowerCase()] ?? category;
    super(displayName, vscode.TreeItemCollapsibleState.Collapsed);
    this.description = `${skillCount}`;
    this.tooltip = `${displayName} (${skillCount} skills)`;
    const iconName = isFiltered ? 'filter' : (CATEGORY_ICONS[category.toLowerCase()] ?? 'folder');
    this.iconPath = new vscode.ThemeIcon(iconName);
    this.contextValue =
      installedCount > 0 && installedCount === skillCount ? 'category.installed' : 'category';
  }
}

export class FavoritesCategoryItem extends vscode.TreeItem {
  readonly contextValue = 'favoritesCategory';

  constructor(public readonly skillCount: number) {
    super('Favorites', vscode.TreeItemCollapsibleState.Expanded);
    this.description = `${skillCount}`;
    this.tooltip = `Your starred skills (${skillCount})`;
    this.iconPath = new vscode.ThemeIcon('star-full', new vscode.ThemeColor('charts.yellow'));
  }
}

function buildSkillContextValue(
  installed: boolean,
  isFavorite: boolean,
  isRecommended: boolean,
  isOutdated: boolean
): string {
  if (isRecommended) {
    if (installed && isFavorite) {
      return 'skill-recommended.installed.favorited';
    }
    if (installed) {
      return 'skill-recommended.installed';
    }
    if (isFavorite) {
      return 'skill-recommended.favorited';
    }
    return 'skill-recommended';
  }
  if (installed && isFavorite && isOutdated) {
    return 'skill-installed.favorited.outdated';
  }
  if (installed && isOutdated) {
    return 'skill-installed.outdated';
  }
  if (installed && isFavorite) {
    return 'skill-installed.favorited';
  }
  if (installed) {
    return 'skill-installed';
  }
  if (isFavorite) {
    return 'skill.favorited';
  }
  return 'skill';
}

function buildSkillIcon(
  installed: boolean,
  isFavorite: boolean,
  isOutdated: boolean,
  risk: SkillEntry['risk'] = 'none'
): vscode.ThemeIcon {
  if (installed && isOutdated) {
    return new vscode.ThemeIcon('arrow-up', new vscode.ThemeColor('charts.yellow'));
  }
  if (installed) {
    return new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('testing.iconPassed'));
  }
  if (isFavorite) {
    return new vscode.ThemeIcon('star-full', new vscode.ThemeColor('charts.yellow'));
  }
  if (risk === 'unknown') {
    return new vscode.ThemeIcon(
      'circle-outline',
      new vscode.ThemeColor('editorWarning.foreground')
    );
  }
  if (risk === 'safe') {
    return new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('testing.iconPassed'));
  }
  return new vscode.ThemeIcon('circle-outline');
}

export class SkillItem extends vscode.TreeItem {
  readonly contextValue: string;

  constructor(
    public readonly skill: SkillEntry,
    installed = false,
    isFavorite = false,
    isRecommended = false,
    isOutdated = false
  ) {
    super(skill.id, vscode.TreeItemCollapsibleState.None);

    this.contextValue = buildSkillContextValue(installed, isFavorite, isRecommended, isOutdated);

    const desc = skill.description;
    this.description =
      desc.length > DESCRIPTION_TRUNCATE_LENGTH
        ? desc.slice(0, DESCRIPTION_TRUNCATE_LENGTH) + '…'
        : desc;

    const riskLine =
      skill.risk === 'safe'
        ? '\n\n🛡️ **Risk: safe**'
        : skill.risk === 'unknown'
          ? '\n\n⚠️ **Risk: unknown**'
          : '';

    this.tooltip = new vscode.MarkdownString(
      `**${skill.id}**\n\n${desc}\n\n*Category: ${CATEGORY_DISPLAY_NAMES[skill.category] ?? skill.category} | Source: ${skill.source}*` +
        riskLine +
        (installed ? '\n\n✅ **Installed**' : '') +
        (isOutdated ? '\n\n🔄 **Update available**' : '') +
        (isFavorite ? '\n\n⭐ **Favorited**' : '')
    );

    this.iconPath = buildSkillIcon(installed, isFavorite, isOutdated, skill.risk);

    this.command = {
      command: 'aiSkills.preview',
      title: 'Preview',
      arguments: [skill.id],
    };
  }
}

const MAX_TECH_DISPLAY = 4;

export class InstalledSectionItem extends vscode.TreeItem {
  readonly contextValue = 'installedSection';

  constructor(public readonly skills: SkillEntry[]) {
    super('Installed Skills', vscode.TreeItemCollapsibleState.Expanded);
    this.description = `${skills.length}`;
    this.tooltip = new vscode.MarkdownString(
      '**Installed in this project**\n\n' + skills.map((s) => `- \`${s.id}\``).join('\n')
    );
    this.iconPath = new vscode.ThemeIcon(
      'pass-filled',
      new vscode.ThemeColor('testing.iconPassed')
    );
  }
}

export class RecommendedSectionItem extends vscode.TreeItem {
  readonly contextValue = 'recommended';

  constructor(
    public readonly skills: SkillEntry[],
    public readonly techs: string[]
  ) {
    super('Recommended for this Project', vscode.TreeItemCollapsibleState.Expanded);

    const displayNames = techs
      .map((t) => TECH_DISPLAY_NAMES[t] ?? t)
      .filter((v, i, a) => a.indexOf(v) === i);
    const shown = displayNames.slice(0, MAX_TECH_DISPLAY);
    const extra = displayNames.length - shown.length;
    const techLabel = shown.join(', ') + (extra > 0 ? ` +${extra} more` : '');

    this.description = `${skills.length} skills · ${techLabel}`;
    this.tooltip = new vscode.MarkdownString(
      `**Recommended for this Project**\n\nDetected: ${displayNames.join(', ')}\n\n` +
        skills.map((s) => `- \`${s.id}\``).join('\n')
    );
    this.iconPath = new vscode.ThemeIcon(
      'lightbulb',
      new vscode.ThemeColor('editorLightBulb.foregroundColor')
    );
  }
}

export class GettingStartedItem extends vscode.TreeItem {
  readonly contextValue = 'gettingStarted';

  constructor() {
    super('Getting Started', vscode.TreeItemCollapsibleState.Collapsed);
    this.description = 'New? Start here';
    this.tooltip = new vscode.MarkdownString(
      '**Welcome to AI Agent Superpowers!**\n\n' +
        'Browse 940+ AI skills and install them into your project.\n\n' +
        '- **Ctrl+Shift+/** — Quick-search skills\n' +
        '- **Click** any skill to preview its content\n' +
        '- **Download icon** — Install a skill to `.agent/skills/`\n' +
        '- **Star icon** — Add to favorites'
    );
    this.iconPath = new vscode.ThemeIcon(
      'mortar-board',
      new vscode.ThemeColor('editorInfo.foreground')
    );
  }
}

export class GettingStartedTipItem extends vscode.TreeItem {
  readonly contextValue = 'gettingStartedTip';

  constructor(label: string, tip: string, icon: string, command?: vscode.Command) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.tooltip = tip;
    this.iconPath = new vscode.ThemeIcon(icon);
    if (command) {
      this.command = command;
    }
  }
}

export class CollectionsSectionItem extends vscode.TreeItem {
  readonly contextValue = 'collectionsSection';

  constructor(
    public readonly collections: SkillCollection[],
    userCount = 0
  ) {
    super('Skill Collections', vscode.TreeItemCollapsibleState.Collapsed);
    const total = collections.length + userCount;
    this.description =
      userCount > 0 ? `${collections.length} packs \u00B7 ${userCount} custom` : `${total} packs`;
    this.tooltip = new vscode.MarkdownString(
      '**Curated Skill Collections**\n\n' +
        'Pre-assembled skill packs for common roles and workflows.\n\n' +
        collections.map((c) => `- **${c.name}** — ${c.skillIds.length} skills`).join('\n')
    );
    this.iconPath = new vscode.ThemeIcon('package');
  }
}

export class CollectionItem extends vscode.TreeItem {
  readonly contextValue: string;

  constructor(
    public readonly collection: SkillCollection,
    installedCount: number
  ) {
    super(collection.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.description = `${collection.skillIds.length} skills${installedCount > 0 ? ` · ${installedCount} installed` : ''}`;
    this.tooltip = new vscode.MarkdownString(
      `**${collection.name}**\n\n${collection.description}\n\n` +
        `Skills: ${collection.skillIds.map((id) => `\`${id}\``).join(', ')}`
    );
    this.iconPath = new vscode.ThemeIcon(collection.icon);
    this.contextValue =
      installedCount === collection.skillIds.length && collection.skillIds.length > 0
        ? 'collection.installed'
        : 'collection';
  }
}

export class UserCollectionItem extends vscode.TreeItem {
  readonly contextValue: string;

  constructor(
    public readonly collection: UserCollection,
    public readonly installedCount: number
  ) {
    super(collection.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.id = `user-collection-${collection.id}`;
    this.description = `${collection.skillIds.length} skills${installedCount > 0 ? ` · ${installedCount} installed` : ''}`;
    this.tooltip = new vscode.MarkdownString(
      `**${collection.name}** *(custom)*\n\n` +
        `${collection.skillIds.length} skill(s)${installedCount > 0 ? ` · ${installedCount} installed` : ''}`
    );
    this.iconPath = new vscode.ThemeIcon(collection.icon ?? 'list-unordered');
    this.contextValue =
      installedCount === collection.skillIds.length && collection.skillIds.length > 0
        ? 'user-collection.installed'
        : 'user-collection';
  }
}

export class AllCategoriesItem extends vscode.TreeItem {
  readonly contextValue = 'allCategories';

  constructor(public readonly categoryCount: number) {
    super('All Categories', vscode.TreeItemCollapsibleState.Collapsed);
    this.id = 'allCategories';
    this.description = `${categoryCount}`;
    this.tooltip = `Browse all ${categoryCount} skill categories`;
    this.iconPath = new vscode.ThemeIcon('folder-library');
  }
}

export type SkillTreeNode =
  | ActivitySectionDividerItem
  | ActivitySectionGapItem
  | LiveAgentActivitySectionItem
  | AgentActivityItem
  | AgentActivityPlaceholderItem
  | ActivityStepsGapItem
  | ActivityStatusLineItem
  | SummaryItem
  | CategoryItem
  | FavoritesCategoryItem
  | InstalledSectionItem
  | SkillItem
  | RecommendedSectionItem
  | GettingStartedItem
  | GettingStartedTipItem
  | CollectionsSectionItem
  | CollectionItem
  | UserCollectionItem
  | AllCategoriesItem;
