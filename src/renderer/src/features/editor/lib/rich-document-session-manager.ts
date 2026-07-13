import {
  normalizeRichDocumentPath,
  RichDocumentSurfaceRegistry,
} from "./rich-document-surface-registry";
import {
  type RichPaneKey,
  type RichPaneViewState,
  RichPaneViewStateRegistry,
} from "./rich-pane-view-state";

export interface RichDocumentRuntime {
  path: string;
  surface: HTMLElement;
  captureVisualSnapshot?: () => void;
  serializePendingChange: () => Promise<void>;
  cancelPendingWork: () => void;
  destroy: () => void;
  isDirty: () => boolean;
  isSaving: () => boolean;
  isReloading: () => boolean;
  readViewState?: () => Partial<RichPaneViewState>;
  restoreViewState?: (state: RichPaneViewState) => void;
}

export interface RichDocumentBinding {
  paneKey: RichPaneKey;
  groupId: string;
  tabId: string;
}

interface SessionRecord {
  path: string;
  visibleBindings: Map<RichPaneKey, RichDocumentBinding>;
  backgroundTabIds: Set<string>;
  activePaneKey: RichPaneKey | null;
  runtime: RichDocumentRuntime | null;
  lastActiveAt: number;
}

interface RuntimeRegistration {
  runtime: RichDocumentRuntime;
  token: symbol;
  unregisterSurface: () => void;
}

interface VisiblePaneRegistration {
  path: string;
  token: symbol;
}

const DEFAULT_MAX_BACKGROUND_SESSIONS = 4;

export class RichDocumentSessionManager {
  private readonly maxBackgroundSessions: number;
  private readonly now: () => number;
  private readonly surfaces: RichDocumentSurfaceRegistry;
  private readonly viewStates: RichPaneViewStateRegistry;
  private readonly records = new Map<string, SessionRecord>();
  private readonly listeners = new Set<() => void>();
  private readonly runtimeListeners = new Map<string, Set<() => void>>();
  private readonly pendingSerializations = new Map<string, Promise<void>>();
  private readonly visiblePaneRegistrations = new Map<
    RichPaneKey,
    VisiblePaneRegistration
  >();
  private readonly runtimeRegistrations = new Map<
    string,
    RuntimeRegistration
  >();
  private readonly backgroundRetentionTokens = new Map<
    string,
    Map<string, symbol>
  >();
  private activeDocumentPath: string | null = null;
  private retainedPathSnapshot: string[] = [];

  constructor(
    options: {
      maxBackgroundSessions?: number;
      now?: () => number;
      surfaces?: RichDocumentSurfaceRegistry;
      viewStates?: RichPaneViewStateRegistry;
    } = {},
  ) {
    this.maxBackgroundSessions = Math.max(
      0,
      Math.floor(
        options.maxBackgroundSessions ?? DEFAULT_MAX_BACKGROUND_SESSIONS,
      ),
    );
    this.now = options.now ?? Date.now;
    this.surfaces = options.surfaces ?? new RichDocumentSurfaceRegistry();
    this.viewStates = options.viewStates ?? new RichPaneViewStateRegistry();
  }

  retainVisible(path: string, binding: RichDocumentBinding): () => void {
    const normalizedPath = normalizeRichDocumentPath(path);
    const record = this.getOrCreateRecord(normalizedPath);
    // 每次保留都复制绑定作为注册身份，避免复用同一入参时旧回调误删新绑定。
    const retainedBinding = { ...binding };
    const token = Symbol(binding.paneKey);
    record.visibleBindings.set(binding.paneKey, retainedBinding);
    this.visiblePaneRegistrations.set(binding.paneKey, {
      path: normalizedPath,
      token,
    });
    record.lastActiveAt = this.now();
    this.finishMutation();

    return () => {
      if (record.visibleBindings.get(binding.paneKey) !== retainedBinding) {
        return;
      }

      if (record.activePaneKey === binding.paneKey) {
        this.captureRuntimeViewState(record, record.runtime);
        this.deactivateRecord(record);
      }
      record.visibleBindings.delete(binding.paneKey);
      const registration = this.visiblePaneRegistrations.get(binding.paneKey);
      // pane 跨路径迁移时，旧路径只清自己的 record，不得删除新 owner 的视图状态。
      if (
        registration?.path === normalizedPath &&
        registration.token === token
      ) {
        this.visiblePaneRegistrations.delete(binding.paneKey);
      }
      record.lastActiveAt = this.now();
      this.deleteUnretainedRecord(record);
      this.finishMutation();
    };
  }

