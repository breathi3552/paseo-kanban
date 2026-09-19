import { useEffect, useRef, useSyncExternalStore, memo } from "react";
import { Animated, View, StyleSheet } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import type { KanbanTask } from "../shared/kanban";
import { KanbanCardPreview } from "./kanban-card";
import type { UseKanbanDragReturn } from "./kanban-drag";

type PluginTheme = PluginSurfaceProps["theme"];

const AnimatedView = (Animated && Animated.View) || View;

export interface KanbanDragOverlayProps {
  drag: UseKanbanDragReturn;
  theme: PluginTheme;
  layout: { compact: boolean };
  task?: KanbanTask | null;
  projectDisplayName?: string | null;
}

function KanbanDragOverlayInner({
  drag,
  theme,
  layout,
  task: propTask,
  projectDisplayName: propProjectName,
}: KanbanDragOverlayProps) {
  const liveFeedback = useSyncExternalStore(
    drag.controller ? drag.controller.subscribe : (() => () => {}),
    drag.controller ? drag.controller.getFeedback : (() => drag.feedback),
    drag.controller ? drag.controller.getFeedback : (() => drag.feedback)
  );

  const curDropping = drag.droppingState;
  const animPos = useRef(Animated?.ValueXY ? new Animated.ValueXY({ x: 0, y: 0 }) : null).current;
  const animRotate = useRef(Animated?.Value ? new Animated.Value(1) : null).current;
  const animScale = useRef(Animated?.Value ? new Animated.Value(1.03) : null).current;
  const droppingHandledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!curDropping) {
      droppingHandledRef.current = null;
      return;
    }

    const dropKey = curDropping.operationId || `${curDropping.taskId}_${curDropping.targetLaneId}_${curDropping.targetIndex}`;
    if (droppingHandledRef.current === dropKey) {
      return;
    }
    droppingHandledRef.current = dropKey;

    if (!Animated || !animPos || !animRotate || !animScale) {
      drag.commitDrop();
      return;
    }

    animPos.setValue({ x: curDropping.fromX, y: curDropping.fromY });
    animRotate.setValue(1);
    animScale.setValue(1.03);

    Animated.parallel([
      Animated.spring(animPos, {
        toValue: { x: curDropping.toX, y: curDropping.toY },
        useNativeDriver: false,
        friction: 8,
        tension: 50,
      }),
      Animated.timing(animRotate, {
        toValue: 0,
        duration: 180,
        useNativeDriver: false,
      }),
      Animated.timing(animScale, {
        toValue: 1,
        duration: 180,
        useNativeDriver: false,
      }),
    ]).start((result) => {
      if (result?.finished) {
        drag.commitDrop();
      } else {
        drag.abortDrop?.();
      }
    });
  }, [curDropping, drag, animPos, animRotate, animScale]);

  const activeTask =
    curDropping?.task ??
    propTask ??
    (liveFeedback.draggingTaskId && drag.getTaskPreview
      ? drag.getTaskPreview(liveFeedback.draggingTaskId)?.task
      : null);
  const activeProjectName =
    curDropping?.projectName ??
    propProjectName ??
    (liveFeedback.draggingTaskId && drag.getTaskPreview
      ? drag.getTaskPreview(liveFeedback.draggingTaskId)?.projectDisplayName
      : null);

  const isVisible =
    (liveFeedback.isDragging && typeof liveFeedback.pointerX === "number" && activeTask !== null) ||
    (curDropping !== null && activeTask !== null);

  if (!isVisible || !activeTask) {
    return null;
  }

  const containerBounds = drag.controller?.getContainerBounds?.() ?? null;
  const containerX = containerBounds?.x ?? 0;
  const containerY = containerBounds?.y ?? 0;
  const cardHalfWidth = layout.compact ? 125 : 140;

  let overlayStyle: any;
  if (curDropping && animPos && animRotate && animScale) {
    overlayStyle = {
      left: animPos.x,
      top: animPos.y,
      transform: [
        {
          rotate: animRotate.interpolate({
            inputRange: [0, 1],
            outputRange: ["0deg", "2.5deg"],
          }),
        },
        { scale: animScale },
      ],
    };
  } else if (typeof liveFeedback.pointerX === "number" && typeof liveFeedback.pointerY === "number") {
    overlayStyle = {
      left: liveFeedback.pointerX - containerX - cardHalfWidth,
      top: liveFeedback.pointerY - containerY - 20,
      transform: [{ rotate: "2.5deg" }, { scale: 1.03 }],
    };
  } else {
    return null;
  }

  return (
    <AnimatedView
      pointerEvents="none"
      style={[
        styles.dragOverlay,
        overlayStyle,
      ]}
    >
      <KanbanCardPreview
        task={activeTask}
        projectDisplayName={activeProjectName ?? null}
        theme={theme}
        layout={layout}
        animated={true}
      />
    </AnimatedView>
  );
}

const styles = StyleSheet.create({
  dragOverlay: {
    position: "absolute",
    zIndex: 9999,
    pointerEvents: "none",
  },
});

export const KanbanDragOverlay = memo(KanbanDragOverlayInner);
