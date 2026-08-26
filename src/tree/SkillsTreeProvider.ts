import * as vscode from 'vscode';
import { SkillsManager } from '../skills/SkillsManager';
import { SkillEntry } from '../skills/types';
import {
  ActivitySectionGapItem,
  ActivityStatusLineItem,
  ActivityStepsGapItem,
  AgentActivityItem,
  AgentActivityPlaceholderItem,
  AllCategoriesItem,
  CategoryItem,
  CollectionItem,
  CollectionsSectionItem,
  FavoritesCategoryItem,
  GettingStartedItem,
  GettingStartedTipItem,
  InstalledSectionItem,
  LiveAgentActivitySectionItem,
  RecommendedSectionItem,
  SkillItem,
  SummaryItem,
  SkillTreeNode,
  UserCollectionItem,
} from './nodes';
import { AgentActivityTracker } from '../activity/AgentActivityTracker';
import { CTX_INSTALLED_FILTER } from '../constants';
import { FavoriteSkills } from '../favoriteSkills';
import { SKILL_COLLECTIONS } from '../skills/collections';
import { UserCollections } from '../skills/UserCollections';

export class SkillsTreeProvider
  implements vscode.TreeDataProvider<SkillTreeNode>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private showInstalledOnly = false;
  private recommendedSkills: SkillEntry[] = [];
  private detectedTechs: string[] = [];
  private outdatedIds: Set<string> = new Set();
  private readonly _activityDisposable: vscode.Disposable | undefined;

  constructor(
    private readonly manager: SkillsManager,
    private readonly favoriteSkills: FavoriteSkills,
    private readonly userCollections: UserCollections,
    private readonly showOnboarding: boolean = false,
    private readonly activityTracker?: AgentActivityTracker
  ) {
    this._activityDisposable = activityTracker?.onDidChange(() => this._onDidChangeTreeData.fire());
  }

  dispose(): void {
    this._activityDisposable?.dispose();
    this._onDidChangeTreeData.dispose();
  }

  /** Update recommended skills from workspace scan. Always triggers a tree refresh. */
  setRecommendations(skills: SkillEntry[], techs: string[]): void {
    this.recommendedSkills = skills;
    this.detectedTechs = techs;
    this._onDidChangeTreeData.fire();
  }

  /** Update the set of skill IDs that have updates available. Triggers refresh. */
  setOutdatedIds(ids: Set<string>): void {
    this.outdatedIds = ids;
    this._onDidChangeTreeData.fire();
  }

  /** Toggle the "installed only" filter and update the VS Code context key. */
  toggleInstalledFilter(): void {
    this.showInstalledOnly = !this.showInstalledOnly;
    vscode.commands.executeCommand('setContext', CTX_INSTALLED_FILTER, this.showInstalledOnly);
    this._onDidChangeTreeData.fire();
  }

  /** True when the installed-only filter is currently active. */
  isInstalledFilterActive(): boolean {
    return this.showInstalledOnly;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /** Invalidate the install cache and refresh the tree. Call after install/uninstall. */
  refreshAfterInstall(): void {
    this.manager.invalidateInstallCache();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(el: SkillTreeNode): vscode.TreeItem {
    return el;
  }

  getChildren(el?: SkillTreeNode): SkillTreeNode[] {
    if (!el) {
      return this.buildRootChildren();
    }

    if (el instanceof LiveAgentActivitySectionItem) {
      if (!this.activityTracker) {
        return [];
      }

      const status = this.activityTracker.getStatusDetail();
      const steps = this.activityTracker.getDisplaySteps();

      if (steps.length === 0 && status.phase === 'idle') {
        return [
          new AgentActivityPlaceholderItem(),
          new ActivityStepsGapItem(),
          new ActivityStatusLineItem('Skill', status.skillId),
          new ActivityStatusLineItem('Status', status.detail),
          new ActivityStatusLineItem('Time', '—'),
        ];
      }

      const time = new Date(status.timestamp).toLocaleTimeString();
      return [
        ...steps.map((entry) => new AgentActivityItem(entry)),
        new ActivityStepsGapItem(),
        new ActivityStatusLineItem('Skill', status.skillId),
        new ActivityStatusLineItem('Status', `${status.detail} · ${status.phase}`),
        new ActivityStatusLineItem('Time', time),
      ];
    }

    if (el instanceof GettingStartedItem) {
      return [
        new GettingStartedTipItem(
          'Browse skills (Ctrl+Shift+/)',
          'Open the quick search to find skills by name, description, or #tag.',
          'search',
          { command: 'aiSkills.browse', title: 'Browse' }
        ),
        new GettingStartedTipItem(
          'Click a skill to preview',
          'Select any skill in the tree to read its full SKILL.md content.',
          'eye'
        ),
        new GettingStartedTipItem(
          'Install with the download icon',
          'Click the cloud-download icon to install a skill into .agent/skills/.',
          'cloud-download'
        ),
        new GettingStartedTipItem(
          'Try a Collection pack',
          'Browse curated skill packs for roles like "Full-Stack Engineer" or "AI Specialist".',
          'package',
          { command: 'aiSkills.browseCollections', title: 'Collections' }
        ),
        new GettingStartedTipItem(
          'Create your own skill',
          'Scaffold a new SKILL.md with a guided wizard.',
          'add',
          { command: 'aiSkills.createSkill', title: 'Create Skill' }
        ),
      ];
    }

    if (el instanceof CollectionsSectionItem) {
      const builtIn = el.collections.map((col) => {
        const installedCount = col.skillIds.filter((id) => this.manager.isInstalled(id)).length;
        return new CollectionItem(col, installedCount);
      });
      const userCols = this.userCollections.getAll().map((col) => {
        const installedCount = col.skillIds.filter((id) => this.manager.isInstalled(id)).length;
        return new UserCollectionItem(col, installedCount);
      });
      return [...builtIn, ...userCols];
    }

    if (el instanceof RecommendedSectionItem) {
      return el.skills.map(
        (s) => new SkillItem(s, this.manager.isInstalled(s.id), this.favoriteSkills.has(s.id), true)
      );
    }

    if (el instanceof AllCategoriesItem) {
      const categories = this.manager.getCategories();
      return categories.map((cat) => {
        const skills = this.manager.getByCategory(cat);
        const installedCount = skills.filter((s) => this.manager.isInstalled(s.id)).length;
        return new CategoryItem(cat, skills.length, false, installedCount);
      });
    }

    if (el instanceof InstalledSectionItem) {
      return el.skills.map(
        (s) =>
          new SkillItem(s, true, this.favoriteSkills.has(s.id), false, this.outdatedIds.has(s.id))
      );
    }

    if (el instanceof FavoritesCategoryItem) {
      const favIds = this.favoriteSkills.get();
      return favIds
        .map((id) => this.manager.findById(id))
        .filter((s): s is SkillEntry => s !== undefined)
        .map(
          (s) =>
            new SkillItem(
              s,
              this.manager.isInstalled(s.id),
              true,
              false,
              this.outdatedIds.has(s.id)
            )
        );
    }

    if (el instanceof CategoryItem) {
      let skills = this.manager.getByCategory(el.category);
      if (this.showInstalledOnly) {
        skills = skills.filter((s) => this.manager.isInstalled(s.id));
      }
      return skills.map(
        (s) =>
          new SkillItem(
            s,
            this.manager.isInstalled(s.id),
            this.favoriteSkills.has(s.id),
            false,
            this.outdatedIds.has(s.id)
          )
      );
    }

    if (el instanceof CollectionItem) {
      return el.collection.skillIds
        .map((id) => this.manager.findById(id))
        .filter((s): s is SkillEntry => s !== undefined)
        .map(
          (s) =>
            new SkillItem(
              s,
              this.manager.isInstalled(s.id),
              this.favoriteSkills.has(s.id),
              false,
              this.outdatedIds.has(s.id)
            )
        );
    }

    if (el instanceof UserCollectionItem) {
      return el.collection.skillIds
        .map((id) => this.manager.findById(id))
        .filter((s): s is SkillEntry => s !== undefined)
        .map(
          (s) =>
            new SkillItem(
              s,
              this.manager.isInstalled(s.id),
              this.favoriteSkills.has(s.id),
              false,
              this.outdatedIds.has(s.id)
            )
        );
    }

    return [];
  }

  private buildRootChildren(): SkillTreeNode[] {
    const categories = this.manager.getCategories();
    const total = this.manager.getAll().length;
    const installedCount = this.manager.countInstalled();

    // Recommendations are always visible
    const recommendations: SkillTreeNode[] =
      this.recommendedSkills.length > 0
        ? [new RecommendedSectionItem(this.recommendedSkills, this.detectedTechs)]
        : [];

    const favIds = this.favoriteSkills.get();
    const favSection: SkillTreeNode[] =
      favIds.length > 0 ? [new FavoritesCategoryItem(favIds.length)] : [];

    const installedSkills = this.manager.getAll().filter((s) => this.manager.isInstalled(s.id));
    const installedSection: SkillTreeNode[] =
      installedSkills.length > 0 ? [new InstalledSectionItem(installedSkills)] : [];

    const onboarding: SkillTreeNode[] =
      this.showOnboarding && installedCount === 0 ? [new GettingStartedItem()] : [];

    const collections: SkillTreeNode[] = [
      new CollectionsSectionItem(SKILL_COLLECTIONS, this.userCollections.getAll().length),
    ];

    const categoryNodes: SkillTreeNode[] = this.showInstalledOnly
      ? categories
          .filter((cat) =>
            this.manager.getByCategory(cat).some((s) => this.manager.isInstalled(s.id))
          )
          .map((cat) => {
            const count = this.manager
              .getByCategory(cat)
              .filter((s) => this.manager.isInstalled(s.id)).length;
            return new CategoryItem(cat, count);
          })
      : [new AllCategoriesItem(categories.length)];

    const activityBlock: SkillTreeNode[] = this.activityTracker
      ? [
          new ActivitySectionGapItem(1),
          new ActivitySectionGapItem(2),
          new ActivitySectionGapItem(3),
          new ActivitySectionGapItem(4),
          new ActivitySectionGapItem(5),
          new LiveAgentActivitySectionItem(this.activityTracker.hasActiveOperation()),
        ]
      : [];

    return [
      new SummaryItem(total, installedCount),
      ...onboarding,
      ...favSection,
      ...recommendations,
      ...installedSection,
      ...collections,
      ...categoryNodes,
      ...activityBlock,
    ];
  }

  /** True when the installed-only filter is currently active. */
  isFiltering(): boolean {
    return this.showInstalledOnly;
  }

  /**
   * Returns the skills currently visible in the tree.
   * When the installed-only filter is active, only installed skills are returned.
   */
  getFilteredSkills(): SkillEntry[] {
    if (this.showInstalledOnly) {
      return this.manager.getAll().filter((s) => this.manager.isInstalled(s.id));
    }
    return this.manager.getAll();
  }
}
