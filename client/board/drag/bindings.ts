import {
  useRef,
  useSyncExternalStore,
  useEffect,
  useLayoutEffect,
} from "react";
import { Animated, type ViewStyle } from "react-native";
import {
  KanbanDragController,
  type ContainerRefTarget,
  type KanbanDragOptions,
  type LaneDragBinding,
  type PanResponderFactory,
  type Rect,
} from "./controller";

// Views consume visual state through useKanbanDragOverlay, never the controller
// or the drop protocol. Only this module can unwrap the overlay binding.
const overlayController = Symbol("kanban-drag-overlay");

export interface OverlayDragBinding {
  readonly [overlayController]: KanbanDragController;
}

export interface ContainerDragBinding {
  readonly bindRef: (instance: ContainerRefTarget | null) => void;
  readonly onLayout: (layout: Rect) => void;
  readonly onScroll: (scrollX: number) => void;
}

export interface UseKanbanDragReturn {
  readonly container: ContainerDragBinding;
  readonly overlay: OverlayDragBinding;
  readonly bindLane: (laneId: string) => LaneDragBinding;
  readonly isDragLocked: () => boolean;
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
      setDropSpacerY: (y: number | null) => controller.setDropSpacerY(y),
      setLaneCardOrder: (taskIds: string[]) =>
        controller.setLaneCardOrder(laneId, taskIds),
    };
  };

  return {
    container: {
      bindRef: bindContainerRef,
      onLayout: handleContainerLayout,
      onScroll: handleContainerScroll,
    },
    overlay: { [overlayController]: controller },
    bindLane,
    isDragLocked,
  };
}

/** High-frequency feedback and animation/commit coordination stay off the board. */
export function useKanbanDragOverlay(
  binding: OverlayDragBinding,
  compact: boolean,
) {
  const controller = binding[overlayController];
  const liveFeedback = useSyncExternalStore(
    controller.subscribe,
    controller.getFeedback,
    controller.getFeedback,
  );

  const curDropping = useSyncExternalStore(
    controller.subscribeDrop,
    controller.getDroppingState,
    controller.getDroppingState,
  );
  const animPos = useRef(
    Animated?.ValueXY ? new Animated.ValueXY({ x: 0, y: 0 }) : null,
  ).current;
  const animRotate = useRef(
    Animated?.Value ? new Animated.Value(0) : null,
  ).current;
  const animScale = useRef(
    Animated?.Value ? new Animated.Value(1) : null,
  ).current;
  const lastOpIdRef = useRef<string | null>(null);
  const liftingTaskIdRef = useRef<string | null>(null);

  if (
    curDropping &&
    animPos &&
    animRotate &&
    animScale &&
    lastOpIdRef.current !== curDropping.operationId
  ) {
    lastOpIdRef.current = curDropping.operationId;
    animPos.setValue({ x: curDropping.fromX, y: curDropping.fromY });
    animRotate.setValue(1);
    animScale.setValue(1.03);
  } else if (!curDropping) {
    lastOpIdRef.current = null;
  }

  useEffect(() => {
    if (
      !liveFeedback.isDragging ||
      !liveFeedback.draggingTaskId ||
      curDropping
    ) {
      if (!liveFeedback.isDragging && !curDropping) {
        liftingTaskIdRef.current = null;
      }
      return;
    }

    if (liftingTaskIdRef.current === liveFeedback.draggingTaskId) {
      return;
    }
    liftingTaskIdRef.current = liveFeedback.draggingTaskId;

    if (!Animated || !animRotate || !animScale) {
      return;
    }

    animRotate.setValue(0);
    animScale.setValue(1);
    Animated.timing(animRotate, {
      toValue: 1,
      duration: 120,
      useNativeDriver: false,
    }).start();
    Animated.timing(animScale, {
      toValue: 1.03,
      duration: 120,
      useNativeDriver: false,
    }).start();
  }, [
    liveFeedback.isDragging,
    liveFeedback.draggingTaskId,
    curDropping,
    animRotate,
    animScale,
  ]);

  useEffect(() => {
    if (!curDropping) return;
    const { operationId } = curDropping;

    if (!Animated || !animPos || !animRotate || !animScale) {
      void controller.reportDropComplete(operationId);
      return;
    }

    animPos.setValue({ x: curDropping.fromX, y: curDropping.fromY });
    animRotate.setValue(1);
    animScale.setValue(1.03);

    let cancelled = false;
    const animation = Animated.parallel([
      Animated.spring(animPos, {
        toValue: { x: curDropping.toX, y: curDropping.toY },
        useNativeDriver: false,
        friction: 9,
        tension: 90,
        restDisplacementThreshold: 1,
        restSpeedThreshold: 1,
      }),
      Animated.timing(animRotate, {
        toValue: 0,
        duration: 160,
        useNativeDriver: false,
      }),
      Animated.timing(animScale, {
        toValue: 1,
        duration: 160,
        useNativeDriver: false,
      }),
    ]);
    animation.start((result) => {
      if (cancelled) return;
      if (result === undefined || result.finished) {
        void controller.reportDropComplete(operationId);
      } else {
        controller.abortDrop(operationId);
      }
    });
    return () => {
      cancelled = true;
      animation.stop();
      controller.abortDrop(operationId);
    };
  }, [curDropping, controller, animPos, animRotate, animScale]);

  const previewTaskId = curDropping?.taskId ?? liveFeedback.draggingTaskId;
  const preview = previewTaskId
    ? controller.getTaskPreviewItem(previewTaskId)
    : null;
  const activeTask = curDropping?.task ?? preview?.task ?? null;
  const activeProjectName =
    curDropping?.projectName ?? preview?.projectDisplayName ?? null;

  const isVisible =
    (liveFeedback.isDragging &&
      typeof liveFeedback.pointerX === "number" &&
      activeTask !== null) ||
    (curDropping !== null && activeTask !== null);

  if (!isVisible || !activeTask) {
    return null;
  }

  const containerBounds = controller.getContainerBounds() ?? null;
  const containerX = containerBounds?.x ?? 0;
  const containerY = containerBounds?.y ?? 0;
  const cardHalfWidth = compact ? 125 : 140;
  const activeCardWidth =
    curDropping?.draggedCardWidth ?? liveFeedback.draggedCardWidth;

  let overlayStyle: Animated.WithAnimatedValue<ViewStyle>;
  if (curDropping && animPos && animRotate && animScale) {
    overlayStyle = {
      transform: [
        { translateX: animPos.x },
        { translateY: animPos.y },
        {
          rotate: animRotate.interpolate({
            inputRange: [0, 1],
            outputRange: ["0deg", "2.5deg"],
          }),
        },
        { scale: animScale },
      ],
    };
  } else if (
    typeof liveFeedback.pointerX === "number" &&
    typeof liveFeedback.pointerY === "number"
  ) {
    const offsetX = liveFeedback.grabOffsetX ?? cardHalfWidth;
    const offsetY = liveFeedback.grabOffsetY ?? 20;
    overlayStyle = {
      transform: [
        { translateX: liveFeedback.pointerX - containerX - offsetX },
        { translateY: liveFeedback.pointerY - containerY - offsetY },
        {
          rotate: animRotate
            ? animRotate.interpolate({
                inputRange: [0, 1],
                outputRange: ["0deg", "2.5deg"],
              })
            : "2.5deg",
        },
        { scale: animScale ?? 1.03 },
      ],
    };
  } else {
    return null;
  }

  return {
    task: activeTask,
    projectDisplayName: activeProjectName,
    width: activeCardWidth,
    style: overlayStyle,
  };
}
