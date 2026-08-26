import * as vscode from 'vscode';

export type ActivityState = 'pending' | 'running' | 'success' | 'error';

export type ActivityPhase = 'idle' | 'loading' | 'installing' | 'done' | 'failed';

export interface ActivityEntry {
  id: string;
  skillId?: string;
  label: string;
  statusText: string;
  state: ActivityState;
  timestamp: number;
}

export interface ActivityStatusDetail {
  skillId: string;
  phase: ActivityPhase;
  detail: string;
  timestamp: number;
}

interface ActivityOperation {
  skillId: string;
  step1: ActivityEntry;
  step2: ActivityEntry;
  status: ActivityStatusDetail;
}

const IDLE_STATUS: ActivityStatusDetail = {
  skillId: '—',
  phase: 'idle',
  detail: 'Waiting',
  timestamp: Date.now(),
};

let nextId = 0;

function createId(): string {
  return `activity-${++nextId}-${Date.now()}`;
}

function createEntry(
  skillId: string,
  label: string,
  statusText: string,
  state: ActivityState
): ActivityEntry {
  return {
    id: createId(),
    skillId,
    label,
    statusText,
    state,
    timestamp: Date.now(),
  };
}

/** Yield so the sidebar tree can repaint before long async work. */
export function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * Tracks one active skill operation at a time for the sidebar:
 * Exactly two steps (Loading skill -> Installed / Done), plus a status detail panel.
 */
export class AgentActivityTracker implements vscode.Disposable {
  private currentOperation: ActivityOperation | undefined;
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  hasActiveOperation(): boolean {
    return this.currentOperation !== undefined;
  }

  getDisplaySteps(): readonly ActivityEntry[] {
    if (!this.currentOperation) {
      return [];
    }
    const { step1, step2 } = this.currentOperation;
    return [step1, step2];
  }

  getStatusDetail(): ActivityStatusDetail {
    return this.currentOperation?.status ?? IDLE_STATUS;
  }

  beginSkillOperation(skillId: string, isInstall: boolean = true): void {
    const step1 = createEntry(skillId, 'Loading skill', 'loading…', 'running');
    const step2 = isInstall
      ? createEntry(skillId, 'Installed', 'queued', 'pending')
      : createEntry(skillId, 'Done', 'queued', 'pending');
    this.currentOperation = {
      skillId,
      step1,
      step2,
      status: {
        skillId,
        phase: 'loading',
        detail: 'loading…',
        timestamp: Date.now(),
      },
    };
    this.fireChange();
  }

  finishLoading(fileCount: number): void {
    const op = this.currentOperation;
    if (!op) {
      return;
    }
    const filesLabel = fileCount === 1 ? '1 file' : `${fileCount} files`;
    op.step1.statusText = filesLabel;
    op.step1.state = 'success';
    op.status = {
      skillId: op.skillId,
      phase: 'loading',
      detail: filesLabel,
      timestamp: Date.now(),
    };
    this.fireChange();
  }

  startInstalling(): void {
    const op = this.currentOperation;
    if (!op) {
      return;
    }
    op.step2.statusText = 'installing…';
    op.step2.state = 'running';
    op.status = {
      skillId: op.skillId,
      phase: 'installing',
      detail: 'installing…',
      timestamp: Date.now(),
    };
    this.fireChange();
  }

  completeDone(): void {
    const op = this.currentOperation;
    if (!op) {
      return;
    }
    op.step2.statusText = 'success';
    op.step2.state = 'success';
    op.status = {
      skillId: op.skillId,
      phase: 'done',
      detail: 'success',
      timestamp: Date.now(),
    };
    this.fireChange();
  }

  /** Load-only path: step 2 Done (no install phase needed). */
  completeLoadOnly(): void {
    const op = this.currentOperation;
    if (!op) {
      return;
    }
    op.step2.statusText = 'success';
    op.step2.state = 'success';
    op.status = {
      skillId: op.skillId,
      phase: 'done',
      detail: op.step1.statusText || 'loaded',
      timestamp: Date.now(),
    };
    this.fireChange();
  }

  fail(message: string): void {
    const op = this.currentOperation;
    if (!op) {
      return;
    }
    const short = message.length > 24 ? message.slice(0, 21) + '…' : message;

    // Find whichever step was active/running and mark it as error
    const running = op.step2.state === 'running' ? op.step2 : op.step1;
    running.statusText = short;
    running.state = 'error';

    if (running === op.step1) {
      op.step1.label = 'Loading failed';
      op.step2.statusText = 'cancelled';
    } else {
      op.step2.label = op.step2.label === 'Installed' ? 'Installing failed' : 'Failed';
    }

    op.status = {
      skillId: op.skillId,
      phase: 'failed',
      detail: short,
      timestamp: Date.now(),
    };
    this.fireChange();
  }

  clear(): void {
    this.currentOperation = undefined;
    this.fireChange();
  }

  private fireChange(): void {
    this._onDidChange.fire();
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
