import type { PluginClientContext } from "@getpaseo/plugin/client";
import { KanbanBoardView } from "./client/kanban-board";

export default function contribute(client: PluginClientContext) {
  client.addSurface("kanban", KanbanBoardView);
  client.addSidebarItem({
    id: "kanban",
    title: "看板",
    icon: "PanelsTopLeft",
    surface: "kanban",
  });

  client.addWorkspacePanel({
    id: "kanban",
    title: "看板",
    icon: "PanelsTopLeft",
    context: "workspace",
    locations: ["workspace", "explorer"],
    Component: KanbanBoardView,
  });

  client.addSettingsScreen({
    id: "kanban",
    title: "看板",
    icon: "PanelsTopLeft",
    Component: KanbanBoardView,
  });

  return () => {};
}
