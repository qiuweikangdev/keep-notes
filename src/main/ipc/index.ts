import { registerFileIpc } from "./file.ipc";
import { registerTreeIpc } from "./tree.ipc";
import { registerGitIpc } from "./git.ipc";
import { registerMenuIpc } from "./menu.ipc";
import { registerEditorIpc } from "./editor.ipc";

export function registerAllIpc(): void {
  registerFileIpc();
  registerTreeIpc();
  registerGitIpc();
  registerMenuIpc();
  registerEditorIpc();
}
