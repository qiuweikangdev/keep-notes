import type { CloseSaveSnapshot } from "@shared/types";
import { normalizeRichDocumentPath } from "./rich-document-surface-registry";

export interface BackgroundEditorSaveInput {
  path: string;
  flush: () => Promise<boolean>;
  getContent: () => string | null;
  release: () => void;
}

interface BackgroundEditorSave {
  key: string;
  path: string;
  flush: () => Promise<boolean>;
  getContent: () => string | null;
  releases: Array<() => void>;
  inFlight: Promise<boolean> | null;
}

export const BACKGROUND_EDITOR_SAVE_GROUP_ID = "background-editor-save";

export class EditorBackgroundSaveCoordinator {
  private readonly records = new Map<string, BackgroundEditorSave>();
  private readonly listeners = new Set<() => void>();

  track(input: BackgroundEditorSaveInput): void {
    const key = normalizeRichDocumentPath(input.path);
    const existing = this.records.get(key);
    if (existing) {
      // 同一路径可能在旧任务失败后再次切走；统一持有新旧 token，避免替换 token 后意外失去运行时保护。
      existing.releases.push(input.release);
      return;
    }

    this.records.set(key, {
      key,
      path: input.path,
      flush: input.flush,
      getContent: input.getContent,
      releases: [input.release],
      inFlight: null,
    });
    this.publish();
  }

  hasPending(path?: string): boolean {
    return path
      ? this.records.has(normalizeRichDocumentPath(path))
      : this.records.size > 0;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async flush(path: string): Promise<boolean> {
    const record = this.records.get(normalizeRichDocumentPath(path));
    if (!record) return true;
    if (record.inFlight) return record.inFlight;

    const inFlight = record.flush();
    record.inFlight = inFlight;

    try {
      const succeeded = await inFlight;
      if (succeeded) this.complete(record);
      return succeeded;
    } finally {
      if (record.inFlight === inFlight) record.inFlight = null;
    }
  }

  async getNextCloseSnapshot(): Promise<CloseSaveSnapshot | null> {
    // 关闭保存会依次排空后台任务；只有自动写盘失败时才把最新快照交给主进程直接保存。
    while (this.records.size > 0) {
      const record = this.records.values().next().value as
        | BackgroundEditorSave
        | undefined;
      if (!record) return null;

      const succeeded = await this.flush(record.path);
      if (succeeded) continue;

      const content = record.getContent();
      if (content === null) {
        throw new Error(`Background editor save failed: ${record.path}`);
      }

      return {
        groupId: BACKGROUND_EDITOR_SAVE_GROUP_ID,
        tabId: record.key,
        filePath: record.path,
        content,
      };
    }

    return null;
  }

  confirmCloseSave(
    groupId: string,
    tabId: string,
    filePath: string | null,
    content: string,
  ): boolean {
    if (
      groupId !== BACKGROUND_EDITOR_SAVE_GROUP_ID ||
      !filePath ||
      tabId !== normalizeRichDocumentPath(filePath)
    ) {
      return false;
    }
    const record = this.records.get(normalizeRichDocumentPath(filePath));
    if (!record || record.getContent() !== content) {
      return false;
    }

    this.complete(record);
    return true;
  }

  isCloseSaveIdentity(groupId: string): boolean {
    return groupId === BACKGROUND_EDITOR_SAVE_GROUP_ID;
  }

  cancelAll(): void {
    if (this.records.size === 0) return;
    const records = [...this.records.values()];
    this.records.clear();
    for (const record of records) {
      for (const release of record.releases) release();
    }
    this.publish();
  }

  private complete(record: BackgroundEditorSave): void {
    if (this.records.get(record.key) !== record) return;
    this.records.delete(record.key);
    // 只有磁盘已保存或关闭流程已接管快照后，才允许宿主回收旧富文本会话。
    for (const release of record.releases) release();
    this.publish();
  }

  private publish(): void {
    for (const listener of this.listeners) listener();
  }
}
