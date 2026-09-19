import { useState, useEffect, useMemo } from "react";

export type SupportedLanguage = "zh" | "en";

export type TranslationParams = Record<
  string,
  string | number | boolean | null | undefined
>;

export const translations = {
  zh: {
    "kanban.sidebarTitle": "看板",
    "kanban.title": "任务看板",
    "kanban.loading": "正在加载看板数据...",
    "kanban.stats": "{tasks} 任务 · {lanes} 泳道",
    "kanban.addLane": "+ 新增泳道",
    "kanban.newTask": "+ 新建任务",
    "kanban.refresh": "刷新最新数据",
    "kanban.loadError": "加载看板配置失败：{error}",
    "kanban.formatError": "看板配置格式异常：{error}",
    "kanban.formatErrorHint":
      "数据未被悄悄覆盖。若需使用默认结构可重置，或重试加载。",
    "kanban.retryLoad": "重试加载",
    "kanban.resetDefault": "重置为默认结构",
    "kanban.saveFailed": "保存失败：{error}",
    "kanban.conflictError": "保存冲突或错误：{error}",
    "kanban.filterLabel": "项目筛选:",
    "kanban.filterAll": "全部",
    "kanban.filterUnassigned": "未关联项目",
    "kanban.projectsError": "(项目列表更新受限)",
    "lane.add": "+ 添加",
    "lane.manage": "管理",
    "lane.emptyHint": "暂无卡片，可点击右上角添加或拖动卡片至此",
    "card.dragHandle": "拖动手柄",
    "card.subtasksCount": "子步骤 {completed}/{total}",
    "laneModal.titleEdit": "管理泳道",
    "laneModal.titleCreate": "新增泳道",
    "laneModal.nameLabel": "泳道名称 *",
    "laneModal.namePlaceholder": "例如：待测试、发布中...",
    "laneModal.cannotDeleteLast": "看板必须至少保留一条泳道，无法删除此泳道。",
    "laneModal.cannotDeleteHasTasks":
      "此泳道当前包含 {count} 个任务，需清空或移走任务后方可删除。",
    "laneModal.deleteLane": "删除此泳道",
    "laneModal.confirmDeletePrompt": "确认删除？",
    "laneModal.confirmDelete": "确认删除",
    "laneModal.cancel": "取消",
    "laneModal.saving": "保存中...",
    "laneModal.saveChanges": "保存修改",
    "laneModal.submitCreate": "添加泳道",
    "taskModal.titleEdit": "编辑任务",
    "taskModal.titleCreate": "创建任务",
    "taskModal.titleLabel": "任务标题 *",
    "taskModal.titlePlaceholder": "输入任务标题",
    "taskModal.laneLabel": "所属泳道",
    "taskModal.projectLabel": "关联项目",
    "taskModal.noProject": "未关联项目",
    "taskModal.descLabel": "描述",
    "taskModal.descPlaceholder": "可选的任务补充描述...",
    "taskModal.subtasksLabel": "子步骤 ({completed}/{total})",
    "taskModal.subtaskPlaceholder": "子步骤内容",
    "taskModal.newSubtaskPlaceholder": "添加新的子步骤...",
    "taskModal.addStep": "添加步骤",
    "taskModal.deleteTask": "删除此任务",
    "taskModal.confirmDeletePrompt": "确定删除？",
    "taskModal.confirmDelete": "确认删除",
    "taskModal.cancel": "取消",
    "taskModal.saving": "保存中...",
    "taskModal.saveChanges": "保存修改",
    "taskModal.submitCreate": "创建",
  },
  en: {
    "kanban.sidebarTitle": "Kanban",
    "kanban.title": "Task Kanban",
    "kanban.loading": "Loading kanban board data...",
    "kanban.stats": "{tasks} tasks · {lanes} lanes",
    "kanban.addLane": "+ Add Lane",
    "kanban.newTask": "+ New Task",
    "kanban.refresh": "Refresh latest data",
    "kanban.loadError": "Failed to load kanban settings: {error}",
    "kanban.formatError": "Kanban settings format error: {error}",
    "kanban.formatErrorHint":
      "Data was not silently overwritten. Reset to default structure if needed, or retry loading.",
    "kanban.retryLoad": "Retry Loading",
    "kanban.resetDefault": "Reset to Default",
    "kanban.saveFailed": "Save failed: {error}",
    "kanban.conflictError": "Save conflict or error: {error}",
    "kanban.filterLabel": "Project Filter:",
    "kanban.filterAll": "All",
    "kanban.filterUnassigned": "No Project",
    "kanban.projectsError": "(Project list update restricted)",
    "lane.add": "+ Add",
    "lane.manage": "Manage",
    "lane.emptyHint":
      "No cards yet. Click '+' in the top right or drag cards here.",
    "card.dragHandle": "Drag handle",
    "card.subtasksCount": "Subtasks {completed}/{total}",
    "laneModal.titleEdit": "Manage Lane",
    "laneModal.titleCreate": "Add Lane",
    "laneModal.nameLabel": "Lane Name *",
    "laneModal.namePlaceholder": "e.g., Testing, In Review...",
    "laneModal.cannotDeleteLast":
      "A kanban board must retain at least one lane. Cannot delete this lane.",
    "laneModal.cannotDeleteHasTasks":
      "This lane currently contains {count} tasks. Clear or move tasks before deleting.",
    "laneModal.deleteLane": "Delete Lane",
    "laneModal.confirmDeletePrompt": "Confirm delete?",
    "laneModal.confirmDelete": "Confirm Delete",
    "laneModal.cancel": "Cancel",
    "laneModal.saving": "Saving...",
    "laneModal.saveChanges": "Save Changes",
    "laneModal.submitCreate": "Add Lane",
    "taskModal.titleEdit": "Edit Task",
    "taskModal.titleCreate": "Create Task",
    "taskModal.titleLabel": "Task Title *",
    "taskModal.titlePlaceholder": "Enter task title",
    "taskModal.laneLabel": "Lane",
    "taskModal.projectLabel": "Associated Project",
    "taskModal.noProject": "No Project",
    "taskModal.descLabel": "Description",
    "taskModal.descPlaceholder": "Optional task description...",
    "taskModal.subtasksLabel": "Subtasks ({completed}/{total})",
    "taskModal.subtaskPlaceholder": "Subtask content",
    "taskModal.newSubtaskPlaceholder": "Add a new subtask...",
    "taskModal.addStep": "Add Step",
    "taskModal.deleteTask": "Delete Task",
    "taskModal.confirmDeletePrompt": "Confirm delete?",
    "taskModal.confirmDelete": "Confirm Delete",
    "taskModal.cancel": "Cancel",
    "taskModal.saving": "Saving...",
    "taskModal.saveChanges": "Save Changes",
    "taskModal.submitCreate": "Create",
  },
} as const;

