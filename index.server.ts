import type { PluginServerContext } from "@getpaseo/plugin/server";
import { kanbanSettings } from "./shared/kanban";
import { registerGitHubImport } from "./server/github";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(kanbanSettings);
  registerGitHubImport(server);
  return () => {};
}
