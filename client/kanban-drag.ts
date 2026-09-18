import { useRef, useSyncExternalStore } from "react";

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

export interface DragFeedback {
  readonly isDragging: boolean;
  readonly draggingTaskId: string | null;
  readonly draggingSourceLaneId: string | null;
  readonly hoveredLaneId: string | null;
  readonly targetIndex?: number;
  readonly draggedCardHeight?: number;
  readonly pointerX?: number;
  readonly pointerY?: number;
  readonly autoScrollVelocity?: number;
  readonly dragLock: boolean;
}

export interface KanbanDragOptions {
  lanes?: ({ id: string } | string)[];
  onMoveTask?: (taskId: string, targetLaneId: string) => void | Promise<void>;
  onReorderTask?: (taskId: string, targetLaneId: string, targetIndex: number) => void | Promise<void>;
}

export interface ContainerRefTarget {
  measureInWindow?: (
    callback: (x: number, y: number, width: number, height: number) => void
  ) => void;
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
  cardLayouts: Map<string, Map<string, Rect>>;
}

export class KanbanDragController {
  private lanesList: string[] = [];
  private validLaneSet: Set<string> = new Set();
  private laneLayouts: Map<string, Rect> = new Map();
  private laneCardOrders: Map<string, string[]> = new Map();
  private cardLayouts: Map<string, Map<string, Rect>> = new Map();
  private cardsViewportLayouts: Map<string, Rect> = new Map();
  private laneScrollY: Map<string, number> = new Map();
  private containerBounds: Rect | null = null;
  private containerRef: ContainerRefTarget | null = null;
  private scrollX: number = 0;
  private activeSession: ActiveDragSession | null = null;
  private onMoveTask?: (taskId: string, targetLaneId: string) => void | Promise<void>;
  private onReorderTask?: (taskId: string, targetLaneId: string, targetIndex: number) => void | Promise<void>;
  private dragLock: boolean = false;
  private dragLockTimeout: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<() => void> = new Set();

  private feedback: DragFeedback = {
    isDragging: false,
    draggingTaskId: null,
    draggingSourceLaneId: null,
    hoveredLaneId: null,
    dragLock: false,
  };

  constructor(options?: KanbanDragOptions) {
    if (options?.lanes) {
      this.setLanes(options.lanes);
    }
    if (options?.onMoveTask) {
      this.setOnMoveTask(options.onMoveTask);
    }
    if (options?.onReorderTask) {
      this.setOnReorderTask(options.onReorderTask);
    }
  }

  setLanes = (lanes: ({ id: string } | string)[]) => {
    this.lanesList = lanes.map((l) => (typeof l === "string" ? l : l.id));
    this.validLaneSet = new Set(this.lanesList);
    if (this.activeSession && this.activeSession.isActivated) {
      this.recomputeHover(this.activeSession.lastPointerX, this.activeSession.lastPointerY);
    }
  };

  setOnMoveTask = (fn: (taskId: string, targetLaneId: string) => void | Promise<void>) => {
    this.onMoveTask = fn;
  };

  setOnReorderTask = (fn: (taskId: string, targetLaneId: string, targetIndex: number) => void | Promise<void>) => {
    this.onReorderTask = fn;
  };

  setLaneCardOrder = (laneId: string, taskIds: string[]) => {
    this.laneCardOrders.set(laneId, taskIds);
  };

  registerCardLayout = (laneId: string, taskId: string, rect: Rect) => {
    let laneMap = this.cardLayouts.get(laneId);
    if (!laneMap) {
      laneMap = new Map();
      this.cardLayouts.set(laneId, laneMap);
    }
    laneMap.set(taskId, rect);
  };

  unregisterCardLayout = (laneId: string, taskId: string) => {
    const laneMap = this.cardLayouts.get(laneId);
    if (laneMap) {
      laneMap.delete(taskId);
    }
  };

  isDragLocked = (): boolean => {
    return this.dragLock;
  };

