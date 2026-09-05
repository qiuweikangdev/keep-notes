import { isAbsolute, join, relative, sep } from "node:path";

type PrepareMove = (
  from: string,
  to: string,
) => Promise<(moved: boolean) => void>;
const participants = new Set<PrepareMove>();
let pendingMove: Promise<void> = Promise.resolve();

export function relocatedPath(path: string, from: string, to: string): string {
  const suffix = relative(from, path);
  return suffix === "" ||
    (!isAbsolute(suffix) && suffix !== ".." && !suffix.startsWith(`..${sep}`))
    ? join(to, suffix)
    : path;
}

export function registerFilePathMove(prepare: PrepareMove): () => void {
  participants.add(prepare);
  return () => participants.delete(prepare);
}

export function moveFilePath(
  from: string,
  to: string,
  move: () => Promise<void>,
): Promise<void> {
  // 同一主进程串行处理路径迁移，写入参与者先暂停新快照，再等待旧写入完成。
  const task = pendingMove.then(async () => {
    const finishers: Array<(moved: boolean) => void> = [];
    let moved = false;
    try {
      for (const prepare of participants)
        finishers.push(await prepare(from, to));
      await move();
      moved = true;
    } finally {
      for (const finish of finishers.toReversed()) finish(moved);
    }
  });
  pendingMove = task.catch(() => {});
  return task;
}
