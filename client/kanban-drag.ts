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
}

export interface KanbanDragOptions {
  lanes?: ({ id: string } | string)[];
  onMoveTask?: (taskId: string, targetLaneId: string) => void | Promise<void>;
}

export interface ContainerRefTarget {
  measureInWindow?: (
    callback: (x: number, y: number, width: number, height: number) => void
  ) => void;
}

interface ActiveDragSession {
  taskId: string;
  sourceLaneId: string;
  lastPointerX: number;
  lastPointerY: number;
}

export class KanbanDragController {
  private lanesList: string[] = [];
  private validLaneSet: Set<string> = new Set();
  private laneLayouts: Map<string, Rect> = new Map();
  private containerBounds: Rect | null = null;
  private containerRef: ContainerRefTarget | null = null;
  private scrollX: number = 0;
  private activeSession: ActiveDragSession | null = null;
  private onMoveTask?: (taskId: string, targetLaneId: string) => void | Promise<void>;
  private listeners: Set<() => void> = new Set();

  private feedback: DragFeedback = {
    isDragging: false,
    draggingTaskId: null,
    draggingSourceLaneId: null,
    hoveredLaneId: null,
  };

  constructor(options?: KanbanDragOptions) {
    if (options?.lanes) {
      this.setLanes(options.lanes);
    }
    if (options?.onMoveTask) {
      this.setOnMoveTask(options.onMoveTask);
    }
  }

  setLanes = (lanes: ({ id: string } | string)[]) => {
    this.lanesList = lanes.map((l) => (typeof l === "string" ? l : l.id));
    this.validLaneSet = new Set(this.lanesList);
    if (this.activeSession) {
      this.recomputeHover(this.activeSession.lastPointerX, this.activeSession.lastPointerY);
    }
  };

  setOnMoveTask = (fn: (taskId: string, targetLaneId: string) => void | Promise<void>) => {
    this.onMoveTask = fn;
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

  startGesture = (taskId: string, sourceLaneId: string, pointerX: number, pointerY: number) => {
    this.measureContainer();
    this.activeSession = {
      taskId,
      sourceLaneId,
      lastPointerX: pointerX,
      lastPointerY: pointerY,
    };
    const initialHit = this.computeHit(pointerX, pointerY);
    this.feedback = {
      isDragging: true,
      draggingTaskId: taskId,
      draggingSourceLaneId: sourceLaneId,
      hoveredLaneId: initialHit ?? sourceLaneId,
    };
    this.notifyListeners();
  };

  moveGesture = (pointerX: number, pointerY: number) => {
    if (!this.activeSession) return;
    if (pointerX > 0 || pointerY > 0) {
      this.activeSession.lastPointerX = pointerX;
      this.activeSession.lastPointerY = pointerY;
    }
    this.recomputeHover(pointerX, pointerY);
  };

  releaseGesture = async (pointerX?: number, pointerY?: number): Promise<void> => {
    const session = this.activeSession;
    if (!session) return;

    this.activeSession = null;
    this.feedback = {
      isDragging: false,
      draggingTaskId: null,
      draggingSourceLaneId: null,
      hoveredLaneId: null,
    };
    this.notifyListeners();

    const finalX =
      typeof pointerX === "number" && !isNaN(pointerX) && pointerX > 0
        ? pointerX
        : session.lastPointerX;
    const finalY =
      typeof pointerY === "number" && !isNaN(pointerY) && pointerY > 0
        ? pointerY
        : session.lastPointerY;

    const finalTargetLaneId = this.computeHit(finalX, finalY);

    if (
      finalTargetLaneId &&
      this.validLaneSet.has(finalTargetLaneId) &&
      finalTargetLaneId !== session.sourceLaneId
    ) {
      if (this.onMoveTask) {
        await this.onMoveTask(session.taskId, finalTargetLaneId);
      }
    }
  };

  cancelGesture = () => {
    if (!this.activeSession) return;
    this.activeSession = null;
    this.feedback = {
      isDragging: false,
      draggingTaskId: null,
      draggingSourceLaneId: null,
      hoveredLaneId: null,
    };
    this.notifyListeners();
  };

  getFeedback = (): DragFeedback => {
    return this.feedback;
  };

  isTaskDragging = (taskId: string): boolean => {
    return this.feedback.draggingTaskId === taskId;
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
    if (!this.activeSession) return;
    const hitLaneId = this.computeHit(pointerX, pointerY);
    if (this.feedback.hoveredLaneId !== hitLaneId) {
      this.feedback = {
        ...this.feedback,
        hoveredLaneId: hitLaneId,
      };
      this.notifyListeners();
    }
  }
}

export function useKanbanDrag(options: KanbanDragOptions) {
  const { lanes = [], onMoveTask } = options;
  const controllerRef = useRef<KanbanDragController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new KanbanDragController({
      lanes,
      onMoveTask,
    });
  }
  const controller = controllerRef.current;

  controller.setLanes(lanes);
  if (onMoveTask) {
    controller.setOnMoveTask(onMoveTask);
  }

  const feedback = useSyncExternalStore(
    controller.subscribe,
    controller.getFeedback,
    controller.getFeedback
  );

  return {
    controller,
    feedback,
    startGesture: controller.startGesture,
    moveGesture: controller.moveGesture,
    releaseGesture: controller.releaseGesture,
    cancelGesture: controller.cancelGesture,
    registerContainerBounds: controller.registerContainerBounds,
    bindContainerRef: controller.bindContainerRef,
    handleContainerLayout: controller.handleContainerLayout,
    handleScroll: controller.handleScroll,
    registerLaneLayout: controller.registerLaneLayout,
    isTaskDragging: controller.isTaskDragging,
    isLaneHovered: controller.isLaneHovered,
  };
}
