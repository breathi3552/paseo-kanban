import type { PluginServerContext } from "@getpaseo/plugin/server";
import { kanbanSettings } from "./shared/kanban";
import { registerGitHubImport } from "./server/github";
import { registerAgentDispatch } from "./server/agent-dispatch";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(kanbanSettings);
  registerGitHubImport(server);
  registerAgentDispatch(server);
  return () => {};
}
