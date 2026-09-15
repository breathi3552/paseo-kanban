import type { PluginServerContext } from "@getpaseo/plugin/server";
import { kanbanSettings } from "./shared/kanban";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(kanbanSettings);
  return () => {};
}
