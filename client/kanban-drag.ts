import {
  useRef,
  useSyncExternalStore,
  useEffect,
  useLayoutEffect,
} from "react";
import type {
  GestureResponderHandlers,
  PanResponderCallbacks,
  PanResponderInstance,
} from "react-native";
import type { KanbanTask } from "../shared/kanban";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LaneLayoutItem {
  id: string;
  rect: Rect;
}

export interface DragHitTestOptions {
  pointerX: number;
  pointerY: number;
  containerBounds: Rect | null;
  scrollX: number;
  lanes: LaneLayoutItem[];
}

export function findHoveredLaneId(options: DragHitTestOptions): string | null {
  const { pointerX, pointerY, containerBounds, scrollX, lanes } = options;

  if (containerBounds) {
    if (
      pointerX < containerBounds.x ||
      pointerX > containerBounds.x + containerBounds.width ||
      pointerY < containerBounds.y ||
      pointerY > containerBounds.y + containerBounds.height
    ) {
      return null;
    }
  }

  const containerOriginX = containerBounds ? containerBounds.x : 0;
  const containerOriginY = containerBounds ? containerBounds.y : 0;
  const contentX = pointerX - containerOriginX + scrollX;
  const contentY = pointerY - containerOriginY;

  for (const lane of lanes) {
    const { x, y, width, height } = lane.rect;
    if (
      contentX >= x &&
      contentX <= x + width &&
      contentY >= y &&
      contentY <= y + height
    ) {
      return lane.id;
    }
  }

  return null;
}

export interface DragSlotState {
  readonly isDragging: boolean;
  readonly draggingTaskId: string | null;
  readonly draggingSourceLaneId: string | null;
  readonly hoveredLaneId: string | null;
  readonly targetIndex: number;
  readonly draggedCardWidth?: number;
  readonly draggedCardHeight?: number;
  readonly dragLock: boolean;
}

export interface DragFeedback {
  readonly isDragging: boolean;
  readonly draggingTaskId: string | null;
  readonly draggingSourceLaneId: string | null;
  readonly hoveredLaneId: string | null;
  readonly targetIndex?: number;
  readonly draggedCardWidth?: number;
  readonly draggedCardHeight?: number;
  readonly grabOffsetX?: number;
  readonly grabOffsetY?: number;
  readonly pointerX?: number;
  readonly pointerY?: number;
  readonly autoScrollVelocity?: number;
  readonly dragLock: boolean;
}

export interface TaskPreviewItem {
  task: KanbanTask | null;
  projectDisplayName: string | null;
}

export interface KanbanDragOptions {
  lanes?: ({ id: string; isCompletionLane?: boolean } | string)[];
  onReorderTask?: (
    taskId: string,
    targetLaneId: string,
    targetIndex: number,
  ) => void | Promise<void>;
  getTaskPreview?: (taskId: string) => TaskPreviewItem | null;
}

export interface ContainerRefTarget {
  measureInWindow?: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void;
  getBoundingClientRect?: () => {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  getScrollableNode?: () => {
    getBoundingClientRect?: () => {
      left: number;
      top: number;
      width: number;
      height: number;
    };
  } | null;
  scrollTo?: (options: { x: number; animated: boolean }) => void;
}

export interface PanResponderFactory {
  create: (config: PanResponderCallbacks) => PanResponderInstance;
}

export interface CardDragBinding {
  readonly isDragging: boolean;
  readonly cardPanHandlers?: GestureResponderHandlers;
  readonly handlePanHandlers?: GestureResponderHandlers;
  readonly onLayout: (rect: Rect) => void;
  readonly onUnmount: () => void;
}

export interface LaneDragBinding {
  readonly isHovered: boolean;
  readonly targetIndex: number;
  readonly isTaskDragging: (taskId: string) => boolean;
  readonly draggedCardWidth?: number;
  readonly draggedCardHeight?: number;
  readonly isDragLocked: () => boolean;
  readonly bindCard: (
    taskId: string,
    onSelectTask?: () => void,
    factory?: PanResponderFactory,
  ) => CardDragBinding;
  readonly registerLaneLayout: (layout: Rect) => void;
  readonly registerCardsViewport: (layout: Rect) => void;
  readonly handleLaneScroll: (scrollY: number) => void;
  readonly registerCardLayout: (taskId: string, layout: Rect) => void;
  readonly unregisterCardLayout: (taskId: string) => void;
  readonly setDropSpacerY: (y: number | null) => void;
  readonly setLaneCardOrder: (
    laneIdOrTaskIds: string | string[],
    taskIds?: string[],
  ) => void;
  readonly startGesture: (
    taskId: string,
    sourceLaneId: string,
    pointerX: number,
    pointerY: number,
    immediate?: boolean,
  ) => void;
  readonly moveGesture: (pointerX: number, pointerY: number) => void;
  readonly releaseGesture: (pointerX?: number, pointerY?: number) => void;
  readonly cancelGesture: () => void;
}

interface ActiveDragSession {
  taskId: string;
  sourceLaneId: string;
  startX: number;
  startY: number;
  lastPointerX: number;
  lastPointerY: number;
  isActivated: boolean;
  currentTargetIndex?: number;
  draggedCardWidth?: number;
  draggedCardHeight?: number;
  grabOffsetX: number;
  grabOffsetY: number;
  cardLayouts: Map<string, Map<string, Rect>>;
}

export class KanbanDragController {
  private lanesList: string[] = [];
  private validLaneSet: Set<string> = new Set();
  private completionLaneSet: Set<string> = new Set();
  private laneLayouts: Map<string, Rect> = new Map();
  private laneCardOrders: Map<string, string[]> = new Map();
  private cardLayouts: Map<string, Map<string, Rect>> = new Map();
  private laneFirstCardY: Map<string, number> = new Map();
  private laneCardGap: Map<string, number> = new Map();
  private cardsViewportLayouts: Map<string, Rect> = new Map();
  private laneScrollY: Map<string, number> = new Map();
  private containerBounds: Rect | null = null;
  private containerRef: ContainerRefTarget | null = null;
  private scrollX: number = 0;
  private activeSession: ActiveDragSession | null = null;
  private onReorderTask?: (
    taskId: string,
    targetLaneId: string,
    targetIndex: number,
  ) => void | Promise<void>;
  private dragLock: boolean = false;
  private dragLockTimeout: ReturnType<typeof setTimeout> | null = null;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingOnPress: (() => void) | null = null;
  private listeners: Set<() => void> = new Set();
  private slotListeners: Set<() => void> = new Set();
  private dropListeners: Set<() => void> = new Set();
  private dropSpacerY: number | null = null;
  private releaseHandler?: (
    releaseX?: number,
    releaseY?: number,
  ) => Promise<void>;
  private cancelHandler?: () => void;
  private panResponderFactory: PanResponderFactory | null = null;
  private cardCallbacks: Map<string, () => void> = new Map();
  private cardResponders: Map<
    string,
    { body: PanResponderInstance; handle: PanResponderInstance }
  > = new Map();
  private pendingInputKind: "mouse" | "touch" = "mouse";
  private operationSeq: number = 0;
  private currentOperationId: string | null = null;
  private currentDroppingState: DroppingState | null = null;
  private getTaskPreview?: (taskId: string) => TaskPreviewItem | null;
  private lifecycleEpoch: number = 0;

