import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRpc, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import {
  Icon,
  ScrollView,
  useToast,
} from "@getpaseo/plugin/client/react-native";
import { SettingsSelect } from "@getpaseo/plugin/client/ui";
import { listGitHubIssues, type IssuePage } from "../shared/github-import";
import type { KanbanBoard } from "../shared/kanban";
import { executeIssueImport, type SaveFn } from "./kanban-session";
import type { ProjectItem } from "./use-projects";
import { useI18n, type TranslationKey } from "./i18n";
import { BusinessDialog } from "./business-dialog";

interface Props {
  board: KanbanBoard;
  revision: string;
  settingsReady: boolean;
  projects: ProjectItem[];
  initialProjectId: string;
  save: SaveFn;
  reload: () => Promise<void>;
  onClose: () => void;
  onImported: (projectId: string) => void;
  theme: PluginSurfaceProps["theme"];
  compact: boolean;
}

const errorKeys = new Set([
  "project_missing",
  "github_origin",
  "gh_missing",
  "github_auth",
  "github_access",
  "github_network",
  "github_page",
]);

function relativeTime(createdAt: string, language: string) {
  const seconds = Math.max(0, (Date.now() - Date.parse(createdAt)) / 1000);
  const [unit, divisor]: [Intl.RelativeTimeFormatUnit, number] =
    seconds < 60
      ? ["second", 1]
      : seconds < 3600
        ? ["minute", 60]
        : seconds < 86400
          ? ["hour", 3600]
          : seconds < 2592000
            ? ["day", 86400]
            : seconds < 31536000
              ? ["month", 2592000]
              : ["year", 31536000];
  return new Intl.RelativeTimeFormat(language, { numeric: "always" }).format(
    -Math.floor(seconds / divisor),
    unit,
  );
}