export type TranslationKey = keyof typeof translations.zh;

export function normalizeLanguage(locale?: string | null): SupportedLanguage {
  if (!locale) return "en";
  return locale.trim().toLowerCase().startsWith("zh") ? "zh" : "en";
}

let languageOverride: SupportedLanguage | null = null;

export function setLanguageOverride(lang: SupportedLanguage | null): void {
  languageOverride = lang;
  notifyLanguageChange();
}

export function getLanguageOverride(): SupportedLanguage | null {
  return languageOverride;
}

export interface DetectLanguageOptions {
  locale?: string;
  language?: string;
  host?: {
    id?: string;
    label?: string;
    locale?: string;
    language?: string;
  };
}

interface EnvironmentGlobals {
  localStorage?: {
    getItem(key: string): string | null;
  };
  document?: {
    documentElement?: {
      lang?: string;
    };
  };
  navigator?: {
    language?: string;
  };
  window?: {
    addEventListener(
      event: string,
      listener: (event: { key?: string }) => void,
    ): void;
  };
  i18n?: {
    language?: string;
  };
}

const env = globalThis as typeof globalThis & EnvironmentGlobals;

export function detectPaseoLanguage(
  hostProps?: DetectLanguageOptions,
): SupportedLanguage {
  if (languageOverride) {
    return languageOverride;
  }

  const propLocale =
    hostProps?.locale ??
    hostProps?.language ??
    hostProps?.host?.locale ??
    hostProps?.host?.language;
  if (propLocale && propLocale !== "system") {
    return normalizeLanguage(propLocale);
  }

  if (env.localStorage) {
    try {
      const raw = env.localStorage.getItem("@paseo:app-settings");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.language && parsed.language !== "system") {
          return normalizeLanguage(parsed.language);
        }
      }
    } catch {}
  }

  const docLang = env.document?.documentElement?.lang;
  if (docLang) {
    return normalizeLanguage(docLang);
  }

  const i18nLang = env.i18n?.language;
  if (i18nLang) {
    return normalizeLanguage(i18nLang);
  }

  const intlLocale =
    typeof Intl?.DateTimeFormat === "function"
      ? Intl.DateTimeFormat().resolvedOptions().locale
      : undefined;
  if (intlLocale) {
    return normalizeLanguage(intlLocale);
  }

  const navLocale = env.navigator?.language;
  if (navLocale) {
    return normalizeLanguage(navLocale);
  }

  return "en";
}

