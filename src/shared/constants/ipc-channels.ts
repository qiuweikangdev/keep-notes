export const IPC_CHANNELS = {
  WINDOW: {
    MINIMIZE: "window:minimize",
    MAXIMIZE: "window:maximize",
    CLOSE: "window:close",
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
    WATCH: "file:watch", // 监听文件变化
    UNWATCH: "file:unwatch", // 取消监听文件变化
    ON_FILE_CHANGED: "file:on-changed", // 文件变化通知
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
} as const;

export type IpcChannel =
  (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS][keyof (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]];
