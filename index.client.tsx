import type { PluginClientContext } from "@getpaseo/plugin/client";
import { KanbanBoardView } from "./client/kanban-board";
import { t, getLanguage, subscribeLanguage } from "./client/i18n";

export default function contribute(client: PluginClientContext) {
  client.addSurface("kanban", KanbanBoardView);

  let currentLang = getLanguage();
  let removeSidebar = client.addSidebarItem({
    id: "kanban",
    title: t("kanban.sidebarTitle", currentLang),
    icon: "PanelsTopLeft",
    surface: "kanban",
  });

  const unsubscribe = subscribeLanguage((newLang) => {
    if (newLang !== currentLang) {
      currentLang = newLang;
      removeSidebar();
      removeSidebar = client.addSidebarItem({
        id: "kanban",
        title: t("kanban.sidebarTitle", newLang),
        icon: "PanelsTopLeft",
        surface: "kanban",
      });
    }
  });

  return () => {
    unsubscribe();
    removeSidebar();
  };
}