  private feedback: DragFeedback = {
    isDragging: false,
    draggingTaskId: null,
    draggingSourceLaneId: null,
    hoveredLaneId: null,
    dragLock: false,
  };

  private slotState: DragSlotState = {
    isDragging: false,
    draggingTaskId: null,
    draggingSourceLaneId: null,
    hoveredLaneId: null,
    targetIndex: 0,
    dragLock: false,
  };

  constructor(options?: KanbanDragOptions) {
    if (options?.lanes) {
      this.setLanes(options.lanes);
    }
    if (options?.onReorderTask) {
      this.setOnReorderTask(options.onReorderTask);
    }
    if (options?.getTaskPreview) {
      this.getTaskPreview = options.getTaskPreview;
    }
  }

  setLanes = (
    lanes: ({ id: string; isCompletionLane?: boolean } | string)[],
  ) => {
    this.lanesList = lanes.map((l) => (typeof l === "string" ? l : l.id));
    this.validLaneSet = new Set(this.lanesList);
    this.completionLaneSet = new Set(
      lanes.flatMap((lane) =>
        typeof lane !== "string" && lane.isCompletionLane ? [lane.id] : [],
      ),
    );
    if (this.activeSession && this.activeSession.isActivated) {
      this.recomputeHover(
        this.activeSession.lastPointerX,
        this.activeSession.lastPointerY,
      );
    }
  };

  setOnReorderTask = (
    fn: (
      taskId: string,
      targetLaneId: string,
      targetIndex: number,
    ) => void | Promise<void>,
  ) => {
    this.onReorderTask = fn;
  };

  setGetTaskPreview = (fn?: (taskId: string) => TaskPreviewItem | null) => {
    this.getTaskPreview = fn;
  };

  setLaneCardOrder = (laneId: string, taskIds: string[]) => {
    const prevOrder = this.laneCardOrders.get(laneId);
    const laneMap = this.cardLayouts.get(laneId);

    if (laneMap && laneMap.size > 0) {
      this.captureLaneFlowMetrics(laneId, prevOrder ?? taskIds, laneMap);
    }

    this.laneCardOrders.set(laneId, [...taskIds]);

    if (laneMap && laneMap.size > 0) {
      this.reflowLaneCardLayouts(laneId);
    }
  };

  registerCardLayout = (laneId: string, taskId: string, rect: Rect) => {
    let laneMap = this.cardLayouts.get(laneId);
    if (!laneMap) {
      laneMap = new Map();
      this.cardLayouts.set(laneId, laneMap);
    }
    const hadCard = laneMap.has(taskId);
    const order = this.laneCardOrders.get(laneId);
    const idx = order ? order.indexOf(taskId) : -1;

    if (
      !this.laneFirstCardY.has(laneId) &&
      (idx === 0 || (!order && laneMap.size === 0))
    ) {
      this.laneFirstCardY.set(laneId, rect.y);
    }

    const hasSubsequentMeasuredCard =
      order && idx >= 0
        ? order.slice(idx + 1).some((id) => laneMap.has(id))
        : false;

    if (!hadCard && idx > 0 && order && !hasSubsequentMeasuredCard) {
      const prevRect = laneMap.get(order[idx - 1]);
      if (prevRect) {
        const measuredGap = rect.y - (prevRect.y + prevRect.height);
        if (measuredGap >= 0) {
          this.laneCardGap.set(laneId, measuredGap);
        }
      }
    }

    laneMap.set(taskId, rect);

    if (
      !this.activeSession &&
      !this.currentDroppingState &&
      order &&
      idx >= 0 &&
      (hadCard || hasSubsequentMeasuredCard)
    ) {
      this.reflowLaneCardLayouts(laneId);
    }
  };

  unregisterCardLayout = (laneId: string, taskId: string) => {
    const laneMap = this.cardLayouts.get(laneId);
    if (laneMap) {
      laneMap.delete(taskId);
      if (laneMap.size === 0) {
        this.laneFirstCardY.delete(laneId);
        this.laneCardGap.delete(laneId);
      } else if (!this.activeSession && !this.currentDroppingState) {
        this.reflowLaneCardLayouts(laneId);
      }
    }
  };

  private captureLaneFlowMetrics(
    laneId: string,
    order: string[],
    laneMap: Map<string, Rect>,
  ) {
    if (!this.laneFirstCardY.has(laneId)) {
      const firstRect = order.length > 0 ? laneMap.get(order[0]) : undefined;
      if (firstRect) {
        this.laneFirstCardY.set(laneId, firstRect.y);
      } else {
        let minY = Infinity;
        for (const rect of laneMap.values()) {
          if (rect.y < minY) minY = rect.y;
        }
        if (Number.isFinite(minY)) {
          this.laneFirstCardY.set(laneId, minY);
        }
      }
    }

    if (!this.laneCardGap.has(laneId)) {
      for (let i = 0; i < order.length - 1; i++) {
        const curr = laneMap.get(order[i]);
        const next = laneMap.get(order[i + 1]);
        if (curr && next) {
          const measuredGap = next.y - (curr.y + curr.height);
          if (measuredGap >= 0) {
            this.laneCardGap.set(laneId, measuredGap);
            break;
          }
        }
      }
    }
  }

  private reflowLaneCardLayouts(laneId: string) {
    const order = this.laneCardOrders.get(laneId);
    const laneMap = this.cardLayouts.get(laneId);
    if (!order || !laneMap || laneMap.size === 0) return;

    const firstCardY = this.laneFirstCardY.get(laneId) ?? 0;
    const gap = this.laneCardGap.get(laneId) ?? 8;

    let currentY = firstCardY;
    for (const id of order) {
      const rect = laneMap.get(id);
      if (rect) {
        laneMap.set(id, { ...rect, y: currentY });
        currentY += rect.height + gap;
      } else {
        currentY += 64 + gap;
      }
    }
  }

  private resolveCardOffsetY(
    laneId: string,
    taskId: string,
    laneMap?: Map<string, Rect>,
  ): number | undefined {
    const order = this.laneCardOrders.get(laneId);
    if (!order) return undefined;
    const idx = order.indexOf(taskId);
    if (idx < 0) return undefined;

    const map = laneMap ?? this.cardLayouts.get(laneId);
    const firstRect = order.length > 0 ? map?.get(order[0]) : undefined;
    let currentY =
      this.laneFirstCardY.get(laneId) ?? (firstRect ? firstRect.y : 0);
    const gap = this.laneCardGap.get(laneId) ?? 8;

    for (let i = 0; i < idx; i++) {
      const prevRect = map?.get(order[i]);
      currentY += (prevRect?.height ?? 64) + gap;
    }
    return currentY;
  }

  unregisterCard = (laneId: string, taskId: string) => {
    const key = `${laneId}:${taskId}`;
    this.cardCallbacks.delete(key);
    this.cardResponders.delete(key);
    this.unregisterCardLayout(laneId, taskId);

    if (
      this.activeSession &&
      this.activeSession.taskId === taskId &&
      this.activeSession.sourceLaneId === laneId
    ) {
      if (!this.activeSession.isActivated) {
        this.clearPendingTimer();
        this.pendingOnPress = null;
        this.activeSession = null;
        this.feedback = {
          ...this.feedback,
          isDragging: false,
          draggingTaskId: null,
          draggingSourceLaneId: null,
          hoveredLaneId: null,
          targetIndex: undefined,
          pointerX: undefined,
          pointerY: undefined,
          autoScrollVelocity: 0,
          dragLock: false,
        };
        this.notifyListeners();
      } else {
        this.cancelGesture();
      }
    }
  };