let currentLanguage: SupportedLanguage = detectPaseoLanguage();
const listeners = new Set<(lang: SupportedLanguage) => void>();
let globalListenersInitialized = false;

function notifyLanguageChange() {
  const next = detectPaseoLanguage();
  if (next !== currentLanguage) {
    currentLanguage = next;
    listeners.forEach((fn) => fn(currentLanguage));
  }
}

function ensureGlobalListeners() {
  if (globalListenersInitialized) return;
  globalListenersInitialized = true;

  env.window?.addEventListener("storage", (e) => {
    if (e.key === "@paseo:app-settings") {
      notifyLanguageChange();
    }
  });

  env.window?.addEventListener("focus", () => {
    notifyLanguageChange();
  });
}

export function getLanguage(
  hostProps?: DetectLanguageOptions,
): SupportedLanguage {
  if (hostProps) {
    return detectPaseoLanguage(hostProps);
  }
  return currentLanguage;
}

export function subscribeLanguage(
  listener: (lang: SupportedLanguage) => void,
): () => void {
  listeners.add(listener);
  ensureGlobalListeners();
  return () => {
    listeners.delete(listener);
  };
}

export function formatString(
  template: string,
  params?: TranslationParams,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return params[key] != null ? String(params[key]) : match;
  });
}

export function t(
  key: TranslationKey,
  langOrParams?: SupportedLanguage | TranslationParams,
  params?: TranslationParams,
): string {
  let lang: SupportedLanguage;
  let finalParams: TranslationParams | undefined;

  if (typeof langOrParams === "string") {
    lang = langOrParams;
    finalParams = params;
  } else {
    lang = currentLanguage;
    finalParams = langOrParams;
  }

  const dict = translations[lang] ?? translations.en;
  const raw = dict[key] ?? translations.en[key] ?? key;
  return formatString(raw, finalParams);
}

export interface I18nContextValue {
  language: SupportedLanguage;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

export function useI18n(hostProps?: DetectLanguageOptions): I18nContextValue {
  const hostLocale =
    hostProps?.locale ??
    hostProps?.language ??
    hostProps?.host?.locale ??
    hostProps?.host?.language;
  const [lang, setLang] = useState<SupportedLanguage>(() =>
    detectPaseoLanguage(hostProps),
  );

  useEffect(() => {
    ensureGlobalListeners();
    const immediate = detectPaseoLanguage(hostProps);
    setLang((prev) => (immediate !== prev ? immediate : prev));
    return subscribeLanguage((newLang) => {
      setLang(newLang);
    });
  }, [hostLocale, hostProps]);

  const tBound = useMemo(
    () => (key: TranslationKey, params?: TranslationParams) =>
      t(key, lang, params),
    [lang],
  );

  return {
    language: lang,
    t: tBound,
  };
}
