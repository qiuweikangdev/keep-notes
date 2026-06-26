export const IPC_CHANNELS = {
  WINDOW: {
    MINIMIZE: "window:minimize",
    MAXIMIZE: "window:maximize",
    CLOSE: "window:close",
    OPEN_TARGET: "window:open-target",
  },
  APP: {
    GET_INFO: "app:get-info",
    GET_UPDATE_STATE: "app:get-update-state",
    CHECK_FOR_UPDATES: "app:check-for-updates",
    CANCEL_UPDATE: "app:cancel-update",
    INSTALL_UPDATE: "app:install-update",
    OPEN_REPOSITORY: "app:open-repository",
    ON_UPDATE_STATE: "app:on-update-state",
  },
  EDITOR: {
    UPDATE_DIRTY_STATE: "editor:update-dirty-state",
    SAVE_DRAFT: "editor:save-draft",
  },
  FILE: {
    READ: "file:read",
    WRITE: "file:write",
    SAVE_AS: "file:save-as",
    OPEN_DIALOG: "file:open-dialog",
    GET_SELECTED_PATH: "file:get-selected-path",
    GENERATE_TREE: "file:generate-tree",
    OPEN_IN_EXPLORER: "file:open-in-explorer",
    COPY_PATH: "file:copy-path",
    OPEN_IN_NEW_WINDOW: "file:open-in-new-window",
    LIST_EXTERNAL_OPEN_APPS: "file:list-external-open-apps",
    OPEN_WITH_EXTERNAL_APP: "file:open-with-external-app",
    WATCH: "file:watch", // 监听文件变化
    UNWATCH: "file:unwatch", // 取消监听文件变化
    ON_FILE_CHANGED: "file:on-changed", // 文件变化通知
    WATCH_WORKSPACE: "file:watch-workspace",
    UNWATCH_WORKSPACE: "file:unwatch-workspace",
    ON_WORKSPACE_CHANGED: "file:on-workspace-changed",
  },
  REMINDER: {
    LIST: "reminder:list",
    CREATE: "reminder:create",
    UPDATE: "reminder:update",
    DELETE: "reminder:delete",
    COMPLETE: "reminder:complete",
    ON_CHANGED: "reminder:on-changed",
    ON_TRIGGERED: "reminder:on-triggered",
  },
  NOTIFICATION: {
    GET_CONFIG: "notification:get-config",
    SET_CONFIG: "notification:set-config",
    TEST_CHANNEL: "notification:test-channel",
    ON_CONFIG_CHANGED: "notification:on-config-changed",
  },
  TREE: {
    CREATE_FILE: "tree:create-file",
    CREATE_FOLDER: "tree:create-folder",
    RENAME: "tree:rename",
    DELETE: "tree:delete",
    MOVE: "tree:move",
  },
  GIT: {
    // 原有通道
    DOWNLOAD: "git:download",
    UPLOAD: "git:upload",
    // 新增通道
    DETECT: "git:detect", // 检测是否为 Git 仓库
    GET_STATUS: "git:get-status", // 获取 Git 状态
    GET_BRANCHES: "git:get-branches", // 获取分支列表
    SWITCH_BRANCH: "git:switch-branch", // 切换分支
    ADD_FILES: "git:add-files", // 添加文件到暂存区
    UNSTAGE_FILES: "git:unstage-files", // 取消文件暂存
    COMMIT: "git:commit", // 提交更改
    PUSH: "git:push", // 推送到远程
    PULL: "git:pull", // 从远程拉取
    CREATE_BRANCH: "git:create-branch", // 创建新分支
    GET_CURRENT_BRANCH: "git:get-current-branch", // 获取当前分支
    GET_FILE_DIFF: "git:get-file-diff", // 获取文件差异
    GET_FILE_HEAD_CONTENT: "git:get-file-head-content", // 获取 HEAD 中的文件内容
    DISCARD_CHANGES: "git:discard-changes", // 放弃更改
    OPEN_FILE: "git:open-file", // 打开文件
  },
  // 菜单动作通道
  MENU: {
    ACTION: "menu:action",
  },
} as const;

export type IpcChannel =
  (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS][keyof (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]];