  isDragLocked = (): boolean => {
    return this.dragLock;
  };

  registerContainerBounds = (bounds: Rect | null) => {
    this.containerBounds = bounds;
    if (this.activeSession) {
      this.recomputeHover(
        this.activeSession.lastPointerX,
        this.activeSession.lastPointerY,
      );
    }
  };

  bindContainerRef = (ref: ContainerRefTarget | null) => {
    this.containerRef = ref;
  };

  measureContainer = () => {
    if (this.containerRef?.measureInWindow) {
      this.containerRef.measureInWindow((wx, wy, ww, wh) => {
        if (ww > 0 && wh > 0) {
          this.containerBounds = { x: wx, y: wy, width: ww, height: wh };
          if (this.activeSession) {
            this.recomputeHover(
              this.activeSession.lastPointerX,
              this.activeSession.lastPointerY,
            );
          }
        }
      });
      return;
    }

    const domNode =
      this.containerRef?.getScrollableNode?.() ?? this.containerRef;
    if (domNode && typeof domNode.getBoundingClientRect === "function") {
      const rect = domNode.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        this.containerBounds = {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        };
        if (this.activeSession) {
          this.recomputeHover(
            this.activeSession.lastPointerX,
            this.activeSession.lastPointerY,
          );
        }
      }
    }
  };

  handleContainerLayout = (layout: Rect) => {
    if (!this.containerBounds) {
      this.containerBounds = layout;
    }
    this.measureContainer();
  };

  handleScroll = (scrollX: number) => {
    this.scrollX = scrollX;
    if (this.activeSession) {
      this.recomputeHover(
        this.activeSession.lastPointerX,
        this.activeSession.lastPointerY,
      );
    }
  };

  registerLaneLayout = (laneId: string, rect: Rect) => {
    this.laneLayouts.set(laneId, rect);
  };

  registerCardsViewportLayout = (laneId: string, rect: Rect) => {
    this.cardsViewportLayouts.set(laneId, rect);
  };

  handleLaneScroll = (laneId: string, scrollY: number) => {
    this.laneScrollY.set(laneId, scrollY);
    if (this.activeSession) {
      this.recomputeHover(
        this.activeSession.lastPointerX,
        this.activeSession.lastPointerY,
      );
    }
  };

  setDropSpacerY = (y: number | null) => {
    this.dropSpacerY = y;
  };

  getDropSpacerY = (): number | null => {
    return this.dropSpacerY;
  };

  setReleaseHandler = (
    fn?: (releaseX?: number, releaseY?: number) => Promise<void>,
  ) => {
    this.releaseHandler = fn;
  };

  setCancelHandler = (fn?: () => void) => {
    this.cancelHandler = fn;
  };

  setPanResponderFactory = (factory: PanResponderFactory) => {
    this.panResponderFactory = factory;
  };

  bindCard = (
    laneId: string,
    taskId: string,
    onPress?: () => void,
    panResponderFactory?: PanResponderFactory,
  ): CardDragBinding => {
    const key = `${laneId}:${taskId}`;
    if (onPress) {
      this.cardCallbacks.set(key, onPress);
    } else {
      this.cardCallbacks.delete(key);
    }

    const factory = panResponderFactory ?? this.panResponderFactory;
    let responders = this.cardResponders.get(key);
    if (!responders && factory) {
      const body = factory.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (_e, gs) => {
          const cb = this.cardCallbacks.get(key);
          this.handlePointerDown(
            { taskId, laneId, onPress: cb },
            { x: gs.x0, y: gs.y0 },
            "body",
          );
        },
        onPanResponderMove: (_e, gs) => {
          this.handlePointerMove({ x: gs.moveX, y: gs.moveY });
        },
        onPanResponderRelease: () => this.handlePointerUp(),
        onPanResponderTerminate: () => {
          this.handlePointerCancel();
        },
        onPanResponderTerminationRequest: () => !this.isTaskDragging(taskId),
      });

