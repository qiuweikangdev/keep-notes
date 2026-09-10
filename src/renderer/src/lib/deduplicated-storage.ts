import type { StateStorage } from "zustand/middleware";

/** persist 会在非持久化字段更新时调用 setItem；只写发生变化的序列化值。 */
export function createDeduplicatedStorage(storage: Storage): StateStorage {
  return {
    getItem: (name) => storage.getItem(name),
    setItem: (name, value) => {
      if (storage.getItem(name) !== value) storage.setItem(name, value);
    },
    removeItem: (name) => storage.removeItem(name),
  };
}