export function GitHubImportModal(props: Props) {
  const { t, language } = useI18n();
  const toast = useToast();
  const query = useRpc(listGitHubIssues);
  const [projectId, setProjectId] = useState(() =>
    props.projects.some((p) => p.projectId === props.initialProjectId)
      ? props.initialProjectId
      : "",
  );
  const [laneId, setLaneId] = useState(
    () => props.board.lanes.find((lane) => !lane.isCompletionLane)?.id ?? "",
  );
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [response, setResponse] = useState<{
    key: string;
    data: IssuePage;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [retry, setRetry] = useState(0);
  const requestKey = JSON.stringify([projectId, page, sort]);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    setLoading(true);
    setError(null);
    query({ projectId, page, sort }).then(
      (data) => {
        if (active) {
          setResponse({ key: requestKey, data });
          setLoading(false);
        }
      },
      (reason: unknown) => {
        if (active) {
          const code = reason instanceof Error ? reason.message : "";
          setError(errorKeys.has(code) ? code : "github_network");
          setLoading(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [projectId, page, sort, query, requestKey, retry]);

  const data = response?.key === requestKey ? response.data : null;
  const ready = !!data && !loading && !error;
  const existing = useMemo(
    () =>
      new Set(
        props.board.tasks
          .filter((task) => task.projectId === projectId)
          .map((task) => task.issueNumber),
      ),
    [props.board, projectId],
  );
  const selectable = ready
    ? data.issues.filter((issue) => !existing.has(issue.number))
    : [];
  const chosen = selectable.filter((issue) => selected.has(issue.number));
  const validProject = props.projects.some(
    (project) => project.projectId === projectId,
  );
  const validLane = props.board.lanes.some(
    (lane) => lane.id === laneId && !lane.isCompletionLane,
  );
  const pages = Math.max(1, Math.ceil((data?.totalCount ?? 0) / 25));
  const allSelected =
    selectable.length > 0 && chosen.length === selectable.length;
  const disabled = saving || !ready || !props.settingsReady;
  const colors = props.theme.colors;
  const styles = useMemo(
    () =>
      StyleSheet.create({
        body: {
          flex: 1,
          minHeight: 0,
          gap: 12,
          backgroundColor: colors.surface0,
        },
        selectors: { flexDirection: props.compact ? "column" : "row", gap: 12 },
        select: { flex: 1, minWidth: 0 },
        selectProject: {
          flex: props.compact ? undefined : 1.15,
          minWidth: 0,
        },
        selectLane: {
          flex: props.compact ? undefined : 1,
          minWidth: 0,
        },
        list: { flex: 1, minHeight: 0 },
        row: {
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 12,
          paddingHorizontal: 4,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          gap: 10,
        },
        title: { color: colors.foreground, fontSize: 14, flex: 1 },
        secondary: { color: colors.foregroundMuted, fontSize: 12 },
        checkbox: {
          width: 36,
          height: 32,
          alignItems: "center",
          justifyContent: "center",
        },
        footer: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          flexWrap: "wrap",
        },
        button: {
          minHeight: 36,
          minWidth: 36,
          padding: 8,
          alignItems: "center",
          justifyContent: "center",
        },
        primary: {
          backgroundColor: colors.accent,
          borderRadius: 6,
          paddingHorizontal: 16,
        },
        error: { color: colors.statusDanger, fontSize: 13 },
      }),
    [colors, props.compact],
  );

  const clear = () => {
    setSelected(new Set());
    setSaveError(false);
  };
  const goTo = (next: number) => {
    if (savingRef.current || loading) return;
    clear();
    setPage(next);
  };
  async function submit() {
    if (
      savingRef.current ||
      !validProject ||
      !validLane ||
      !props.settingsReady ||
      !ready ||
      chosen.length === 0
    )
      return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(false);
    const result = await executeIssueImport({
      baseBoard: props.board,
      baseRevision: props.revision,
      projectId,
      laneId,
      issues: chosen,
      save: props.save,
      language,
    });
    if (result.success) {
      toast.show(t("import.success", { count: chosen.length }), {
        variant: "success",
      });
      props.onImported(projectId);
      props.onClose();
    } else {
      setSaveError(true);
      toast.error(t("import.error"));
      await props.reload().catch(() => {});
    }
    savingRef.current = false;
    setSaving(false);
  }

  return (
    <BusinessDialog
      title={t("import.title")}
      theme={props.theme}
      compact={props.compact}
      maxWidth={840}
      viewportWidth={90}
      scroll="contained"
      contentStyle={styles.body}
      canClose={() => !savingRef.current}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <View
        nativeID="github-import-dialog"
        testID="github-import-dialog"
        style={styles.selectors}
      >
        <View style={[styles.select, styles.selectProject]}>
          <SettingsSelect
            label={t("import.project")}
            value={projectId}
            disabled={saving}
            options={[
              { label: t("import.selectProject"), value: "" },
              ...props.projects.map((project) => ({
                label: project.projectDisplayName,
                value: project.projectId,
              })),
            ]}
            onValueChange={(id) => {
              if (savingRef.current) return;
              clear();
              setPage(1);
              setProjectId(id);
            }}
          />
        </View>
        <View style={[styles.select, styles.selectLane]}>
          <SettingsSelect
            label={t("import.lane")}
            value={laneId}
            disabled={saving}
            options={props.board.lanes
              .filter((lane) => !lane.isCompletionLane)
              .map((lane) => ({ label: lane.title, value: lane.id }))}
            onValueChange={(id) => {
              if (!savingRef.current) setLaneId(id);
            }}
          />
        </View>
      </View>
      {data && <Text style={styles.secondary}>{data.repository}</Text>}
      {!projectId ? (
        <Text style={styles.secondary}>{t("import.selectProject")}</Text>
      ) : loading ? (
        <View style={styles.row}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.secondary}>{t("import.loading")}</Text>
        </View>
      ) : error ? (
        <View>
          <Text style={styles.error}>
            {t(`import.${error}` as TranslationKey)}
          </Text>
          <Pressable
            style={styles.button}
            onPress={() => {
              if (error === "github_page") {
                clear();
                setPage(1);
              }
              setRetry((value) => value + 1);
            }}
          >
            <Text style={styles.title}>{t("import.retry")}</Text>
          </Pressable>
        </View>
      ) : (
        ready && (
          <>
            <View style={styles.row}>
              <Pressable
                style={styles.checkbox}
                accessibilityRole="checkbox"
                accessibilityLabel={t("import.selectAll")}
                accessibilityState={{
                  checked: allSelected ? true : chosen.length ? "mixed" : false,
                  disabled: disabled || !selectable.length,
                }}
                disabled={disabled || !selectable.length}
                onPress={() =>
                  setSelected(
                    allSelected
                      ? new Set()
                      : new Set(selectable.map((issue) => issue.number)),
                  )
                }
              >
                <Icon
                  name={
                    allSelected
                      ? "SquareCheck"
                      : chosen.length
                        ? "SquareMinus"
                        : "Square"
                  }
                  size={20}
                  color={colors.foregroundMuted}
                />
              </Pressable>
              <Text style={styles.title}>{t("import.issue")}</Text>
              <Pressable
                style={styles.button}
                accessibilityRole="button"
                accessibilityLabel={t(
                  sort === "desc" ? "import.oldest" : "import.newest",
                )}
                accessibilityState={{ disabled }}
                disabled={disabled}
                onPress={() => {
                  clear();
                  setPage(1);
                  setSort(sort === "desc" ? "asc" : "desc");
                }}
              >
                <Icon
                  name={
                    sort === "desc"
                      ? "ArrowDownWideNarrow"
                      : "ArrowUpWideNarrow"
                  }
                  size={18}
                  color={colors.foreground}
                />
              </Pressable>
            </View>
            <ScrollView style={styles.list}>
              {!data.issues.length && (
                <Text style={styles.secondary}>{t("import.empty")}</Text>
              )}
              {data.issues.map((issue) => {
                const imported = existing.has(issue.number);
                const checked = !imported && selected.has(issue.number);
                return (
                  <Pressable
                    key={issue.number}
                    style={[styles.row, imported && { opacity: 0.4 }]}
                    accessibilityRole="checkbox"
                    accessibilityLabel={t("import.selectIssue", {
                      number: issue.number,
                    })}
                    accessibilityState={{
                      checked,
                      disabled: disabled || imported,
                    }}
                    disabled={disabled || imported}
                    onPress={() =>
                      setSelected((previous) => {
                        const next = new Set(previous);
                        if (next.has(issue.number)) next.delete(issue.number);
                        else next.add(issue.number);
                        return next;
                      })
                    }
                  >
                    <View style={styles.checkbox}>
                      <Icon
                        name={checked ? "SquareCheck" : "Square"}
                        size={20}
                        color={colors.foregroundMuted}
                      />
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={styles.title} numberOfLines={2}>
                        {issue.title}
                      </Text>
                      <Text style={styles.secondary}>
                        {t("import.subtitle", {
                          number: issue.number,
                          author: issue.author,
                          time: relativeTime(issue.createdAt, language),
                        })}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.footer}>
              <Pressable
                style={styles.button}
                accessibilityRole="button"
                accessibilityLabel={t("import.previous")}
                disabled={disabled || page <= 1}
                onPress={() => goTo(page - 1)}
              >
                <Text style={styles.secondary}>{t("import.previous")}</Text>
              </Pressable>
              {props.compact ? (
                <Text style={styles.secondary}>
                  {t("import.page", { page, pages })}
                </Text>
              ) : (
                Array.from(
                  new Set([
                    1,
                    ...[page - 1, page, page + 1].filter(
                      (number) => number > 0 && number <= pages,
                    ),
                    pages,
                  ]),
                )
                  .sort((a, b) => a - b)
                  .map((number) => (
                    <Pressable
                      key={number}
                      style={styles.button}
                      accessibilityRole="button"
                      accessibilityState={{ selected: number === page }}
                      disabled={disabled || page === number}
                      onPress={() => goTo(number)}
                    >
                      <Text
                        style={[
                          styles.title,
                          number === page && { color: colors.accent },
                        ]}
                      >
                        {number}
                      </Text>
                    </Pressable>
                  ))
              )}
              <Pressable
                style={styles.button}
                accessibilityRole="button"
                accessibilityLabel={t("import.next")}
                disabled={disabled || page >= pages}
                onPress={() => goTo(page + 1)}
              >
                <Text style={styles.secondary}>{t("import.next")}</Text>
              </Pressable>
            </View>
          </>
        )
      )}
      {!validLane && <Text style={styles.error}>{t("import.target")}</Text>}
      {(saveError || !props.settingsReady) && (
        <View>
          <Text style={styles.error}>{t("import.error")}</Text>
          {!props.settingsReady && (
            <Pressable
              style={styles.button}
              disabled={saving}
              onPress={async () => {
                if (savingRef.current) return;
                savingRef.current = true;
                setSaving(true);
                await props.reload().catch(() => {});
                savingRef.current = false;
                setSaving(false);
              }}
            >
              <Text style={styles.title}>{t("import.retry")}</Text>
            </Pressable>
          )}
        </View>
      )}
      <View style={[styles.footer, { marginTop: "auto" }]}>
        <Text style={styles.secondary}>
          {t("import.selected", { count: chosen.length })}
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            style={styles.button}
            disabled={saving}
            onPress={props.onClose}
          >
            <Text style={styles.title}>{t("import.cancel")}</Text>
          </Pressable>
          <Pressable
            style={[
              styles.button,
              styles.primary,
              (disabled || !validProject || !validLane || !chosen.length) && {
                opacity: 0.4,
              },
            ]}
            disabled={disabled || !validProject || !validLane || !chosen.length}
            onPress={submit}
          >
            {saving && <ActivityIndicator color={colors.accentForeground} />}
            <Text style={{ color: colors.accentForeground }}>
              {t("import.submit")}
            </Text>
          </Pressable>
        </View>
      </View>
    </BusinessDialog>
  );
}