  registerContainerBounds = (bounds: Rect | null) => {
    this.containerBounds = bounds;
    if (this.activeSession) {
      this.recomputeHover(this.activeSession.lastPointerX, this.activeSession.lastPointerY);
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
            this.recomputeHover(this.activeSession.lastPointerX, this.activeSession.lastPointerY);
          }
        }
      });
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
      this.recomputeHover(this.activeSession.lastPointerX, this.activeSession.lastPointerY);
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
      this.recomputeHover(this.activeSession.lastPointerX, this.activeSession.lastPointerY);
    }
  };

  startGesture = (
    taskId: string,
    sourceLaneId: string,
    pointerX: number,
    pointerY: number,
    immediate: boolean = true
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

    this.activeSession = {
      taskId,
      sourceLaneId,
      startX: pointerX,
      startY: pointerY,
      lastPointerX: pointerX,
      lastPointerY: pointerY,
      isActivated,
      currentTargetIndex: undefined,
      // Freeze pre-animation geometry so the slot cannot move its own hit threshold.
      // ponytail: fixed for one gesture; cancel/re-measure if live resizing must be supported.
      cardLayouts: new Map([...this.cardLayouts].map(([id, cards]) => [id, new Map(cards)])),
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
        hoveredLaneId: targetLaneId,
        targetIndex,
        draggedCardHeight: this.activeSession.cardLayouts.get(sourceLaneId)?.get(taskId)?.height,
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
        this.activeSession.lastPointerY - this.activeSession.startY
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
      this.activeSession.lastPointerY
    );
    const targetLaneId = hitLaneId ?? this.activeSession.sourceLaneId;
    const targetIndex = this.computeTargetIndex(targetLaneId, this.activeSession.lastPointerY);
    this.activeSession.currentTargetIndex = targetIndex;
    const autoScrollVelocity = this.computeAutoScrollVelocity(this.activeSession.lastPointerX);

    this.feedback = {
      isDragging: true,
      draggingTaskId: this.activeSession.taskId,
      draggingSourceLaneId: this.activeSession.sourceLaneId,
      hoveredLaneId: hitLaneId,
      targetIndex,
      draggedCardHeight: this.activeSession.cardLayouts.get(this.activeSession.sourceLaneId)?.get(this.activeSession.taskId)?.height,
      pointerX: this.activeSession.lastPointerX,
      pointerY: this.activeSession.lastPointerY,
      autoScrollVelocity,
      dragLock: true,
    };
    this.notifyListeners();
  };

  releaseGesture = async (pointerX?: number, pointerY?: number): Promise<void> => {
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

    const finalX =
      typeof pointerX === "number" && !isNaN(pointerX) && pointerX > 0
        ? pointerX
        : session.lastPointerX;
    const finalY =
      typeof pointerY === "number" && !isNaN(pointerY) && pointerY > 0
        ? pointerY
        : session.lastPointerY;

    const finalTargetLaneId = this.computeHit(finalX, finalY);
    const targetIndex = finalTargetLaneId
      ? this.computeTargetIndex(finalTargetLaneId, finalY)
      : undefined;

    // Keep the dragged task excluded, and retain hysteresis until the final hit test.
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
    };
    this.notifyListeners();

    if (finalTargetLaneId && this.validLaneSet.has(finalTargetLaneId)) {
      if (this.onReorderTask && targetIndex !== undefined) {
        await this.onReorderTask(session.taskId, finalTargetLaneId, targetIndex);
      } else if (this.onMoveTask && finalTargetLaneId !== session.sourceLaneId) {
        await this.onMoveTask(session.taskId, finalTargetLaneId);
      }
    }

    if (this.dragLockTimeout) clearTimeout(this.dragLockTimeout);
    this.dragLockTimeout = setTimeout(() => {
      this.dragLock = false;
      this.feedback = {
        ...this.feedback,
        dragLock: false,
      };
      this.notifyListeners();
    }, 150);
  };

  cancelGesture = () => {
    if (!this.activeSession) return;
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
        this.dragLock = false;
        this.feedback = {
          ...this.feedback,
          dragLock: false,
        };
        this.notifyListeners();
      }, 150);
    }
  };

  getContainerBounds = (): Rect | null => {
    return this.containerBounds;
  };

  getFeedback = (): DragFeedback => {
    return this.feedback;
  };

  isTaskDragging = (taskId: string): boolean => {
    return this.feedback.isDragging && this.feedback.draggingTaskId === taskId;
  };

  isLaneHovered = (laneId: string): boolean => {
    return this.feedback.hoveredLaneId === laneId && this.feedback.isDragging;
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notifyListeners() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private computeAutoScrollVelocity(pointerX: number): number {
    if (!this.containerBounds) return 0;
    const relX = pointerX - this.containerBounds.x;
    if (relX < 48) {
      return Math.max(-1, Math.min(0, (relX - 48) / 48));
    }
    if (relX > this.containerBounds.width - 48) {
      return Math.min(1, Math.max(0, (relX - (this.containerBounds.width - 48)) / 48));
    }
    return 0;
  }

  private computeTargetIndex(laneId: string, pointerY: number): number {
    const allCardIds = this.laneCardOrders.get(laneId) ?? [];
    const activeTaskId = this.activeSession?.taskId;
    const cardIds = allCardIds.filter((id) => id !== activeTaskId);
    if (cardIds.length === 0) return 0;

    const laneRect = this.laneLayouts.get(laneId);
    const containerOriginY = this.containerBounds?.y ?? 0;
    const laneOriginY = laneRect?.y ?? 0;
    const cardsOriginY = this.cardsViewportLayouts.get(laneId)?.y ?? 0;
    const scrollY = this.laneScrollY.get(laneId) ?? 0;
    const laneCardsMap = (this.activeSession?.cardLayouts ?? this.cardLayouts).get(laneId);

    const prevIndex = this.feedback.hoveredLaneId === laneId
      ? this.activeSession?.currentTargetIndex ?? -1
      : -1;

    for (let i = 0; i < cardIds.length; i++) {
      const cardId = cardIds[i];
      const cardRect = laneCardsMap?.get(cardId);
      if (!cardRect) continue;

      const midWindowY = containerOriginY + laneOriginY + cardsOriginY - scrollY + cardRect.y + cardRect.height / 2;
      const lowerBuffer = midWindowY - 12;
      const upperBuffer = midWindowY + 12;

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
        return pointerY >= midWindowY ? i + 1 : i;
      }
    }

    return cardIds.length;
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
      return hitId;
    }
    return null;
  }

  private recomputeHover(pointerX: number, pointerY: number) {
    if (!this.activeSession?.isActivated) return;
    const hitLaneId = this.computeHit(pointerX, pointerY);
    const targetIndex = hitLaneId ? this.computeTargetIndex(hitLaneId, pointerY) : undefined;
    this.activeSession.currentTargetIndex = targetIndex;
    if (this.feedback.hoveredLaneId !== hitLaneId || this.feedback.targetIndex !== targetIndex) {
      this.feedback = {
        ...this.feedback,
        hoveredLaneId: hitLaneId,
        targetIndex,
      };
      this.notifyListeners();
    }
  }
}