  retainBackground(path: string, tabId: string): () => void {
    const normalizedPath = normalizeRichDocumentPath(path);
    const record = this.getOrCreateRecord(normalizedPath);
    const token = Symbol(tabId);
    const tokens = this.getBackgroundTokens(normalizedPath);
    tokens.set(tabId, token);
    record.backgroundTabIds.add(tabId);
    record.lastActiveAt = this.now();
    this.finishMutation();

    return () => {
      if (tokens.get(tabId) !== token) return;

      tokens.delete(tabId);
      if (tokens.size === 0) {
        this.backgroundRetentionTokens.delete(normalizedPath);
      }
      record.backgroundTabIds.delete(tabId);
      record.lastActiveAt = this.now();
      this.deleteUnretainedRecord(record);
      this.finishMutation();
    };
  }

  registerRuntime(path: string, runtime: RichDocumentRuntime): () => void {
    const normalizedPath = normalizeRichDocumentPath(path);
    const record = this.getOrCreateRecord(normalizedPath);
    const previousRegistration = this.runtimeRegistrations.get(normalizedPath);
    const token = Symbol(normalizedPath);

    if (previousRegistration?.runtime === runtime) {
      this.runtimeRegistrations.set(normalizedPath, {
        ...previousRegistration,
        token,
      });
    } else {
      if (
        previousRegistration &&
        this.activeDocumentPath === normalizedPath &&
        record.activePaneKey
      ) {
        this.captureRuntimeViewState(record, previousRegistration.runtime);
        this.deactivateRecord(record);
      }
      previousRegistration?.unregisterSurface();
      previousRegistration?.runtime.cancelPendingWork();
      previousRegistration?.runtime.destroy();

      // 旧运行时销毁后再注册新表面；订阅者会在布局阶段完成挂载和视图恢复。
      const registration: RuntimeRegistration = {
        runtime,
        token,
        unregisterSurface: this.surfaces.registerSurface(
          normalizedPath,
          runtime.surface,
        ),
      };
      this.runtimeRegistrations.set(normalizedPath, registration);
      record.runtime = runtime;
    }

    record.runtime = runtime;
    record.lastActiveAt = this.now();
    if (previousRegistration?.runtime !== runtime) {
      this.publishRuntime(normalizedPath);
    }
    this.finishMutation();

    return () => {
      const registration = this.runtimeRegistrations.get(normalizedPath);
      if (registration?.token !== token || registration.runtime !== runtime) {
        return;
      }

      this.releaseRuntime(record, registration);
      this.deleteUnretainedRecord(record);
      this.finishMutation();
    };
  }

  setActivePane(path: string, paneKey: RichPaneKey): boolean {
    const normalizedPath = normalizeRichDocumentPath(path);
    const record = this.records.get(normalizedPath);
    if (!record?.visibleBindings.has(paneKey)) return false;

    if (
      this.activeDocumentPath === normalizedPath &&
      record.activePaneKey === paneKey
    ) {
      return true;
    }

    if (this.activeDocumentPath === normalizedPath && record.activePaneKey) {
      // 同文档分栏切换只移动稳定表面，避免 visibility 往返触发整棵 ProseMirror 样式重算。
      // 搬移前先把当前可见块的真实 DOM 交给旧窗格，避免代码行号和折叠标记退化成序列化占位。
      record.runtime?.captureVisualSnapshot?.();
      this.captureRuntimeViewState(record, record.runtime);
      const previousPaneKey = record.activePaneKey;
      // surface 恢复焦点时会同步触发编辑器 focus；必须先提交新 owner，避免焦点回调写回旧 pane。
      record.activePaneKey = paneKey;
      if (!this.surfaces.activate(normalizedPath, paneKey)) {
        record.activePaneKey = previousPaneKey;
        return false;
      }
      record.lastActiveAt = this.now();
      record.runtime?.restoreViewState?.(this.viewStates.read(paneKey));
      return true;
    }

    // 全局切换必须先卸下旧文档，再挂载目标文档，确保布局中始终只有一个完整富文本 DOM。
    if (this.activeDocumentPath) {
      const previousRecord = this.records.get(this.activeDocumentPath);
      if (previousRecord) {
        this.captureRuntimeViewState(previousRecord, previousRecord.runtime);
        this.deactivateRecord(previousRecord);
      } else this.activeDocumentPath = null;
    }

    const previousActiveDocumentPath = this.activeDocumentPath;
    record.activePaneKey = paneKey;
    this.activeDocumentPath = normalizedPath;
    if (!this.surfaces.activate(normalizedPath, paneKey)) {
      record.activePaneKey = null;
      this.activeDocumentPath = previousActiveDocumentPath;
      return false;
    }
    record.lastActiveAt = this.now();
    record.runtime?.restoreViewState?.(this.viewStates.read(paneKey));
    return true;
  }

