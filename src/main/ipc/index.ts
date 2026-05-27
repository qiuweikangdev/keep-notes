import { registerFileIpc } from "./file.ipc";
import { registerTreeIpc } from "./tree.ipc";
import { registerGitIpc } from "./git.ipc";
import { registerMenuIpc } from "./menu.ipc";

export function registerAllIpc(): void {
  registerFileIpc();
  registerTreeIpc();
  registerGitIpc();
  registerMenuIpc();
}