      const handle = factory.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (_e, gs) => {
          const cb = this.cardCallbacks.get(key);
          this.handlePointerDown(
            { taskId, laneId, onPress: cb },
            { x: gs.x0, y: gs.y0 },
            "handle",
          );
        },
        onPanResponderMove: (_e, gs) => {
          this.handlePointerMove({ x: gs.moveX, y: gs.moveY });
        },
        onPanResponderRelease: () => this.handlePointerUp(),
        onPanResponderTerminate: () => {
          this.handlePointerCancel();
        },
      });

      responders = { body, handle };
      this.cardResponders.set(key, responders);
    }

    return {
      isDragging: this.isTaskDragging(taskId),
      cardPanHandlers: responders?.body?.panHandlers,
      handlePanHandlers: responders?.handle?.panHandlers,
      onLayout: (rect: Rect) => this.registerCardLayout(laneId, taskId, rect),
      onUnmount: () => this.unregisterCard(laneId, taskId),
    };
  };

  private clearPendingTimer = () => {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
  };

  handlePointerDown = (
    context: { taskId: string; laneId: string; onPress?: () => void },
    point: { x: number; y: number },
    source: "handle" | "body" = "body",
    inputKind?: "mouse" | "touch",
  ) => {
    if (this.dragLock) return;
    if (this.activeSession?.isActivated) return;
    if (this.currentDroppingState) return;

    this.clearPendingTimer();
    this.pendingOnPress = context.onPress ?? null;
    this.pendingInputKind = inputKind ?? "mouse";

    if (source === "handle") {
      this.startGesture(context.taskId, context.laneId, point.x, point.y, true);
      return;
    }

    this.startGesture(context.taskId, context.laneId, point.x, point.y, false);

    const longPressDuration = inputKind === "touch" ? 220 : 260;
    const epoch = this.lifecycleEpoch;
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null;
      if (this.lifecycleEpoch !== epoch) return;
      if (this.dragLock) return;
      if (this.activeSession && !this.activeSession.isActivated) {
        this.activeSession.isActivated = true;
        this.dragLock = true;
        const initialHit = this.computeHit(
          this.activeSession.lastPointerX,
          this.activeSession.lastPointerY,
        );
        const targetLaneId = initialHit ?? this.activeSession.sourceLaneId;
        const targetIndex = this.computeTargetIndex(
          targetLaneId,
          this.activeSession.lastPointerY,
        );
        this.activeSession.currentTargetIndex = targetIndex;
        this.feedback = {
          ...this.feedback,
          isDragging: true,
          draggingTaskId: this.activeSession.taskId,
          draggingSourceLaneId: this.activeSession.sourceLaneId,
          hoveredLaneId: initialHit,
          targetIndex,
          draggedCardWidth: this.activeSession.draggedCardWidth,
          draggedCardHeight: this.activeSession.draggedCardHeight,
          grabOffsetX: this.activeSession.grabOffsetX,
          grabOffsetY: this.activeSession.grabOffsetY,
          dragLock: true,
        };
        this.notifyListeners();
      }
    }, longPressDuration);
  };

  handlePointerMove = (point: { x: number; y: number }) => {
    if (!this.activeSession) return;
    const dist = Math.hypot(
      point.x - this.activeSession.startX,
      point.y - this.activeSession.startY,
    );

    // If unactivated touch gesture and user moved >= 5px before 220ms:
    // User is scrolling! Cancel pending gesture, do NOT activate drag, do NOT trigger tap!
    if (!this.activeSession.isActivated && this.pendingInputKind === "touch") {
      if (dist >= 5) {
        this.clearPendingTimer();
        this.pendingOnPress = null;
        this.cancelGesture();
        return;
      }
    }

    if (dist >= 5) {
      this.clearPendingTimer();
    }
    this.moveGesture(point.x, point.y);
  };

  handlePointerUp = async (point?: { x: number; y: number }): Promise<void> => {
    this.clearPendingTimer();
    if (!this.activeSession) return;

    point ??= {
      x: this.activeSession.lastPointerX,
      y: this.activeSession.lastPointerY,
    };
    const wasActivated = this.activeSession.isActivated;
    const dist = Math.hypot(
      point.x - this.activeSession.startX,
      point.y - this.activeSession.startY,
    );
    const onPress = this.pendingOnPress;
    this.pendingOnPress = null;

    if (wasActivated) {
      if (this.releaseHandler) {
        await this.releaseHandler(point?.x, point?.y);
      } else {
        await this.releaseGesture(point?.x, point?.y);
      }
    } else {
      await this.releaseGesture(point?.x, point?.y);
      if (dist < 5 && !this.dragLock && onPress) {
        onPress();
      }
    }
  };

  handlePointerCancel = () => {
    this.clearPendingTimer();
    this.pendingOnPress = null;
    if (this.cancelHandler) {
      this.cancelHandler();
    } else {
      this.cancelGesture();
    }
  };

  startGesture = (
    taskId: string,
    sourceLaneId: string,
    pointerX: number,
    pointerY: number,
    immediate: boolean = true,
  ) => {
    if (this.dragLockTimeout) {
      clearTimeout(this.dragLockTimeout);
      this.dragLockTimeout = null;
    }
    this.measureContainer();

    const isActivated = immediate;
    if (isActivated) {
      this.dragLock = true;
    }

    const cardLayoutsSnapshot = new Map(
      [...this.cardLayouts].map(([id, cards]) => [id, new Map(cards)]),
    );
    const { draggedCardWidth, draggedCardHeight, grabOffsetX, grabOffsetY } =
      this.computeInitialCardGeometry(
        sourceLaneId,
        taskId,
        pointerX,
        pointerY,
        cardLayoutsSnapshot,
      );

    this.activeSession = {
      taskId,
      sourceLaneId,
      startX: pointerX,
      startY: pointerY,
      lastPointerX: pointerX,
      lastPointerY: pointerY,
      isActivated,
      currentTargetIndex: undefined,
      draggedCardWidth,
      draggedCardHeight,
      grabOffsetX,
      grabOffsetY,
      cardLayouts: cardLayoutsSnapshot,
    };

    if (isActivated) {
      const initialHit = this.computeHit(pointerX, pointerY);
      const targetLaneId = initialHit ?? sourceLaneId;
      const targetIndex = this.computeTargetIndex(targetLaneId, pointerY);
      this.activeSession.currentTargetIndex = targetIndex;
      const autoScrollVelocity = this.computeAutoScrollVelocity(pointerX);

      this.feedback = {
        isDragging: true,
        draggingTaskId: taskId,
        draggingSourceLaneId: sourceLaneId,
        hoveredLaneId: initialHit,
        targetIndex,
        draggedCardWidth,
        draggedCardHeight,
        grabOffsetX,
        grabOffsetY,
        pointerX,
        pointerY,
        autoScrollVelocity,
        dragLock: true,
      };
    } else {
      this.feedback = {
        isDragging: false,
        draggingTaskId: taskId,
        draggingSourceLaneId: sourceLaneId,
        hoveredLaneId: null,
        targetIndex: undefined,
        draggedCardWidth,
        draggedCardHeight,
        grabOffsetX,
        grabOffsetY,
        pointerX,
        pointerY,
        autoScrollVelocity: 0,
        dragLock: false,
      };
    }
    this.notifyListeners();
  };

  moveGesture = (pointerX: number, pointerY: number) => {
    if (!this.activeSession) return;

    if (pointerX > 0 || pointerY > 0) {
      this.activeSession.lastPointerX = pointerX;
      this.activeSession.lastPointerY = pointerY;
    }

    if (!this.activeSession.isActivated) {
      const dist = Math.hypot(
        this.activeSession.lastPointerX - this.activeSession.startX,
        this.activeSession.lastPointerY - this.activeSession.startY,
      );
      if (dist >= 5) {
        this.activeSession.isActivated = true;
        this.dragLock = true;
      } else {
        return;
      }
    }

    const hitLaneId = this.computeHit(
      this.activeSession.lastPointerX,
      this.activeSession.lastPointerY,
    );
    const targetLaneId = hitLaneId ?? this.activeSession.sourceLaneId;
    const targetIndex = this.computeTargetIndex(
      targetLaneId,
      this.activeSession.lastPointerY,
    );
    this.activeSession.currentTargetIndex = targetIndex;
    const autoScrollVelocity = this.computeAutoScrollVelocity(
      this.activeSession.lastPointerX,
    );

    this.feedback = {
      isDragging: true,
      draggingTaskId: this.activeSession.taskId,
      draggingSourceLaneId: this.activeSession.sourceLaneId,
      hoveredLaneId: hitLaneId,
      targetIndex,
      draggedCardWidth: this.activeSession.draggedCardWidth,
      draggedCardHeight: this.activeSession.draggedCardHeight,
      grabOffsetX: this.activeSession.grabOffsetX,
      grabOffsetY: this.activeSession.grabOffsetY,
      pointerX: this.activeSession.lastPointerX,
      pointerY: this.activeSession.lastPointerY,
      autoScrollVelocity,
      dragLock: true,
    };
    this.notifyListeners();
  };

  releaseGesture = async (
    pointerX?: number,
    pointerY?: number,
  ): Promise<void> => {
    const session = this.activeSession;
    if (!session) return;

    if (!session.isActivated) {
      this.activeSession = null;
      this.dragLock = false;
      this.feedback = {
        isDragging: false,
        draggingTaskId: null,
        draggingSourceLaneId: null,
        hoveredLaneId: null,
        targetIndex: undefined,
        pointerX: undefined,
        pointerY: undefined,
        autoScrollVelocity: 0,
        dragLock: false,
      };
      this.notifyListeners();
      return;
    }

    const drop = await this.beginDropAnimation({
      x: pointerX ?? session.lastPointerX,
      y: pointerY ?? session.lastPointerY,
    });

    if (drop) {
      await this.reportDropComplete(drop.operationId);
    }
  };

  beginDropAnimation = async (point?: {
    x?: number;
    y?: number;
  }): Promise<DroppingState | null> => {
    const session = this.activeSession;
    if (!session || !session.isActivated) {
      this.clearPendingTimer();
      this.cancelGesture();
      return null;
    }

    const finalX =
      typeof point?.x === "number" && !isNaN(point.x) && point.x > 0
        ? point.x
        : session.lastPointerX;
    const finalY =
      typeof point?.y === "number" && !isNaN(point.y) && point.y > 0
        ? point.y
        : session.lastPointerY;

    const hitLaneId = this.computeHit(finalX, finalY);
    const targetLaneId = hitLaneId ?? session.sourceLaneId;
    const isValidTarget = Boolean(
      hitLaneId && this.validLaneSet.has(hitLaneId),
    );
    const isDrop = isValidTarget;
    const sourceIndex = Math.max(
      0,
      this.laneCardOrders.get(session.sourceLaneId)?.indexOf(session.taskId) ??
        0,
    );
    const targetIndex = isDrop
      ? this.computeTargetIndex(targetLaneId, finalY)
      : sourceIndex;

    const opId = `op_${++this.operationSeq}_${Date.now()}`;
    this.currentOperationId = opId;

    const containerX = this.containerBounds?.x ?? 0;
    const containerY = this.containerBounds?.y ?? 0;

    const fromX = finalX - containerX - session.grabOffsetX;
    const fromY = finalY - containerY - session.grabOffsetY;

    let toX = fromX;
    let toY = fromY;

    if (isDrop) {
      const targetSlot = this.getDropSlotPosition(targetLaneId, targetIndex);
      if (targetSlot) {
        toX = targetSlot.x;
        const hasMeasuredCards =
          (this.cardLayouts.get(targetLaneId)?.size ?? 0) > 0;
        const laneScroll = this.getLaneScroll(targetLaneId);
        const laneLayout = this.getLaneLayout(targetLaneId);
        const cardsViewport = this.getCardsViewportLayout(targetLaneId);
        const dropSpacerY = this.getDropSpacerY();
        if (
          !hasMeasuredCards &&
          dropSpacerY !== null &&
          hitLaneId === targetLaneId
        ) {
          toY =
            (laneLayout?.y ?? 0) +
            (cardsViewport?.y ?? 0) -
            laneScroll +
            dropSpacerY;
        } else {
          toY = targetSlot.y;
        }
      }
    } else {
      const sourceSlot = this.getDropSlotPosition(
        session.sourceLaneId,
        sourceIndex,
      );
      if (sourceSlot) {
        toX = sourceSlot.x;
        toY = sourceSlot.y;
      }
    }

    const preview = this.getTaskPreview
      ? this.getTaskPreview(session.taskId)
      : null;

    const droppingState: DroppingState = {
      operationId: opId,
      taskId: session.taskId,
      sourceLaneId: session.sourceLaneId,
      task: preview?.task ?? null,
      projectName: preview?.projectDisplayName ?? null,
      targetLaneId,
      targetIndex,
      isDrop,
      draggedCardWidth: session.draggedCardWidth,
      draggedCardHeight: session.draggedCardHeight,
      fromX,
      fromY,
      toX,
      toY,
      releaseX: finalX,
      releaseY: finalY,
    };

    const savedCardWidth = session.draggedCardWidth;
    const savedCardHeight = session.draggedCardHeight;
    this.currentDroppingState = droppingState;
    this.activeSession = null;
    this.dragLock = true;
    this.feedback = {
      isDragging: false,
      draggingTaskId: null,
      draggingSourceLaneId: null,
      hoveredLaneId: null,
      targetIndex: undefined,
      pointerX: undefined,
      pointerY: undefined,
      autoScrollVelocity: 0,
      dragLock: true,
      draggedCardWidth: savedCardWidth,
      draggedCardHeight: savedCardHeight,
    };
    this.notifyListeners();
    this.notifyDropListeners();
    return droppingState;
  };

  reportDropComplete = async (operationId: string): Promise<void> => {
    if (!this.currentOperationId || this.currentOperationId !== operationId) {
      return;
    }

    const drop = this.currentDroppingState;
    this.currentOperationId = null;
    const epoch = this.lifecycleEpoch;

    try {
      if (drop && drop.isDrop && this.validLaneSet.has(drop.targetLaneId)) {
        if (this.onReorderTask) {
          await this.onReorderTask(
            drop.taskId,
            drop.targetLaneId,
            drop.targetIndex,
          );
        }
      }
    } finally {
      if (this.lifecycleEpoch === epoch) {
        this.currentDroppingState = null;
        this.dropSpacerY = null;
        this.notifyDropListeners();
        this.notifyListeners();

        if (this.dragLockTimeout) clearTimeout(this.dragLockTimeout);
        this.dragLockTimeout = setTimeout(() => {
          if (this.lifecycleEpoch !== epoch) return;
          this.dragLock = false;
          this.feedback = {
            ...this.feedback,
            dragLock: false,
          };
          this.notifyListeners();
        }, 60);
      }
    }
  };

  abortDrop = (operationId: string) => {
    if (!this.currentOperationId || this.currentOperationId !== operationId) {
      return;
    }
    const epoch = this.lifecycleEpoch;
    this.currentOperationId = null;
    this.currentDroppingState = null;
    this.dropSpacerY = null;
    this.notifyDropListeners();
    this.notifyListeners();

    if (this.dragLockTimeout) clearTimeout(this.dragLockTimeout);
    this.dragLockTimeout = setTimeout(() => {
      if (this.lifecycleEpoch !== epoch) return;
      this.dragLock = false;
      this.feedback = {
        ...this.feedback,
        dragLock: false,
      };
      this.notifyListeners();
    }, 60);
  };

  cancelGesture = () => {
    this.clearPendingTimer();
    this.pendingOnPress = null;
    if (!this.activeSession) return;
    const epoch = this.lifecycleEpoch;
    const wasActivated = this.activeSession.isActivated;
    this.activeSession = null;
    this.feedback = {
      isDragging: false,
      draggingTaskId: null,
      draggingSourceLaneId: null,
      hoveredLaneId: null,
      targetIndex: undefined,
      pointerX: undefined,
      pointerY: undefined,
      autoScrollVelocity: 0,
      dragLock: wasActivated,
    };
    this.notifyListeners();

    if (wasActivated) {
      if (this.dragLockTimeout) clearTimeout(this.dragLockTimeout);
      this.dragLockTimeout = setTimeout(() => {
        if (this.lifecycleEpoch !== epoch) return;
        this.dragLock = false;
        this.feedback = {
          ...this.feedback,
          dragLock: false,
        };
        this.notifyListeners();
      }, 60);
    }
  };

  teardown = () => {
    this.lifecycleEpoch++;
    this.clearPendingTimer();
    this.pendingOnPress = null;

    if (this.dragLockTimeout) {
      clearTimeout(this.dragLockTimeout);
      this.dragLockTimeout = null;
    }
    this.dragLock = false;

    if (this.currentDroppingState) {
      this.currentDroppingState = null;
      this.dropSpacerY = null;
    }
    this.currentOperationId = null;

    if (this.activeSession) {
      this.activeSession = null;
    }

    this.feedback = {
      isDragging: false,
      draggingTaskId: null,
      draggingSourceLaneId: null,
      hoveredLaneId: null,
      targetIndex: undefined,
      pointerX: undefined,
      pointerY: undefined,
      autoScrollVelocity: 0,
      dragLock: false,
    };

    this.slotState = {
      isDragging: false,
      draggingTaskId: null,
      draggingSourceLaneId: null,
      hoveredLaneId: null,
      targetIndex: 0,
      dragLock: false,
    };
  };

  getContainerBounds = (): Rect | null => {
    return this.containerBounds;
  };

  getLaneLayout = (laneId: string): Rect | undefined => {
    return this.laneLayouts.get(laneId);
  };

  getCardsViewportLayout = (laneId: string): Rect | undefined => {
    return this.cardsViewportLayouts.get(laneId);
  };

  getLaneScroll = (laneId: string): number => {
    return this.laneScrollY.get(laneId) ?? 0;
  };

  private getCollapsedLaneCards(laneId: string): {
    firstCardY: number;
    cards: { id: string; baseY: number; height: number; gap: number }[];
  } {
    const allCardIds = this.laneCardOrders.get(laneId) ?? [];
    const activeTaskId =
      this.activeSession?.taskId ??
      this.feedback.draggingTaskId ??
      this.currentDroppingState?.taskId;
    const isSourceLane =
      (this.activeSession?.sourceLaneId ??
        this.feedback.draggingSourceLaneId ??
        this.currentDroppingState?.sourceLaneId) === laneId &&
      Boolean(activeTaskId && allCardIds.includes(activeTaskId));

    const laneCardsMap = (
      this.activeSession?.cardLayouts ?? this.cardLayouts
    ).get(laneId);

    const firstRect =
      allCardIds.length > 0 ? laneCardsMap?.get(allCardIds[0]) : undefined;
    const firstCardY =
      this.laneFirstCardY.get(laneId) ?? (firstRect ? firstRect.y : 0);

    const cards: { id: string; baseY: number; height: number; gap: number }[] =
      [];
    let defaultGap = this.laneCardGap.get(laneId) ?? 8;

    for (let i = 0; i < allCardIds.length; i++) {
      const id = allCardIds[i];
      const rect = laneCardsMap?.get(id);
      if (!this.laneCardGap.has(laneId) && rect && i < allCardIds.length - 1) {
        const nextRect = laneCardsMap?.get(allCardIds[i + 1]);
        if (nextRect) {
          const measuredGap = nextRect.y - (rect.y + rect.height);
          if (measuredGap >= 0) {
            defaultGap = measuredGap;
          }
        }
      }

      if (isSourceLane && id === activeTaskId) {
        continue;
      }

      const height = rect?.height ?? 64;
      let gap = defaultGap;
      if (!this.laneCardGap.has(laneId) && rect && i < allCardIds.length - 1) {
        const nextRect = laneCardsMap?.get(allCardIds[i + 1]);
        if (nextRect) {
          const measuredGap = nextRect.y - (rect.y + rect.height);
          if (measuredGap >= 0) {
            gap = measuredGap;
          }
        }
      }

      const baseY =
        cards.length === 0
          ? firstCardY
          : cards[cards.length - 1].baseY +
            cards[cards.length - 1].height +
            cards[cards.length - 1].gap;

      cards.push({ id, baseY, height, gap });
    }

    return { firstCardY, cards };
  }

  getDropSlotPosition = (
    laneId: string,
    targetIndex: number,
  ): { x: number; y: number } | null => {
    const laneRect = this.laneLayouts.get(laneId);
    if (!laneRect) return null;

    const cardsViewport = this.cardsViewportLayouts.get(laneId);
    const scrollY = this.laneScrollY.get(laneId) ?? 0;

    const slotX = laneRect.x - this.scrollX + (cardsViewport?.x ?? 12);
    const { firstCardY, cards } = this.getCollapsedLaneCards(laneId);

    const laneOriginY = laneRect.y;
    const cardsOriginY = cardsViewport?.y ?? 0;

    let slotCardY = firstCardY;
    if (cards.length === 0 || targetIndex <= 0) {
      slotCardY = firstCardY;
    } else if (targetIndex < cards.length) {
      slotCardY = cards[targetIndex].baseY;
    } else {
      const lastCard = cards[cards.length - 1];
      slotCardY = lastCard.baseY + lastCard.height + lastCard.gap;
    }

    const slotY = laneOriginY + cardsOriginY - scrollY + slotCardY;
    return { x: slotX, y: slotY };
  };

  getFeedback = (): DragFeedback => {
    return this.feedback;
  };

  getSlotState = (): DragSlotState => {
    return this.slotState;
  };

  isTaskDragging = (taskId: string): boolean => {
    if (
      this.currentDroppingState &&
      this.currentDroppingState.taskId === taskId
    ) {
      return true;
    }
    return this.feedback.isDragging && this.feedback.draggingTaskId === taskId;
  };

  isLaneHovered = (laneId: string): boolean => {
    if (this.currentDroppingState) {
      if (
        this.completionLaneSet.has(laneId) &&
        !this.currentDroppingState.isDrop
      )
        return false;
      return this.currentDroppingState.targetLaneId === laneId;
    }
    return this.feedback.hoveredLaneId === laneId && this.feedback.isDragging;
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  subscribeSlot = (listener: () => void): (() => void) => {
    this.slotListeners.add(listener);
    return () => {
      this.slotListeners.delete(listener);
    };
  };

  subscribeDrop = (listener: () => void): (() => void) => {
    this.dropListeners.add(listener);
    return () => {
      this.dropListeners.delete(listener);
    };
  };

  getDroppingState = (): DroppingState | null => {
    return this.currentDroppingState;
  };

  private notifyDropListeners() {
    for (const listener of this.dropListeners) {
      listener();
    }
  }

  private checkAndNotifySlotState() {
    const isDropping = this.currentDroppingState !== null;
    const nextSlotState: DragSlotState = {
      isDragging: this.feedback.isDragging || isDropping,
      draggingTaskId:
        this.feedback.draggingTaskId ??
        (isDropping ? (this.currentDroppingState?.taskId ?? null) : null),
      draggingSourceLaneId:
        this.feedback.draggingSourceLaneId ??
        (isDropping ? (this.currentDroppingState?.sourceLaneId ?? null) : null),
      hoveredLaneId:
        this.feedback.hoveredLaneId ??
        (isDropping ? (this.currentDroppingState?.targetLaneId ?? null) : null),
      targetIndex:
        this.feedback.targetIndex ??
        (isDropping ? (this.currentDroppingState?.targetIndex ?? 0) : 0),
      draggedCardWidth:
        this.feedback.draggedCardWidth ??
        (isDropping ? this.currentDroppingState?.draggedCardWidth : undefined),
      draggedCardHeight:
        this.feedback.draggedCardHeight ??
        (isDropping ? this.currentDroppingState?.draggedCardHeight : undefined),
      dragLock: this.feedback.dragLock,
    };

    if (
      this.slotState.hoveredLaneId !== nextSlotState.hoveredLaneId ||
      this.slotState.targetIndex !== nextSlotState.targetIndex
    ) {
      this.dropSpacerY = null;
    }

    const slotChanged =
      this.slotState.isDragging !== nextSlotState.isDragging ||
      this.slotState.draggingTaskId !== nextSlotState.draggingTaskId ||
      this.slotState.draggingSourceLaneId !==
        nextSlotState.draggingSourceLaneId ||
      this.slotState.hoveredLaneId !== nextSlotState.hoveredLaneId ||
      this.slotState.targetIndex !== nextSlotState.targetIndex ||
      this.slotState.draggedCardWidth !== nextSlotState.draggedCardWidth ||
      this.slotState.draggedCardHeight !== nextSlotState.draggedCardHeight ||
      this.slotState.dragLock !== nextSlotState.dragLock;

    if (slotChanged) {
      this.slotState = nextSlotState;
      for (const listener of this.slotListeners) {
        listener();
      }
    }
  }

  private notifyListeners() {
    this.checkAndNotifySlotState();
    for (const listener of this.listeners) {
      listener();
    }
  }

  private computeInitialCardGeometry(
    sourceLaneId: string,
    taskId: string,
    pointerX: number,
    pointerY: number,
    layouts: Map<string, Map<string, Rect>>,
  ): {
    draggedCardWidth?: number;
    draggedCardHeight?: number;
    grabOffsetX: number;
    grabOffsetY: number;
  } {
    const cardRect = layouts.get(sourceLaneId)?.get(taskId);
    const draggedCardWidth = cardRect?.width;
    const draggedCardHeight = cardRect?.height;
    let grabOffsetX = (draggedCardWidth ?? 280) / 2;
    let grabOffsetY = 20;

    const laneRect = this.laneLayouts.get(sourceLaneId);
    if (cardRect && laneRect) {
      const containerX = this.containerBounds?.x ?? 0;
      const containerY = this.containerBounds?.y ?? 0;
      const cardsViewport = this.cardsViewportLayouts.get(sourceLaneId);
      const scrollY = this.laneScrollY.get(sourceLaneId) ?? 0;
      const cardY =
        this.resolveCardOffsetY(
          sourceLaneId,
          taskId,
          layouts.get(sourceLaneId),
        ) ?? cardRect.y;
      const cardWinX =
        containerX +
        laneRect.x -
        this.scrollX +
        (cardsViewport?.x ?? (cardRect.x || 12));
      const cardWinY =
        containerY + laneRect.y + (cardsViewport?.y ?? 0) - scrollY + cardY;

      if (
        pointerX >= cardWinX &&
        pointerX <= cardWinX + cardRect.width &&
        pointerY >= cardWinY &&
        pointerY <= cardWinY + cardRect.height
      ) {
        grabOffsetX = pointerX - cardWinX;
        grabOffsetY = pointerY - cardWinY;
      }
    }

    return {
      draggedCardWidth,
      draggedCardHeight,
      grabOffsetX,
      grabOffsetY,
    };
  }

  private computeAutoScrollVelocity(pointerX: number): number {
    if (!this.containerBounds) return 0;
    const relX = pointerX - this.containerBounds.x;
    if (relX < 48) {
      return Math.max(-1, Math.min(0, (relX - 48) / 48));
    }
    if (relX > this.containerBounds.width - 48) {
      return Math.min(
        1,
        Math.max(0, (relX - (this.containerBounds.width - 48)) / 48),
      );
    }
    return 0;
  }

  private computeTargetIndex(laneId: string, pointerY: number): number {
    if (this.completionLaneSet.has(laneId)) return 0;
    const { cards } = this.getCollapsedLaneCards(laneId);
    const remainingCount = cards.length;
    if (remainingCount === 0) return 0;

    const laneRect = this.laneLayouts.get(laneId);
    const containerOriginY = this.containerBounds?.y ?? 0;
    const laneOriginY = laneRect?.y ?? 0;
    const cardsOriginY = this.cardsViewportLayouts.get(laneId)?.y ?? 0;
    const scrollY = this.laneScrollY.get(laneId) ?? 0;
    const originY = containerOriginY + laneOriginY + cardsOriginY - scrollY;

    const prevIndex =
      this.feedback.hoveredLaneId === laneId
        ? (this.activeSession?.currentTargetIndex ?? -1)
        : -1;

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const thresholdY = originY + card.baseY + card.height + card.gap / 2;

      const lowerBuffer = thresholdY - 8;
      const upperBuffer = thresholdY + 8;

      if (pointerY < lowerBuffer) {
        return i;
      }
      if (pointerY <= upperBuffer) {
        if (prevIndex === i) {
          return i;
        }
        if (prevIndex === i + 1) {
          return i + 1;
        }
        return pointerY >= thresholdY ? i + 1 : i;
      }
    }

    return remainingCount;
  }

  private computeHit(pointerX: number, pointerY: number): string | null {
    const laneItems: LaneLayoutItem[] = [];
    for (const laneId of this.lanesList) {
      const rect = this.laneLayouts.get(laneId);
      if (rect) {
        laneItems.push({ id: laneId, rect });
      }
    }

    const hitId = findHoveredLaneId({
      pointerX,
      pointerY,
      containerBounds: this.containerBounds,
      scrollX: this.scrollX,
      lanes: laneItems,
    });

    if (hitId && this.validLaneSet.has(hitId)) {
      if (
        this.completionLaneSet.has(hitId) &&
        this.activeSession?.sourceLaneId === hitId
      )
        return null;
      return hitId;
    }
    return null;
  }

  private recomputeHover(pointerX: number, pointerY: number) {
    if (!this.activeSession?.isActivated) return;
    const hitLaneId = this.computeHit(pointerX, pointerY);
    const targetIndex = hitLaneId
      ? this.computeTargetIndex(hitLaneId, pointerY)
      : undefined;
    this.activeSession.currentTargetIndex = targetIndex;
    if (
      this.feedback.hoveredLaneId !== hitLaneId ||
      this.feedback.targetIndex !== targetIndex
    ) {
      this.feedback = {
        ...this.feedback,
        hoveredLaneId: hitLaneId,
        targetIndex,
      };
      this.notifyListeners();
    }
  }
}

