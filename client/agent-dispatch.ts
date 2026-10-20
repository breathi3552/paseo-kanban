import type { usePaseo } from "@getpaseo/plugin/client";
import type { KanbanTask } from "../shared/kanban";
import type { SupportedLanguage } from "./i18n";

export type Paseo = ReturnType<typeof usePaseo>;
export type AgentProfile = NonNullable<
  Awaited<ReturnType<Paseo["config"]["get"]>>["config"]["agentProfiles"]
>[number];
export type WorkspaceItem = Awaited<
  ReturnType<Paseo["workspaces"]["list"]>
>["entries"][number];
export type WorkspaceTarget =
  | { kind: "existing"; id: string }
  | { kind: "directory"; path: string }
  | { kind: "worktree"; cwd: string; action: "branch-off"; branchName: string };

export async function loadDispatchOptions(paseo: Paseo) {
  async function listWorkspaces() {
    const workspaces: WorkspaceItem[] = [];
    let cursor: string | undefined;
    do {
      const result = await paseo.workspaces.list({
        page: { limit: 200, ...(cursor ? { cursor } : {}) },
      });
      workspaces.push(...result.entries);
      cursor = result.pageInfo.nextCursor ?? undefined;
    } while (cursor);
    return workspaces;
  }
  const [{ config }, workspaces] = await Promise.all([
    paseo.config.get(),
    listWorkspaces(),
  ]);
  return { profiles: config.agentProfiles ?? [], workspaces };
}

export function taskPrompt(task: KanbanTask, language: SupportedLanguage) {
  const zh = language === "zh";
  return [
    zh ? "请处理以下任务。" : "Please work on the following task.",
    `# ${task.title}`,
    task.description.trim()
      ? `## ${zh ? "描述" : "Description"}\n\n${task.description}`
      : null,
    task.subtasks.length
      ? `## ${zh ? "子步骤" : "Steps"}\n\n${task.subtasks.map((step) => `- [${step.completed ? "x" : " "}] ${step.title}`).join("\n")}`
      : null,
    task.externalUrl
      ? `## ${zh ? "来源" : "Source"}\n\n${task.externalUrl}`
      : null,
  ]
    .filter((block) => block !== null)
    .join("\n\n");
}

export async function sendTaskToAgent({
  paseo,
  task,
  profile,
  target,
  language,
}: {
  paseo: Paseo;
  task: KanbanTask;
  profile: AgentProfile;
  target: WorkspaceTarget;
  language: SupportedLanguage;
}) {
  const workspace =
    target.kind === "existing"
      ? paseo.workspaces.ref(target.id)
      : await paseo.workspaces.create({ title: task.title, source: target });
  return workspace.agents.create({
    config: {
      provider: profile.model
        ? `${profile.provider}/${profile.model}`
        : profile.provider,
      modeId: profile.modeId,
      thinkingOptionId: profile.thinkingOptionId,
      featureValues: profile.featureValues,
    },
    prompt: taskPrompt(task, language),
  });
}