export function useKanbanDrag(options: KanbanDragOptions) {
  const { lanes = [], onMoveTask, onReorderTask } = options;
  const controllerRef = useRef<KanbanDragController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new KanbanDragController({
      lanes,
      onMoveTask,
      onReorderTask,
    });
  }
  const controller = controllerRef.current;

  controller.setLanes(lanes);
  if (onMoveTask) {
    controller.setOnMoveTask(onMoveTask);
  }
  if (onReorderTask) {
    controller.setOnReorderTask(onReorderTask);
  }

  const feedback = useSyncExternalStore(
    controller.subscribe,
    controller.getFeedback,
    controller.getFeedback
  );

  return {
    controller,
    feedback,
    getContainerBounds: controller.getContainerBounds,
    startGesture: controller.startGesture,
    moveGesture: controller.moveGesture,
    releaseGesture: controller.releaseGesture,
    cancelGesture: controller.cancelGesture,
    registerContainerBounds: controller.registerContainerBounds,
    bindContainerRef: controller.bindContainerRef,
    handleContainerLayout: controller.handleContainerLayout,
    handleScroll: controller.handleScroll,
    registerLaneLayout: controller.registerLaneLayout,
    registerCardsViewportLayout: controller.registerCardsViewportLayout,
    handleLaneScroll: controller.handleLaneScroll,
    registerCardLayout: controller.registerCardLayout,
    unregisterCardLayout: controller.unregisterCardLayout,
    setLaneCardOrder: controller.setLaneCardOrder,
    isTaskDragging: controller.isTaskDragging,
    isLaneHovered: controller.isLaneHovered,
    isDragLocked: controller.isDragLocked,
  };
}
