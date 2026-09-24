import type { PluginClientContext } from "@getpaseo/plugin/client";
import { KanbanBoardView } from "./client/kanban-board";
import { KanbanWorkspacePanel } from "./client/kanban-workspace-panel";
import { t, getLanguage, subscribeLanguage } from "./client/i18n";

export default function contribute(client: PluginClientContext) {
  const removeSurface = client.addSurface("kanban", KanbanBoardView);
  let currentLang = getLanguage();

  const registerEntries = () => {
    const title = t("kanban.sidebarTitle", currentLang);
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
    };
  };

  let removeEntries = registerEntries();
  const unsubscribe = subscribeLanguage((newLang) => {
    if (newLang !== currentLang) {
      currentLang = newLang;
      removeEntries();
      removeEntries = registerEntries();
    }
  });

  return () => {
    unsubscribe();
    removeEntries();
    removeSurface();
  };
}
