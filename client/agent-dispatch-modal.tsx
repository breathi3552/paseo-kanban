import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable } from "react-native";
import {
  usePaseo,
  useRpc,
  type PluginSurfaceProps,
} from "@getpaseo/plugin/client";
import {
  Modal,
  ScrollView,
  TextInput,
  useToast,
} from "@getpaseo/plugin/client/react-native";
import { SettingsSelect } from "@getpaseo/plugin/client/ui";
import type { KanbanTask } from "../shared/kanban";
import type { ProjectItem } from "./use-projects";
import { useI18n } from "./i18n";
import {
  loadDispatchOptions,
  sendTaskToAgent,
  type AgentProfile,
  type WorkspaceItem,
  type WorkspaceTarget,
} from "./agent-dispatch";
import { validateGitBranch } from "../shared/agent-dispatch";

interface Props {
  task: KanbanTask;
  projects: ProjectItem[];
  theme: PluginSurfaceProps["theme"];
  navigation: NonNullable<PluginSurfaceProps["navigation"]>;
  saveProject: (projectId: string) => Promise<boolean>;
  onClose: () => void;
}

export function AgentDispatchModal({
  task,
  projects,
  theme,
  navigation,
  saveProject,
  onClose,
}: Props) {
  const paseo = usePaseo();
  const validateBranch = useRpc(validateGitBranch);
  const toast = useToast();
  const { t, language } = useI18n();
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [profileId, setProfileId] = useState("");
  const [projectId, setProjectId] = useState(task.projectId ?? "");
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [workspaceId, setWorkspaceId] = useState("new-directory");
  const [branchName, setBranchName] = useState("");
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<{
    project?: boolean;
    workspace?: boolean;
    profile?: boolean;
    branch?: boolean;
  }>({});
  const sendingRef = useRef(false);
  const savedProjectId = useRef(task.projectId);
  const reportFailure = useRef(() => toast.error(t("dispatch.failed")));
  reportFailure.current = () => toast.error(t("dispatch.failed"));
  useEffect(() => {
    let active = true;
    loadDispatchOptions(paseo).then(
      ({ profiles, workspaces }) => {
        if (!active) return;
        setProfiles(profiles);
        setProfileId(profiles[0]?.id ?? "");
        setWorkspaces(workspaces);
      },
      () => {
        if (active) reportFailure.current();
      },
    );
    return () => {
      active = false;
    };
  }, [paseo]);

  const disabled = sending || profiles.length === 0;
  const colors = theme.colors;
  const project = projects.find((item) => item.projectId === projectId);
  const projectWorkspaces = workspaces.filter(
    (item) => item.projectId === projectId,
  );
  const selectedWorkspace = projectWorkspaces.find(
    (item) => item.id === workspaceId,
  );
  async function submit() {
    if (sendingRef.current || disabled) return;
    const profile = profiles.find((item) => item.id === profileId);
    const nextErrors = {
      project: !project?.projectRootPath,
      profile: !profile,
      workspace:
        !selectedWorkspace &&
        workspaceId !== "new-directory" &&
        !(workspaceId === "new-worktree" && project?.projectKind === "git"),
      branch: workspaceId === "new-worktree" && !branchName.trim(),
    };
    setErrors(nextErrors);
    if (
      Object.values(nextErrors).some(Boolean) ||
      !profile ||
      !project?.projectRootPath
    )
      return;
    sendingRef.current = true;
    setSending(true);
    try {
      if (workspaceId === "new-worktree") {
        const result = await validateBranch({ branchName });
        if (!result.valid) {
          setErrors({ branch: true });
          return;
        }
      }
      if (
        task.source !== "github_issue" &&
        projectId !== savedProjectId.current
      ) {
        if (!(await saveProject(projectId)))
          throw new Error("Project save failed");
        savedProjectId.current = projectId;
      }
      const target: WorkspaceTarget = selectedWorkspace
        ? { kind: "existing", id: selectedWorkspace.id }
        : workspaceId === "new-worktree"
          ? {
              kind: "worktree",
              cwd: project.projectRootPath,
              action: "branch-off",
              branchName,
            }
          : { kind: "directory", path: project.projectRootPath };
      const agent = await sendTaskToAgent({
        paseo,
        task,
        profile,
        target,
        language,
      });
      navigation.openAgent({ agentId: agent.id });
      onClose();
    } catch {
      reportFailure.current();
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }
  return (
    <Modal
      open
      title={t("dispatch.title")}
      onOpenChange={(open) => {
        if (!open && !sendingRef.current) onClose();
      }}
    >
      <Modal.Content
        scrollable={false}
        style={{ backgroundColor: colors.surface0 }}
        contentContainerStyle={{ flexShrink: 1, minHeight: 0, gap: 16 }}
      >
        <ScrollView
          style={{ flexShrink: 1, maxHeight: 440 }}
          contentContainerStyle={{ gap: 16 }}
        >
          <Text
            style={{
              color: colors.foreground,
              fontSize: 16,
              fontWeight: "600",
            }}
          >
            {task.title}
          </Text>
          <SettingsSelect
            label={t("dispatch.project")}
            value={projectId}
            disabled={disabled || task.source === "github_issue"}
            options={[
              { label: t("dispatch.selectProject"), value: "" },
              ...projects.map((item) => ({
                label: item.projectDisplayName,
                value: item.projectId,
              })),
            ]}
            onValueChange={(id) => {
              setProjectId(id);
              setWorkspaceId("new-directory");
              setErrors({});
            }}
          />
          {errors.project && (
            <Text style={{ color: colors.statusDanger }}>
              {t("dispatch.selectProject")}
            </Text>
          )}
          <SettingsSelect
            label={t("dispatch.workspace")}
            value={workspaceId}
            disabled={disabled}
            options={[
              ...projectWorkspaces.map((item) => ({
                label: item.name,
                value: item.id,
              })),
              { label: t("dispatch.newDirectory"), value: "new-directory" },
              ...(project?.projectKind === "git"
                ? [{ label: t("dispatch.newWorktree"), value: "new-worktree" }]
                : []),
            ]}
            onValueChange={setWorkspaceId}
          />
          {errors.workspace && (
            <Text style={{ color: colors.statusDanger }}>
              {t("dispatch.selectWorkspace")}
            </Text>
          )}
          {selectedWorkspace && (
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.foreground }}>
                {t("dispatch.workspaceName")}
              </Text>
              <TextInput
                accessibilityLabel={t("dispatch.workspaceName")}
                value={selectedWorkspace.name}
                editable={false}
                style={{
                  color: colors.foregroundMuted,
                  backgroundColor: colors.surface1,
                }}
              />
            </View>
          )}
          {workspaceId === "new-worktree" && (
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.foreground }}>
                {t("dispatch.branchName")}
              </Text>
              <TextInput
                accessibilityLabel={t("dispatch.branchName")}
                placeholder={t("dispatch.branchName")}
                value={branchName}
                editable={!disabled}
                onChangeText={setBranchName}
                autoCapitalize="none"
                autoCorrect={false}
                style={{
                  color: colors.foreground,
                  backgroundColor: colors.surface1,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderRadius: 6,
                  padding: 10,
                }}
              />
            </View>
          )}
          {workspaceId === "new-worktree" && errors.branch && (
            <Text style={{ color: colors.statusDanger }}>
              {t("dispatch.invalidBranch")}
            </Text>
          )}
          <SettingsSelect
            label={t("dispatch.profile")}
            value={profileId}
            disabled={disabled}
            options={profiles.map((item) => ({
              label: item.name,
              value: item.id,
            }))}
            onValueChange={setProfileId}
          />
          {errors.profile && (
            <Text style={{ color: colors.statusDanger }}>
              {t("dispatch.selectProfile")}
            </Text>
          )}
          <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>
            {t("dispatch.managePresets")}
          </Text>
        </ScrollView>
        <View
          style={{ flexDirection: "row", justifyContent: "flex-end", gap: 12 }}
        >
          <Pressable
            disabled={sending}
            onPress={onClose}
            style={{ padding: 10 }}
          >
            <Text style={{ color: colors.foreground }}>
              {t("dispatch.cancel")}
            </Text>
          </Pressable>
          <Pressable
            disabled={disabled}
            onPress={submit}
            style={{
              padding: 10,
              borderRadius: 6,
              backgroundColor: colors.accent,
              opacity: disabled ? 0.4 : 1,
            }}
          >
            <Text style={{ color: colors.accentForeground }}>
              {t("dispatch.send")}
            </Text>
          </Pressable>
        </View>
      </Modal.Content>
    </Modal>
  );
}
