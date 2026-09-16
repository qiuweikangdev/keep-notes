import { useCallback, useEffect, useState } from "react";

import { useElectron } from "@/hooks/use-electron";
import { useDiffStore } from "@/store/diff.store";
import {
  useEditorStore,
  type EditorMode,
  type EditorTab,
} from "@/store/editor.store";
import { useTreeStore } from "@/store/tree.store";
import { CodeResult } from "@/types";
import { getRevealInFileManagerLabel } from "@/features/file-tree/utils";
import {
  showNoDiffChangesToast,
  showNoDiffContentToast,
} from "@/features/diff/lib/diff-toast";
import { areDiffContentsEqual } from "@/features/diff/lib/diff-content";
import { hasNoHeadVersion, toGitRelativePath } from "./editor-git-actions";
import { getEditorDocumentPath } from "./editor-document-path";
import {
  editorCache,
  flushEditorChange,
  richDocumentSessionManager,
} from "./editor-runtime";
import { discardFileChanges } from "./discard-file-changes";
import { selectEditorToolbarSignature } from "./editor-view-selectors";

interface UseEditorTabActionsOptions {
  groupId: string;
  tabId?: string | null;
  onNewTab: () => void;
  onSplitRight: () => void;
  onSplitDown: () => void;
}

export function useEditorTabActions({
  groupId,
  tabId,
  onNewTab,
  onSplitRight,
  onSplitDown,
}: UseEditorTabActionsOptions) {
  useEditorStore(selectEditorToolbarSignature(groupId));
  const group = useEditorStore
    .getState()
    .panelGroups.find((item) => item.id === groupId);
  const targetTabId = tabId ?? group?.activeTabId;
  const tab = group?.tabs.find((item) => item.id === targetTabId);
  const getTargetTab = useCallback(() => {
    const state = useEditorStore.getState();
    const targetGroup = state.panelGroups.find((item) => item.id === groupId);
    const currentTabId = tabId ?? targetGroup?.activeTabId;
    return targetGroup?.tabs.find((item) => item.id === currentTabId);
  }, [groupId, tabId]);
  const repositoryRoot = useTreeStore((state) => state.treeRoot?.key ?? null);
  const setTabMode = useEditorStore((state) => state.setTabMode);
  const setTabParseError = useEditorStore((state) => state.setTabParseError);
  const openDiff = useDiffStore((state) => state.openDiff);
  const closeDiff = useDiffStore((state) => state.closeDiff);
  const updateContent = useDiffStore((state) => state.updateContent);
  const {
    detectGitRepo,
    discardChanges,
    getFileHeadContent,
    getGitStatus,
    loadTree,
    openInExplorer,
  } = useElectron();
  const [isGitRepo, setIsGitRepo] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const revealInFileManagerLabel = getRevealInFileManagerLabel(
    window.electronAPI?.getPlatform?.(),
  );

  useEffect(() => {
    let active = true;
    if (!repositoryRoot) {
      setIsGitRepo(false);
      return;
    }

    void detectGitRepo(repositoryRoot).then((result) => {
      if (active) {
        setIsGitRepo(
          result.code === CodeResult.Success && result.data?.isGitRepo === true,
        );
      }
    });
    return () => {
      active = false;
    };
  }, [detectGitRepo, repositoryRoot]);

  const flushRichSnapshot = useCallback(
    async (
      targetTab: EditorTab,
      reconcileSource = false,
    ): Promise<EditorTab | null> => {
      if (targetTab.mode === "rich") {
        const documentPath = getEditorDocumentPath(targetTab);
        if (richDocumentSessionManager.getRuntime(documentPath)) {
          await richDocumentSessionManager.serializePendingChange(
            documentPath,
            { reconcileSource },
          );
        } else {
          await flushEditorChange(groupId, targetTab.id, { reconcileSource });
        }
      }

      const latestTab = getTargetTab();
      return latestTab?.id === targetTab.id ? latestTab : null;
    },
    [getTargetTab, groupId],
  );

  const handleModeChange = useCallback(
    async (mode: EditorMode) => {
      let currentTab: EditorTab | null | undefined = getTargetTab();
      if (!currentTab || currentTab.mode === mode) return;

      if (currentTab.mode === "rich" && mode === "source") {
        currentTab = await flushRichSnapshot(currentTab, true);
        if (!currentTab) return;
      }
      if (mode === "rich") {
        // 解析错误的显式重试绕过块缓存，普通文件打开仍可复用相同源码。
        if (currentTab.parseErrorMessage)
          editorCache.invalidateBlocks(getEditorDocumentPath(currentTab));
        setTabParseError(groupId, currentTab.id, null);
      }
      const canReuseRichDocument =
        mode === "rich" &&
        currentTab.filePath !== null &&
        editorCache.hasParsedSource(currentTab.filePath, currentTab.content);
      setTabMode(groupId, currentTab.id, mode, {
        reloadRichDocument: !canReuseRichDocument,
      });
    },
    [flushRichSnapshot, getTargetTab, groupId, setTabMode, setTabParseError],
  );

  const handleDiff = useCallback(async () => {
    let currentTab: EditorTab | null | undefined = getTargetTab();
    if (!currentTab?.filePath || !repositoryRoot) return;
    currentTab = await flushRichSnapshot(currentTab);
    if (!currentTab?.filePath) return;
    const filePath = currentTab.filePath;
    const editorContent = currentTab.content;

    const relativePath = toGitRelativePath(repositoryRoot, filePath);
    const result = await getFileHeadContent(repositoryRoot, relativePath);
    let headContent = result.data ?? "";

    if (result.code !== CodeResult.Success) {
      const statusResult = await getGitStatus(repositoryRoot);
      if (
        statusResult.code !== CodeResult.Success ||
        !statusResult.data ||
        !hasNoHeadVersion(statusResult.data, relativePath)
      ) {
        closeDiff();
        return;
      }
      // 未跟踪或首次新增的文件在 HEAD 中没有内容，以空文件作为差异基线。
      headContent = "";
    }

    if (areDiffContentsEqual(headContent, editorContent)) {
      showNoDiffContentToast();
      return;
    }

    openDiff(filePath, headContent, editorContent);
    updateContent(headContent, editorContent);
  }, [
    closeDiff,
    flushRichSnapshot,
    getFileHeadContent,
    getGitStatus,
    getTargetTab,
    openDiff,
    repositoryRoot,
    updateContent,
  ]);

  const handleRevealInFileManager = useCallback(() => {
    const currentTab = getTargetTab();
    if (!currentTab?.filePath || currentTab.pendingFilePath) return;
    void openInExplorer(currentTab.filePath);
  }, [getTargetTab, openInExplorer]);

  const handleModeToggle = useCallback(() => {
    const currentTab = getTargetTab();
    if (!currentTab) return;
    void handleModeChange(currentTab.mode === "rich" ? "source" : "rich");
  }, [getTargetTab, handleModeChange]);

  const handleOpenFloatingWindow = useCallback(async () => {
    let currentTab: EditorTab | null | undefined = getTargetTab();
    if (!currentTab) {
      window.electronAPI.createQuickEditorWindow();
      return;
    }

    currentTab = await flushRichSnapshot(currentTab);
    if (!currentTab) return;
    window.electronAPI.createQuickEditorWindow({
      content: currentTab.content,
      source: {
        groupId,
        tabId: currentTab.id,
        filePath: currentTab.filePath,
        temporaryTitle: currentTab.temporaryTitle ?? null,
        repositoryRoot,
      },
    });
  }, [flushRichSnapshot, getTargetTab, groupId, repositoryRoot]);

  const handleDiscard = useCallback(async () => {
    const currentTab = getTargetTab();
    if (!currentTab?.filePath || !repositoryRoot) return;
    const result = await discardFileChanges(
      repositoryRoot,
      currentTab.filePath,
      {
        discardChanges,
        getFileHeadContent,
        getGitStatus,
        loadTree,
      },
    );
    if (result.noChanges) {
      showNoDiffChangesToast();
    }
  }, [
    discardChanges,
    getFileHeadContent,
    getGitStatus,
    getTargetTab,
    loadTree,
    repositoryRoot,
  ]);

  return {
    confirmDiscard,
    handleDiff,
    handleDiscard,
    handleModeToggle,
    handleOpenFloatingWindow,
    handleRevealInFileManager,
    onNewTab,
    onSplitDown,
    onSplitRight,
    revealInFileManagerLabel,
    setConfirmDiscard,
    showGitActions: isGitRepo && Boolean(tab?.filePath && !tab.pendingFilePath),
    tab,
  };
}
