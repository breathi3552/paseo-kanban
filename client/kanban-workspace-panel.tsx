import {
  useWorkspace,
  type PluginWorkspacePanelProps,
} from "@getpaseo/plugin/client";
import { KanbanBoardView } from "./kanban-board";

export function KanbanWorkspacePanel(props: PluginWorkspacePanelProps) {
  const projectId = useWorkspace(
    props.workspaceId,
    (workspace) => workspace.projectId,
  );
  return (
    <KanbanBoardView
      key={`${props.host.id}:${props.workspaceId}`}
      {...props}
      initialProjectId={projectId}
    />
  );
}
