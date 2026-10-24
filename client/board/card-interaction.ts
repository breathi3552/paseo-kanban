// Web event shapes stay local; the plugin deliberately does not depend on DOM types.
export interface CardEventTarget {
  closest?(selector: string): unknown;
  parentElement?: CardEventTarget;
}
export interface CardContextEvent {
  target?: CardEventTarget;
  nativeEvent?: {
    target?: CardEventTarget;
    clientX?: number;
    clientY?: number;
  };
  preventDefault(): void;
  stopPropagation(): void;
}
export interface CardKeyEvent {
  key: string;
  shiftKey?: boolean;
  target?: CardEventTarget;
  currentTarget?: unknown;
  isComposing?: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

/** Exclude the complete controls, including hit slop and capture-phase events. */
export function isCardControl(event: {
  target?: unknown;
  nativeEvent?: { target?: unknown };
}): boolean {
  const target = (event.target ?? event.nativeEvent?.target) as
    CardEventTarget | undefined;
  return Boolean(
    target?.closest?.("[data-kanban-control]") ??
    target?.parentElement?.closest?.("[data-kanban-control]"),
  );
}