  deactivateIfActive(path: string, paneKey: RichPaneKey): boolean {
    const normalizedPath = normalizeRichDocumentPath(path);
    if (this.activeDocumentPath !== normalizedPath) return false;

    const record = this.records.get(normalizedPath);
    if (!record || record.activePaneKey !== paneKey) return false;

    // 按文档和窗格双重校验，旧 effect 不会卸下随后已激活的新表面。
    this.captureRuntimeViewState(record, record.runtime);
    this.deactivateRecord(record);
    return true;
  }

  getActivePane(path: string): RichPaneKey | null {
    const normalizedPath = normalizeRichDocumentPath(path);
    if (this.activeDocumentPath !== normalizedPath) return null;
    return this.records.get(normalizedPath)?.activePaneKey ?? null;
  }

  getActiveBinding(): {
    path: string;
    binding: RichDocumentBinding;
  } | null {
    if (!this.activeDocumentPath) return null;

    const record = this.records.get(this.activeDocumentPath);
    const binding = record?.activePaneKey
      ? record.visibleBindings.get(record.activePaneKey)
      : undefined;
    if (!record || !binding) return null;
    return { path: record.path, binding };
  }

  getVisiblePaneKeys(path: string): RichPaneKey[] {
    return [
      ...(this.records
        .get(normalizeRichDocumentPath(path))
        ?.visibleBindings.keys() ?? []),
    ];
  }

  getBoundTabIds(path: string): string[] {
    const record = this.records.get(normalizeRichDocumentPath(path));
    if (!record) return [];

    const tabIds = new Set<string>();
    for (const binding of record.visibleBindings.values()) {
      tabIds.add(binding.tabId);
    }
    for (const tabId of record.backgroundTabIds) tabIds.add(tabId);
    return [...tabIds];
  }

  getRuntime(path: string): RichDocumentRuntime | null {
    return this.records.get(normalizeRichDocumentPath(path))?.runtime ?? null;
  }

  getRuntimeSnapshot(path: string): RichDocumentRuntime | null {
    return this.getRuntime(path);
  }

  serializePendingChange(path: string): Promise<void> {
    const normalizedPath = normalizeRichDocumentPath(path);
    const pending = this.pendingSerializations.get(normalizedPath);
    if (pending) return pending;

    const runtime = this.getRuntime(normalizedPath);
    if (!runtime) return Promise.resolve();

    // 同一路径的多个面板可能同时请求 flush；底层文档只序列化一次。
    const serialization = runtime.serializePendingChange().finally(() => {
      if (this.pendingSerializations.get(normalizedPath) === serialization) {
        this.pendingSerializations.delete(normalizedPath);
      }
    });
    this.pendingSerializations.set(normalizedPath, serialization);
    return serialization;
  }

  subscribeRuntime(path: string, listener: () => void): () => void {
    const normalizedPath = normalizeRichDocumentPath(path);
    const listeners = this.runtimeListeners.get(normalizedPath) ?? new Set();
    listeners.add(listener);
    this.runtimeListeners.set(normalizedPath, listeners);

    return () => {
      listeners.delete(listener);
      if (
        listeners.size === 0 &&
        this.runtimeListeners.get(normalizedPath) === listeners
      ) {
        this.runtimeListeners.delete(normalizedPath);
      }
    };
  }

