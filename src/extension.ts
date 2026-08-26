import * as vscode from 'vscode';
import { createSkillsManager } from './skills/SkillsManager';
import { SkillsTreeProvider } from './tree/SkillsTreeProvider';
import { registerBrowseCommand } from './commands/browseSkills';
import { registerInstallCommand, registerInstallFromTreeCommand } from './commands/installSkill';
import { registerPreviewCommand } from './commands/previewSkill';
import { registerCopyIdCommand } from './commands/copySkillId';
import { registerUninstallCommand, registerUninstallAllCommand } from './commands/uninstallSkill';
import { registerBulkCopySkillsCommand } from './commands/bulkCopySkills';
import {
  registerInstallCategoryCommand,
  registerInstallAllCommand,
  registerInstallCollectionCommand,
  registerUninstallCategoryCommand,
  registerUninstallCollectionCommand,
} from './commands/installBulk';
import { registerBrowseCollectionsCommand } from './commands/browseCollections';
import { registerCreateSkillCommand } from './commands/createSkill';
import {
  registerExportSkillSetCommand,
  registerImportSkillSetCommand,
} from './commands/exportImportSkillSet';
import { registerToggleFavoriteCommand } from './commands/toggleFavorite';
import { registerClearFavoritesCommand } from './commands/clearFavorites';
import {
  registerCreateCollectionCommand,
  registerEditCollectionCommand,
} from './commands/createCollection';
import { registerDeleteCollectionCommand } from './commands/deleteCollection';
import {
  registerAddToCollectionCommand,
  registerRemoveFromCollectionCommand,
} from './commands/addToCollection';
import { registerUpdateAllSkillsCommand } from './commands/updateAllSkills';
import { registerRefreshCatalogCommand, writeCatalogToWorkspace } from './commands/refreshCatalog';
import { registerRequestSkillTool } from './tools/requestSkillTool';
import { registerListInstalledTool } from './tools/listInstalledTool';
import { registerSearchSkillsTool } from './tools/searchSkillsTool';
import { registerGetSkillInfoTool } from './tools/getSkillInfoTool';
import { registerCheckUpdatesTool } from './tools/checkUpdatesTool';
import { registerBatchInstallTool } from './tools/batchInstallTool';
import { registerPlanInstallTool } from './tools/planInstallTool';
import { ERR_BUNDLE_INCOMPLETE, CMD_FILTER_TREE, CTX_UPDATES_AVAILABLE } from './constants';
import { WorkspaceScanner } from './skills/WorkspaceScanner';
import { initLogger, log, logError } from './logger';
import { RecentSkills } from './recentSkills';
import { FavoriteSkills } from './favoriteSkills';
import { UserCollections } from './skills/UserCollections';
import { SkillUpdateTracker } from './skills/SkillUpdateTracker';
import { registerSkillsChatParticipant } from './chat/SkillsChatParticipant';
import { AgentActivityTracker } from './activity/AgentActivityTracker';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  initLogger(context);
  log('Extension activating…');

  const manager = createSkillsManager(context);
  const healthy = await manager.init();

  if (!healthy) {
    vscode.window.showWarningMessage(ERR_BUNDLE_INCOMPLETE);
  } else {
    log(`Skills loaded: ${manager.getAll().length}`);
  }

  const recentSkills = new RecentSkills(context);
  const favoriteSkills = new FavoriteSkills(context);
  const userCollections = new UserCollections(context);
  const tracker = new SkillUpdateTracker(context);
  const activityTracker = new AgentActivityTracker();
  const welcomed = context.globalState.get<boolean>('aiSkills.welcomed', false);

  const treeProvider = new SkillsTreeProvider(
    manager,
    favoriteSkills,
    userCollections,
    !welcomed,
    activityTracker
  );
  setupSkillsFileWatcher(context, treeProvider);
  const treeView = vscode.window.createTreeView('aiSkillsTree', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });

  // Project-aware recommendations
  const scanner = new WorkspaceScanner();
  const runRecommendations = async (): Promise<void> => {
    const techs = await scanner.scan();
    if (techs.length > 0) {
      const recommended = manager.getRecommended(techs);
      treeProvider.setRecommendations(recommended, techs);

      // Auto-install: first workspace open with detected tech, no skills installed yet
      const dismissKey = `aiSkills.autoInstallDismissed.${vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? 'default'}`;
      const dismissed = context.workspaceState.get<boolean>(dismissKey, false);
      if (!dismissed && manager.countInstalled() === 0 && recommended.length > 0) {
        const techLabel =
          techs.slice(0, 3).join(', ') + (techs.length > 3 ? ` +${techs.length - 3} more` : '');
        const choice = await vscode.window.showInformationMessage(
          `AI Skills: Detected ${techLabel} in this project. Install ${recommended.length} recommended skill(s)?`,
          'Install Now',
          'Pick Skills',
          'Not Now'
        );
        if (choice === 'Install Now') {
          const { bulkInstall } = await import('./commands/installBulk');
          await bulkInstall(
            recommended,
            `${recommended.length} recommended skills`,
            manager,
            tracker,
            context,
            activityTracker
          );
          treeProvider.refreshAfterInstall();
        } else if (choice === 'Pick Skills') {
          vscode.commands.executeCommand('aiSkills.browse');
        } else if (choice === 'Not Now') {
          context.workspaceState.update(dismissKey, true);
        }
      }
    }
  };
  runRecommendations().catch(() => {
    /* silent — non-critical feature */
  });
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      runRecommendations().catch(() => {
        /* ignore */
      });
    })
  );

  // Background remote sync — refresh tree only when new skills are found
  (async () => {
    try {
      const added = await manager.syncRemote();
      if (added > 0) {
        treeProvider.refreshAfterInstall();
      }
      // Silently refresh the workspace skills catalog after every sync
      writeCatalogToWorkspace(manager).catch(() => {
        /* non-critical */
      });
      const outdated = await manager.getSkillsWithUpdates(tracker);
      const outdatedIds = new Set(outdated.map((s) => s.id));
      treeProvider.setOutdatedIds(outdatedIds);
      vscode.commands.executeCommand('setContext', CTX_UPDATES_AVAILABLE, outdated.length > 0);
      if (outdated.length > 0) {
        const action = await vscode.window.showInformationMessage(
          `AI Skills: ${outdated.length} installed skill(s) have updates available.`,
          'Update All',
          'Later'
        );
        if (action === 'Update All') {
          vscode.commands.executeCommand('aiSkills.updateAll');
        }
      }
    } catch {
      /* ignore network errors / non-critical */
    }
  })();

  context.subscriptions.push(
    activityTracker,
    treeProvider,
    treeView,
    registerBrowseCommand(manager, recentSkills, favoriteSkills, activityTracker),
    registerInstallCommand(manager, recentSkills, tracker, context, activityTracker),
    registerInstallFromTreeCommand(manager),
    registerPreviewCommand(manager),
    registerCopyIdCommand(),
    registerUninstallCommand(manager),
    registerUninstallAllCommand(manager, treeProvider),
    registerBulkCopySkillsCommand(manager),
    registerInstallCategoryCommand(manager, tracker, context, activityTracker),
    registerInstallAllCommand(manager, treeProvider, tracker, context, activityTracker),
    registerInstallCollectionCommand(manager, tracker, context, activityTracker),
    registerUninstallCategoryCommand(manager, treeProvider),
    registerUninstallCollectionCommand(manager, treeProvider),
    registerToggleFavoriteCommand(favoriteSkills, treeProvider),
    registerClearFavoritesCommand(favoriteSkills, treeProvider),
    registerBrowseCollectionsCommand(manager),
    registerCreateSkillCommand(manager),
    registerExportSkillSetCommand(manager),
    registerImportSkillSetCommand(manager),
    registerCreateCollectionCommand(manager, userCollections, treeProvider),
    registerEditCollectionCommand(manager, userCollections, treeProvider),
    registerDeleteCollectionCommand(userCollections, treeProvider),
    registerAddToCollectionCommand(manager, userCollections, treeProvider),
    registerRemoveFromCollectionCommand(userCollections, treeProvider),
    registerUpdateAllSkillsCommand(manager, tracker, treeProvider),
    registerRefreshCatalogCommand(manager),
    registerRequestSkillTool(manager, activityTracker),
    registerListInstalledTool(manager),
    registerSearchSkillsTool(manager),
    registerGetSkillInfoTool(manager),
    registerCheckUpdatesTool(manager, tracker),
    registerBatchInstallTool(manager, tracker, activityTracker),
    registerPlanInstallTool(manager, tracker),
    registerSkillsChatParticipant(manager, activityTracker),
    vscode.commands.registerCommand('aiSkills.refreshTree', async () => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Syncing AI Skills…',
        },
        async () => {
          const added = await manager.syncRemote();
          treeProvider.refreshAfterInstall();
          if (added > 0) {
            vscode.window.showInformationMessage(`AI Skills: Found ${added} new skill(s)!`);
          }
        }
      );
    }),
    vscode.commands.registerCommand(CMD_FILTER_TREE, () => {
      treeProvider.toggleInstalledFilter();
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('aiSkills.localSkillsPath')) {
        manager.loadLocalSources();
        treeProvider.refreshAfterInstall();
      }
    })
  );

  // First-run welcome notification
  const showWelcome = async (): Promise<void> => {
    context.globalState.update('aiSkills.welcomed', true);
    const action = await vscode.window.showInformationMessage(
      `Copilot Superpowers: ${manager.getAll().length} skills ready. Press Ctrl+Shift+/ to browse, or open the sidebar.`,
      'Browse Skills',
      'Dismiss'
    );
    if (action === 'Browse Skills') {
      vscode.commands.executeCommand('aiSkills.browse');
    }
  };

  if (!welcomed && healthy) {
    (async () => {
      try {
        await showWelcome();
      } catch {
        /* ignore */
      }
    })();
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('aiSkills.showWelcome', () => {
      context.globalState.update('aiSkills.welcomed', false);
      (async () => {
        try {
          await showWelcome();
        } catch {
          /* ignore */
        }
      })();
    })
  );
}

