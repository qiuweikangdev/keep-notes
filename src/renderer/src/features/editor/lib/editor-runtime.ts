import type { Block } from "@blocknote/core";

import { EditorCache } from "./editor-cache";
import { EditorLoadSession } from "./editor-load-session";

export const editorCache = new EditorCache<Block[]>({ maxEntries: 24 });
export const editorLoadSession = new EditorLoadSession();
