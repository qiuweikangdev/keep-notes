export const IPC_CHANNELS = {
  WINDOW: {
    MINIMIZE: "window:minimize",
    MAXIMIZE: "window:maximize",
    CLOSE: "window:close",
  },
  FILE: {
    READ: "file:read",
    WRITE: "file:write",
    OPEN_DIALOG: "file:open-dialog",
    GET_SELECTED_PATH: "file:get-selected-path",
    GENERATE_TREE: "file:generate-tree",
    OPEN_IN_EXPLORER: "file:open-in-explorer",
  },
  TREE: {
    CREATE_FILE: "tree:create-file",
    CREATE_FOLDER: "tree:create-folder",
    RENAME: "tree:rename",
    DELETE: "tree:delete",
    MOVE: "tree:move",
  },
  GIT: {
    DOWNLOAD: "git:download",
    UPLOAD: "git:upload",
  },
} as const;

export type IpcChannel =
  (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS][keyof (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]];
