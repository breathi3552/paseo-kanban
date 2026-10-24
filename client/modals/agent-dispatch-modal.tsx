import { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import {
  Modal,
  ScrollView,
  TextInput,
  useToast,
} from "@getpaseo/plugin/client/react-native";
import { SettingsSelect } from "@getpaseo/plugin/client/ui";
import type { KanbanBoard, KanbanTask } from "../../shared/kanban";
import type { SaveFn } from "../session/kanban-session";
import type { ProjectItem } from "../session/use-projects";
import { useI18n } from "../platform/i18n";
import { useAgentDispatch } from "../session/agent-dispatch";

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
  const dispatch = useAgentDispatch({
    task,
    board,
    revision,
    projects,
    navigation,
    language,
    save,
    onLoadError: () => toast.error(t("dispatch.failed")),
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
  const styles = useMemo(() => createDispatchStyles(colors), [colors]);
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
    if (result.status === "sent") {
      toast.show(t("dispatch.sent"), {
        variant: "success",
      });
      onClose();
    } else if (result.status === "failed") {
      toast.error(t("dispatch.failed"));
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
        style={styles.modalSurface}
        contentContainerStyle={styles.modalContent}
      >
        <ScrollView
          style={styles.scrollArea}
          // Leave room inside the scroll viewport for the input focus outline.
          contentContainerStyle={styles.scrollContent}
        >
          <Text style={styles.taskTitle}>{task.title}</Text>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>prompt</Text>
            <TextInput
              accessibilityLabel="prompt"
              multiline
              value={prompt}
              editable={!disabled}
              onChangeText={setPromptDraft}
              style={styles.promptInput}
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
            <Text style={styles.errorText}>{t("dispatch.selectProject")}</Text>
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
            <Text style={styles.errorText}>
              {t("dispatch.selectWorkspace")}
            </Text>
          )}
          {workspaceId === "new-worktree" && (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>{t("dispatch.branchName")}</Text>
              <TextInput
                accessibilityLabel={t("dispatch.branchName")}
                placeholder={t("dispatch.branchName")}
                value={branchName}
                editable={!disabled}
                onChangeText={setBranchName}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.textInput}
              />
            </View>
          )}
          {workspaceId === "new-worktree" && errors.branch && (
            <Text style={styles.errorText}>{t("dispatch.invalidBranch")}</Text>
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
            <Text style={styles.errorText}>{t("dispatch.selectProfile")}</Text>
          )}
          <Text style={styles.hintText}>{t("dispatch.manageProfiles")}</Text>
        </ScrollView>
        <View style={styles.footerRow}>
          <Pressable
            disabled={sending}
            onPress={onClose}
            style={styles.cancelButton}
          >
            <Text style={styles.fieldLabel}>{t("dispatch.cancel")}</Text>
          </Pressable>
          <Pressable
            disabled={disabled}
            onPress={submit}
            style={[
              styles.submitButton,
              disabled && !sending && styles.submitButtonDisabled,
            ]}
          >
            {sending && <ActivityIndicator color={colors.accentForeground} />}
            <Text style={styles.submitButtonText}>
              {t(sending ? "dispatch.sending" : "dispatch.send")}
            </Text>
          </Pressable>
        </View>
      </Modal.Content>
    </Modal>
  );
}

function createDispatchStyles(colors: PluginSurfaceProps["theme"]["colors"]) {
  return StyleSheet.create({
    modalSurface: {
      backgroundColor: colors.surface0,
    },
    modalContent: {
      flexShrink: 1,
      minHeight: 0,
      gap: 16,
    },
    scrollArea: {
      flexShrink: 1,
      maxHeight: 440,
    },
    scrollContent: {
      gap: 16,
      padding: 4,
    },
    taskTitle: {
      color: colors.foreground,
      fontSize: 16,
      fontWeight: "600",
    },
    fieldGroup: {
      gap: 6,
    },
    fieldLabel: {
      color: colors.foreground,
    },
    promptInput: {
      color: colors.foreground,
      backgroundColor: colors.surface1,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 6,
      padding: 10,
      minHeight: 88,
      textAlignVertical: "top",
    },
    textInput: {
      color: colors.foreground,
      backgroundColor: colors.surface1,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 6,
      padding: 10,
    },
    errorText: {
      color: colors.statusDanger,
    },
    hintText: {
      color: colors.foregroundMuted,
      fontSize: 12,
    },
    footerRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 12,
    },
    cancelButton: {
      padding: 10,
    },
    submitButton: {
      padding: 10,
      borderRadius: 6,
      backgroundColor: colors.accent,
      opacity: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    submitButtonDisabled: {
      opacity: 0.4,
    },
    submitButtonText: {
      color: colors.accentForeground,
    },
  });
}