  getSnapshot(): string[] {
    return this.retainedPathSnapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private getOrCreateRecord(normalizedPath: string): SessionRecord {
    const existing = this.records.get(normalizedPath);
    if (existing) return existing;

    const record: SessionRecord = {
      path: normalizedPath,
      visibleBindings: new Map(),
      backgroundTabIds: new Set(),
      activePaneKey: null,
      runtime: null,
      lastActiveAt: this.now(),
    };
    this.records.set(normalizedPath, record);
    return record;
  }

  private getBackgroundTokens(normalizedPath: string): Map<string, symbol> {
    const existing = this.backgroundRetentionTokens.get(normalizedPath);
    if (existing) return existing;

    const tokens = new Map<string, symbol>();
    this.backgroundRetentionTokens.set(normalizedPath, tokens);
    return tokens;
  }

  private deactivateRecord(record: SessionRecord): void {
    this.surfaces.deactivate(record.path);
    record.activePaneKey = null;
    if (this.activeDocumentPath === record.path) {
      this.activeDocumentPath = null;
    }
  }

  private captureRuntimeViewState(
    record: SessionRecord,
    runtime: RichDocumentRuntime | null,
  ): void {
    const paneKey = record.activePaneKey;
    if (
      this.activeDocumentPath !== record.path ||
      !paneKey ||
      !runtime?.readViewState
    ) {
      return;
    }

    this.viewStates.patch(paneKey, runtime.readViewState());
  }

  private releaseRuntime(
    record: SessionRecord,
    registration: RuntimeRegistration,
  ): void {
    if (this.activeDocumentPath === record.path) {
      this.captureRuntimeViewState(record, registration.runtime);
      this.deactivateRecord(record);
    }
    this.runtimeRegistrations.delete(record.path);
    registration.unregisterSurface();
    record.runtime = null;
    registration.runtime.cancelPendingWork();
    registration.runtime.destroy();
    this.publishRuntime(record.path);
  }

  private deleteUnretainedRecord(record: SessionRecord): void {
    if (
      record.visibleBindings.size > 0 ||
      record.backgroundTabIds.size > 0 ||
      record.runtime
    ) {
      return;
    }

    this.records.delete(record.path);
    this.backgroundRetentionTokens.delete(record.path);
  }

  private finishMutation(): void {
    this.evictIdleRecords();
    this.publishRetainedPaths();
  }

  private evictIdleRecords(): void {
    const candidates: SessionRecord[] = [];
    for (const record of this.records.values()) {
      const runtime = record.runtime;
      if (
        record.visibleBindings.size === 0 &&
        record.backgroundTabIds.size === 0 &&
        runtime &&
        !runtime.isDirty() &&
        !runtime.isSaving() &&
        !runtime.isReloading()
      ) {
        candidates.push(record);
      }
    }

    const evictionCount = candidates.length - this.maxBackgroundSessions;
    const evicted = new Set<SessionRecord>();
    for (let index = 0; index < evictionCount; index += 1) {
      // 逐轮选择最旧候选，避免原地排序改变候选集合的既有顺序。
      let oldest: SessionRecord | null = null;
      for (const candidate of candidates) {
        if (
          !evicted.has(candidate) &&
          (!oldest || candidate.lastActiveAt < oldest.lastActiveAt)
        ) {
          oldest = candidate;
        }
      }
      if (!oldest?.runtime) break;

      const registration = this.runtimeRegistrations.get(oldest.path);
      if (!registration || registration.runtime !== oldest.runtime) continue;
      evicted.add(oldest);
      this.releaseRuntime(oldest, registration);
      this.deleteUnretainedRecord(oldest);
    }
  }

  private publishRetainedPaths(): void {
    const nextSnapshot = [...this.records.keys()];
    if (
      nextSnapshot.length === this.retainedPathSnapshot.length &&
      nextSnapshot.every(
        (path, index) => path === this.retainedPathSnapshot[index],
      )
    ) {
      return;
    }

    // 仅在有序路径内容变化时替换数组身份，满足 useSyncExternalStore 的稳定快照约束。
    this.retainedPathSnapshot = nextSnapshot;
    for (const listener of this.listeners) listener();
  }

  private publishRuntime(normalizedPath: string): void {
    const listeners = this.runtimeListeners.get(normalizedPath);
    if (!listeners) return;
    for (const listener of Array.from(listeners)) listener();
  }
}
