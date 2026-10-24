import { useEffect, useRef, useState } from "react";
import {
  usePaseo,
  useRpc,
  useSettings,
  type PluginSurfaceProps,
} from "@getpaseo/plugin/client";
import {
  updateTask,
  type KanbanBoard,
  type KanbanTask,
} from "../../shared/kanban";
import {
  agentDispatchSettings,
  validateGitBranch,
} from "../../shared/agent-dispatch";
import type { SaveFn } from "./kanban-session";
import type { ProjectItem } from "./use-projects";
import type { SupportedLanguage } from "../platform/i18n";

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

export interface AgentDispatchDraft {
  prompt: string;
  projectId: string;
  workspaceId: string;
  branchName: string;
  profileId: string;
}

export interface AgentDispatchErrors {
  project?: boolean;
  workspace?: boolean;
  profile?: boolean;
  branch?: boolean;
}

export type AgentDispatchResult =
  | { status: "blocked"; promptSaved: false }
  | { status: "invalid"; errors: AgentDispatchErrors; promptSaved: false }
  | { status: "failed"; promptSaved: boolean }
  | { status: "sent"; agentId: string; promptSaved: boolean };

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

export function taskPrompt(
  task: KanbanTask,
  language: SupportedLanguage,
  prompt: string,
) {
  const zh = language === "zh";
  return [
    prompt.trim() ? prompt : null,
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
  prompt,
}: {
  paseo: Paseo;
  task: KanbanTask;
  profile: AgentProfile;
  target: WorkspaceTarget;
  language: SupportedLanguage;
  prompt: string;
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
    prompt: taskPrompt(task, language, prompt),
  });
}

export function useAgentDispatch({
  task,
  board,
  revision,
  projects,
  navigation,
  language,
  defaultPrompt,
  save,
  onLoadError,
}: {
  task: KanbanTask;
  board: KanbanBoard;
  revision: string;
  projects: ProjectItem[];
  navigation: NonNullable<PluginSurfaceProps["navigation"]>;
  language: SupportedLanguage;
  defaultPrompt: string;
  save: SaveFn;
  onLoadError: () => void;
}) {
  const paseo = usePaseo();
  const validateBranch = useRpc(validateGitBranch);
  const promptSettings = useSettings(agentDispatchSettings);
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<AgentDispatchErrors>({});
  const sendingRef = useRef(false);
  const savedProjectId = useRef(task.projectId);
  const latestPromptSettings = useRef(promptSettings);
  latestPromptSettings.current = promptSettings;
  const loadErrorRef = useRef(onLoadError);
  loadErrorRef.current = onLoadError;

  useEffect(() => {
    let active = true;
    loadDispatchOptions(paseo).then(
      ({ profiles, workspaces }) => {
        if (!active) return;
        setProfiles(profiles);
        setWorkspaces(workspaces);
      },
      () => {
        if (active) loadErrorRef.current();
      },
    );
    return () => {
      active = false;
    };
  }, [paseo]);

  const disabled =
    sending || profiles.length === 0 || promptSettings.status !== "ready";
  const storedPrompt =
    promptSettings.status === "ready" ? promptSettings.values.prompt : null;

  async function submit(
    draft: AgentDispatchDraft,
  ): Promise<AgentDispatchResult> {
    if (sendingRef.current || disabled || promptSettings.status !== "ready") {
      return { status: "blocked", promptSaved: false };
    }
    const projectId =
      task.source === "github_issue" ? (task.projectId ?? "") : draft.projectId;
    const project = projects.find((item) => item.projectId === projectId);
    const profile = profiles.find((item) => item.id === draft.profileId);
    const selectedWorkspace = workspaces.find(
      (item) => item.projectId === projectId && item.id === draft.workspaceId,
    );
    const nextErrors: AgentDispatchErrors = {
      project: !project?.projectRootPath,
      profile: !profile,
      workspace:
        !selectedWorkspace &&
        draft.workspaceId !== "new-directory" &&
        !(
          draft.workspaceId === "new-worktree" && project?.projectKind === "git"
        ),
      branch: draft.workspaceId === "new-worktree" && !draft.branchName.trim(),
    };
    setErrors(nextErrors);
    if (
      Object.values(nextErrors).some(Boolean) ||
      !profile ||
      !project?.projectRootPath
    ) {
      return { status: "invalid", errors: nextErrors, promptSaved: false };
    }
    sendingRef.current = true;
    setSending(true);
    let promptSaved = false;
    try {
      if (draft.workspaceId === "new-worktree") {
        const result = await validateBranch({ branchName: draft.branchName });
        if (!result.valid) {
          const branchErrors: AgentDispatchErrors = { branch: true };
          setErrors(branchErrors);
          return {
            status: "invalid",
            errors: branchErrors,
            promptSaved: false,
          };
        }
      }
      const currentPromptSettings = latestPromptSettings.current;
      if (currentPromptSettings.status !== "ready")
        throw new Error("Prompt settings not ready");
      const currentStoredPrompt = currentPromptSettings.values.prompt;
      if (draft.prompt !== currentStoredPrompt) {
        if (
          !(await currentPromptSettings.save(
            { prompt: draft.prompt },
            currentPromptSettings.revision,
          ))
        )
          throw new Error("Prompt save failed");
        promptSaved = draft.prompt !== (currentStoredPrompt ?? defaultPrompt);
      }
      if (
        task.source !== "github_issue" &&
        projectId !== savedProjectId.current
      ) {
        if (!(await save(updateTask(board, task.id, { projectId }), revision)))
          throw new Error("Project save failed");
        savedProjectId.current = projectId;
      }
      const target: WorkspaceTarget = selectedWorkspace
        ? { kind: "existing", id: selectedWorkspace.id }
        : draft.workspaceId === "new-worktree"
          ? {
              kind: "worktree",
              cwd: project.projectRootPath,
              action: "branch-off",
              branchName: draft.branchName,
            }
          : { kind: "directory", path: project.projectRootPath };
      const agent = await sendTaskToAgent({
        paseo,
        task,
        profile,
        target,
        language,
        prompt: draft.prompt,
      });
      navigation.openAgent({ agentId: agent.id });
      return { status: "sent", agentId: agent.id, promptSaved };
    } catch {
      return { status: "failed", promptSaved };
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  return {
    profiles,
    workspaces,
    storedPrompt,
    sending,
    disabled,
    errors,
    canClose: () => !sendingRef.current,
    clearErrors: () => setErrors({}),
    submit,
  };
}