export function deactivate(): void {}

function setupSkillsFileWatcher(
  context: vscode.ExtensionContext,
  treeProvider: SkillsTreeProvider
): void {
  const watcher = vscode.workspace.createFileSystemWatcher('**/.agent/skills/**');

  let debounceTimer: NodeJS.Timeout | undefined;

  const refreshAfterInstallDebounced = (): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      try {
        treeProvider.refreshAfterInstall();
      } catch (err) {
        logError('Watcher: failed to refresh after install', err);
      }
    }, 300);
  };

  const onCreate = watcher.onDidCreate(() => {
    log('Watcher: detected skill creation, refreshing...');
    try {
      refreshAfterInstallDebounced();
    } catch (err) {
      logError('Watcher: failed to refresh after install', err);
    }
  });

  const onChange = watcher.onDidChange(() => {
    log('Watcher: detected skill modification, refreshing...');
    try {
      refreshAfterInstallDebounced();
    } catch (err) {
      logError('Watcher: failed to refresh after install', err);
    }
  });

  const onDelete = watcher.onDidDelete(() => {
    log('Watcher: detected skill deletion, refreshing...');
    try {
      refreshAfterInstallDebounced();
    } catch (err) {
      logError('Watcher: failed to refresh after install', err);
    }
  });

  context.subscriptions.push(watcher, onCreate, onChange, onDelete);
}
