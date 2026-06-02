import { useEffect } from "react";
import { useEditorStore } from "@/store/editor.store";

// 暴露给主进程调用的全局函数
export function EditorBridge() {
  useEffect(() => {
    // 获取编辑器内容
    (window as any).__getEditorContent = () => {
      return useEditorStore.getState().content;
    };

    // 获取文件路径
    (window as any).__getFilePath = () => {
      return useEditorStore.getState().filePath;
    };

    // 保存成功回调（直接保存到已有文件）
    (window as any).__onSaveSuccess = () => {
      useEditorStore.getState().setDirty(false);
    };

    // 另存为成功回调
    (window as any).__onSaveAsSuccess = (newFilePath: string) => {
      useEditorStore.getState().setFilePath(newFilePath);
      useEditorStore.getState().setDirty(false);
    };

    // 监听 store 变化，同步脏状态到主进程
    const unsub = useEditorStore.subscribe((state, prevState) => {
      if (state.isDirty !== prevState.isDirty) {
        window.electronAPI.updateDirtyState(state.isDirty);
      }
    });

    // 初始同步一次
    const initialState = useEditorStore.getState();
    window.electronAPI.updateDirtyState(initialState.isDirty);

    return () => {
      delete (window as any).__getEditorContent;
      delete (window as any).__getFilePath;
      delete (window as any).__onSaveSuccess;
      delete (window as any).__onSaveAsSuccess;
      unsub();
    };
  }, []);

  return null;
}
