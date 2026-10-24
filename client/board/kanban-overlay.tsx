import { memo } from "react";
import { Animated, View, StyleSheet } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { KanbanCardPreview } from "./kanban-card";
import { useKanbanDragOverlay, type OverlayDragBinding } from "./drag";

type PluginTheme = PluginSurfaceProps["theme"];
const AnimatedView = (Animated && Animated.View) || View;

export interface KanbanDragOverlayProps {
  binding: OverlayDragBinding;
  theme: PluginTheme;
  layout: { compact: boolean };
}

function KanbanDragOverlayInner({
  binding,
  theme,
  layout,
}: KanbanDragOverlayProps) {
  const overlay = useKanbanDragOverlay(binding, layout.compact);
  if (!overlay) return null;

  return (
    <AnimatedView
      pointerEvents="none"
      style={[styles.dragOverlay, overlay.style]}
    >
      <KanbanCardPreview
        task={overlay.task}
        projectDisplayName={overlay.projectDisplayName}
        theme={theme}
        layout={layout}
        width={overlay.width}
        animated={true}
      />
    </AnimatedView>
  );
}

const styles = StyleSheet.create({
  dragOverlay: {
    position: "absolute",
    left: 0,
    top: 0,
    zIndex: 9999,
    pointerEvents: "none",
  },
});

export const KanbanDragOverlay = memo(KanbanDragOverlayInner);