export interface DroppingState {
  readonly operationId: string;
  readonly taskId: string;
  readonly sourceLaneId: string;
  readonly task: KanbanTask | null;
  readonly projectName: string | null;
  readonly targetLaneId: string;
  readonly targetIndex: number;
  readonly isDrop: boolean;
  readonly draggedCardWidth?: number;
  readonly draggedCardHeight?: number;
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  readonly releaseX?: number;
  readonly releaseY?: number;
}

export interface UseKanbanDragReturn {
  controller: KanbanDragController;
  slotState: DragSlotState;
  feedback: DragFeedback;
  isDropping: boolean;
  droppingTaskId: string | null;
  droppingState: DroppingState | null;
  commitDrop: () => Promise<void>;
  abortDrop: () => void;
  getTaskPreview?: (taskId: string) => TaskPreviewItem | null;
  setGetTaskPreview?: (fn?: (taskId: string) => TaskPreviewItem | null) => void;
  bindLane: (laneId: string) => LaneDragBinding;
  bindContainerRef: (instance: ContainerRefTarget | null) => void;
  handleContainerLayout: (layout: Rect) => void;
  handleContainerScroll: (scrollX: number) => void;
  getContainerBounds: () => Rect | null;
  startGesture: KanbanDragController["startGesture"];
  moveGesture: KanbanDragController["moveGesture"];
  releaseGesture: (releaseX?: number, releaseY?: number) => Promise<void>;
  cancelGesture: () => void;
  registerContainerBounds: KanbanDragController["registerContainerBounds"];
  handleScroll: KanbanDragController["handleScroll"];
  registerLaneLayout: KanbanDragController["registerLaneLayout"];
  registerCardsViewportLayout: KanbanDragController["registerCardsViewportLayout"];
  handleLaneScroll: KanbanDragController["handleLaneScroll"];
  registerCardLayout: KanbanDragController["registerCardLayout"];
  unregisterCardLayout: KanbanDragController["unregisterCardLayout"];
  setLaneCardOrder: KanbanDragController["setLaneCardOrder"];
  isTaskDragging: (taskId: string) => boolean;
  isLaneHovered: (laneId: string) => boolean;
  isDragLocked: () => boolean;
  getLaneLayout: KanbanDragController["getLaneLayout"];
  getCardsViewportLayout: KanbanDragController["getCardsViewportLayout"];
  getLaneScroll: KanbanDragController["getLaneScroll"];
  getDropSlotPosition: KanbanDragController["getDropSlotPosition"];
  teardown: () => void;
}

