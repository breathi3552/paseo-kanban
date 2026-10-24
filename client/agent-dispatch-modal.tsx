import { useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import {
  Modal,
  ScrollView,
  TextInput,
  useToast,
} from "@getpaseo/plugin/client/react-native";
import { SettingsSelect } from "@getpaseo/plugin/client/ui";
import type { KanbanBoard, KanbanTask } from "../shared/kanban";
import type { SaveFn } from "./kanban-session";
import type { ProjectItem } from "./use-projects";
import { useI18n } from "./i18n";
import { useAgentDispatch } from "./agent-dispatch";

interface Props {
  task: KanbanTask;
  board: KanbanBoard;
  revision: string;
  projects: ProjectItem[];
  theme: PluginSurfaceProps["theme"];
  navigation: NonNullable<PluginSurfaceProps["navigation"]>;
  save: SaveFn;
  onClose: () => void;
}

export function AgentDispatchModal({
  task,
  board,
  revision,
  projects,
  theme,
  navigation,
  save,
  onClose,
}: Props) {
  const toast = useToast();
  const { t, language } = useI18n();
  const reportFailure = useRef(() => toast.error(t("dispatch.failed")));
  reportFailure.current = () => toast.error(t("dispatch.failed"));
  const dispatch = useAgentDispatch({
    task,
    board,
    revision,
    projects,
    navigation,
    language,
    defaultPrompt: t("dispatch.defaultPrompt"),
    save,
    onLoadError: () => reportFailure.current(),
  });
  const [promptDraft, setPromptDraft] = useState<string | null>(null);
  const prompt =
    promptDraft ?? dispatch.storedPrompt ?? t("dispatch.defaultPrompt");
  const [selectedProfileId, setProfileId] = useState("");
  const profileId = selectedProfileId || (dispatch.profiles[0]?.id ?? "");
  const [projectId, setProjectId] = useState(task.projectId ?? "");
  const [workspaceId, setWorkspaceId] = useState("new-directory");
  const [branchName, setBranchName] = useState("");

  const { profiles, workspaces, sending, disabled, errors } = dispatch;
  const colors = theme.colors;
  const project = projects.find((item) => item.projectId === projectId);
  const projectWorkspaces = workspaces.filter(
    (item) => item.projectId === projectId,
  );
  async function submit() {
    const result = await dispatch.submit({
      prompt,
      projectId,
      workspaceId,
      branchName,
      profileId,
    });
    if (result.promptSaved) {
      toast.show(t("dispatch.promptSaved"), { variant: "success" });
    }
    if (result.status === "sent") {
      onClose();
    } else if (result.status === "failed") {
      reportFailure.current();
    }
  }
  return (
    <Modal
      open
      title={t("dispatch.title")}
      onOpenChange={(open) => {
        if (!open && dispatch.canClose()) onClose();
      }}
    >
      <Modal.Content
        scrollable={false}
        style={{ backgroundColor: colors.surface0 }}
        contentContainerStyle={{ flexShrink: 1, minHeight: 0, gap: 16 }}
      >
        <ScrollView
          style={{ flexShrink: 1, maxHeight: 440 }}
          // Leave room inside the scroll viewport for the input focus outline.
          contentContainerStyle={{ gap: 16, padding: 4 }}
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
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.foreground }}>prompt</Text>
            <TextInput
              accessibilityLabel="prompt"
              multiline
              value={prompt}
              editable={!disabled}
              onChangeText={setPromptDraft}
              style={{
                color: colors.foreground,
                backgroundColor: colors.surface1,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: 6,
                padding: 10,
                minHeight: 88,
                textAlignVertical: "top",
              }}
            />
          </View>
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
              dispatch.clearErrors();
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
            {t("dispatch.manageProfiles")}
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
              opacity: disabled && !sending ? 0.4 : 1,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            {sending && <ActivityIndicator color={colors.accentForeground} />}
            <Text style={{ color: colors.accentForeground }}>
              {t(sending ? "dispatch.sending" : "dispatch.send")}
            </Text>
          </Pressable>
        </View>
      </Modal.Content>
    </Modal>
  );
}
