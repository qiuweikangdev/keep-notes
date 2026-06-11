import {
  createContext,
  useContext,
  useCallback,
  useRef,
  useState,
  useEffect,
  type ReactNode,
} from "react";

interface DragResizeState {
  isDragging: boolean;
  isResizing: boolean;
}

interface DragResizeContextType extends DragResizeState {
  startDrag: () => void;
  endDrag: () => void;
  startResize: () => void;
  endResize: () => void;
  isIdle: boolean;
}

const DragResizeContext = createContext<DragResizeContextType | null>(null);

export function useDragResize() {
  const context = useContext(DragResizeContext);
  if (!context) {
    throw new Error("useDragResize must be used within a DragResizeProvider");
  }
  return context;
}

interface DragResizeProviderProps {
  children: ReactNode;
  debounceMs?: number;
}

export function DragResizeProvider({
  children,
  debounceMs = 100,
}: DragResizeProviderProps) {
  const [state, setState] = useState<DragResizeState>({
    isDragging: false,
    isResizing: false,
  });

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedSetState = useCallback(
    (newState: Partial<DragResizeState>) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        setState((prev) => ({ ...prev, ...newState }));
      }, debounceMs);
    },
    [debounceMs],
  );

  const startDrag = useCallback(() => {
    debouncedSetState({ isDragging: true });
  }, [debouncedSetState]);

  const endDrag = useCallback(() => {
    debouncedSetState({ isDragging: false });
  }, [debouncedSetState]);

  const startResize = useCallback(() => {
    debouncedSetState({ isResizing: true });
  }, [debouncedSetState]);

  const endResize = useCallback(() => {
    debouncedSetState({ isResizing: false });
  }, [debouncedSetState]);

  const isIdle = !state.isDragging && !state.isResizing;

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return (
    <DragResizeContext.Provider
      value={{
        ...state,
        startDrag,
        endDrag,
        startResize,
        endResize,
        isIdle,
      }}
    >
      {children}
    </DragResizeContext.Provider>
  );
}