export function useKanbanDrag(
  options: KanbanDragOptions = {},
): UseKanbanDragReturn {
  const { lanes = [], onReorderTask, getTaskPreview } = options;
  const controllerRef = useRef<KanbanDragController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new KanbanDragController({
      lanes,
      onReorderTask,
    });
  }
  const controller = controllerRef.current;

  useLayoutEffect(() => {
    controller.setLanes(lanes);
  }, [controller, lanes]);
  if (onReorderTask) {
    controller.setOnReorderTask(onReorderTask);
  }
  if (getTaskPreview) {
    controller.setGetTaskPreview(getTaskPreview);
  }

  const slotState = useSyncExternalStore(
    controller.subscribeSlot,
    controller.getSlotState,
    controller.getSlotState,
  );

  // Keep subscription lifecycle bound to the controller while avoiding board
  // re-renders on high-frequency pointer coordinate updates.
  useSyncExternalStore(
    controller.subscribe,
    controller.getSlotState,
    controller.getSlotState,
  );

  const droppingState = useSyncExternalStore(
    controller.subscribeDrop,
    controller.getDroppingState,
    controller.getDroppingState,
  );

  const containerScrollRef = useRef<ContainerRefTarget | null>(null);
  const currentScrollX = useRef(0);

  useEffect(() => {
    return () => {
      controller.teardown();
    };
  }, [controller]);

  // Smooth edge auto-scroll when dragging near viewport boundaries
  useEffect(() => {
    if (!slotState.isDragging) return;

    const timer = setInterval(() => {
      const liveFeedback = controller.getFeedback();
      const curVelocity = liveFeedback.autoScrollVelocity ?? 0;
      if (
        !curVelocity ||
        !liveFeedback.isDragging ||
        !containerScrollRef.current?.scrollTo
      ) {
        return;
      }
      const nextOffset = Math.max(0, currentScrollX.current + curVelocity * 14);
      if (nextOffset === currentScrollX.current) return;
      currentScrollX.current = nextOffset;
      containerScrollRef.current.scrollTo({
        x: nextOffset,
        animated: false,
      });
      controller.handleScroll(nextOffset);
    }, 16);

    return () => clearInterval(timer);
  }, [slotState.isDragging, controller]);

  const handleContainerLayout = (layout: Rect) => {
    controller.handleContainerLayout(layout);
  };

  const handleContainerScroll = (scrollX: number) => {
    currentScrollX.current = scrollX;
    controller.handleScroll(scrollX);
  };

  const bindContainerRef = (instance: ContainerRefTarget | null) => {
    containerScrollRef.current = instance;
    controller.bindContainerRef(instance);
  };

  const commitDrop = async () => {
    const drop = controller.getDroppingState();
    if (drop) {
      await controller.reportDropComplete(drop.operationId);
    }
  };

  const abortDrop = () => {
    const drop = controller.getDroppingState();
    if (drop) {
      controller.abortDrop(drop.operationId);
    }
  };

  const handleDragRelease = async (
    releaseX?: number,
    releaseY?: number,
  ): Promise<void> => {
    await controller.beginDropAnimation({ x: releaseX, y: releaseY });
  };

  const handleDragCancel = () => {
    const drop = controller.getDroppingState();
    if (drop) {
      controller.abortDrop(drop.operationId);
    } else {
      controller.cancelGesture();
    }
  };

  controller.setReleaseHandler(handleDragRelease);
  controller.setCancelHandler(handleDragCancel);

  const isTaskDragging = (taskId: string): boolean => {
    if (droppingState?.taskId === taskId) return true;
    return controller.isTaskDragging(taskId);
  };

  const isLaneHovered = (laneId: string): boolean => {
    return controller.isLaneHovered(laneId);
  };

  const isDragLocked = (): boolean => {
    return controller.isDragLocked() || droppingState !== null;
  };

  const bindLane = (laneId: string): LaneDragBinding => {
    const isHovered = isLaneHovered(laneId);
    const targetIndex = droppingState
      ? droppingState.targetLaneId === laneId
        ? droppingState.targetIndex
        : -1
      : isHovered
        ? slotState.targetIndex
        : -1;

    return {
      isHovered,
      targetIndex,
      isTaskDragging,
      draggedCardWidth: slotState.draggedCardWidth,
      draggedCardHeight: slotState.draggedCardHeight,
      isDragLocked,
      bindCard: (
        taskId: string,
        onSelectTask?: () => void,
        factory?: PanResponderFactory,
      ) => controller.bindCard(laneId, taskId, onSelectTask, factory),
      registerLaneLayout: (layout: Rect) =>
        controller.registerLaneLayout(laneId, layout),
      registerCardsViewport: (layout: Rect) =>
        controller.registerCardsViewportLayout(laneId, layout),
      handleLaneScroll: (scrollY: number) =>
        controller.handleLaneScroll(laneId, scrollY),
      registerCardLayout: (taskId: string, layout: Rect) =>
        controller.registerCardLayout(laneId, taskId, layout),
      unregisterCardLayout: (taskId: string) =>
        controller.unregisterCardLayout(laneId, taskId),
      setDropSpacerY: (y: number | null) => controller.setDropSpacerY(y),
      setLaneCardOrder: (
        laneIdOrTaskIds: string | string[],
        taskIds?: string[],
      ) => {
        if (Array.isArray(laneIdOrTaskIds)) {
          controller.setLaneCardOrder(laneId, laneIdOrTaskIds);
        } else if (taskIds) {
          controller.setLaneCardOrder(laneIdOrTaskIds, taskIds);
        }
      },
      startGesture: controller.startGesture,
      moveGesture: controller.moveGesture,
      releaseGesture: handleDragRelease,
      cancelGesture: handleDragCancel,
    };
  };

  return {
    controller,
    slotState,
    get feedback() {
      return controller.getFeedback();
    },
    isDropping: droppingState !== null,
    droppingTaskId: droppingState?.taskId ?? null,
    droppingState,
    commitDrop,
    abortDrop,
    getTaskPreview,
    setGetTaskPreview: controller.setGetTaskPreview,
    bindLane,
    bindContainerRef,
    handleContainerLayout,
    handleContainerScroll,
    getContainerBounds: controller.getContainerBounds,
    startGesture: controller.startGesture,
    moveGesture: controller.moveGesture,
    releaseGesture: handleDragRelease,
    cancelGesture: handleDragCancel,
    registerContainerBounds: controller.registerContainerBounds,
    handleScroll: controller.handleScroll,
    registerLaneLayout: controller.registerLaneLayout,
    registerCardsViewportLayout: controller.registerCardsViewportLayout,
    handleLaneScroll: controller.handleLaneScroll,
    registerCardLayout: controller.registerCardLayout,
    unregisterCardLayout: controller.unregisterCardLayout,
    setLaneCardOrder: controller.setLaneCardOrder,
    isTaskDragging,
    isLaneHovered,
    isDragLocked,
    getLaneLayout: controller.getLaneLayout,
    getCardsViewportLayout: controller.getCardsViewportLayout,
    getLaneScroll: controller.getLaneScroll,
    getDropSlotPosition: controller.getDropSlotPosition,
    teardown: controller.teardown,
  };
}
