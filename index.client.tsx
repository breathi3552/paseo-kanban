import type { PluginClientContext } from "@getpaseo/plugin/client";
import { KanbanBoardView } from "./client/board/kanban-board";
import { KanbanWorkspacePanel } from "./client/board/kanban-workspace-panel";
import { t, getLanguage } from "./client/platform/i18n";

export default function contribute(client: PluginClientContext) {
  const removeSurface = client.addSurface("kanban", KanbanBoardView);
  const title = t("kanban.sidebarTitle", getLanguage());
  const removeSidebar = client.addSidebarItem({
    id: "kanban",
    title,
    icon: "PanelsTopLeft",
    surface: "kanban",
  });
  const removePanel = client.addWorkspacePanel({
    id: "kanban",
    title,
    icon: "PanelsTopLeft",
    context: "workspace",
    Component: KanbanWorkspacePanel,
  });

  return () => {
    removeSidebar();
    removePanel();
    removeSurface();
  };
}
