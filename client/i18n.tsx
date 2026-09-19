import * as React from "react";
import { useState, useEffect, useMemo } from "react";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";

export type SupportedLanguage = "zh" | "en";

export type TranslationParams = Record<string, string | number | boolean | null | undefined>;

export const translations = {
  zh: {
    // General & Navigation
    "kanban.sidebarTitle": "看板",
    "kanban.title": "任务看板",
    "kanban.loading": "正在加载看板数据...",
    "kanban.stats": "{tasks} 任务 · {lanes} 泳道",
    "kanban.addLane": "+ 新增泳道",
    "kanban.newTask": "+ 新建任务",
    "kanban.refresh": "刷新最新数据",

    // Error & Recovery States
    "kanban.loadError": "加载看板配置失败：{error}",
    "kanban.formatError": "看板配置格式异常：{error}",
    "kanban.formatErrorHint": "数据未被悄悄覆盖。若需使用默认结构可重置，或重试加载。",
    "kanban.retryLoad": "重试加载",
    "kanban.resetDefault": "重置为默认结构",
    "kanban.saveFailed": "保存失败：{error}",
    "kanban.conflictError": "保存冲突或错误：{error}",

    // Project Filter
    "kanban.filterLabel": "项目筛选:",
    "kanban.filterAll": "全部",
    "kanban.filterUnassigned": "未关联项目",
    "kanban.projectsError": "(项目列表更新受限)",

    // Kanban Lane
    "lane.add": "+ 添加",
    "lane.manage": "管理",
    "lane.emptyHint": "暂无卡片，可点击右上角添加或拖动卡片至此",

    // Kanban Card
    "card.dragHandle": "拖动手柄",
    "card.subtasksCount": "子步骤 {completed}/{total}",

    // Lane Modal
    "laneModal.titleEdit": "管理泳道",
    "laneModal.titleCreate": "新增泳道",
    "laneModal.nameLabel": "泳道名称 *",
    "laneModal.namePlaceholder": "例如：待测试、发布中...",
    "laneModal.cannotDeleteLast": "看板必须至少保留一条泳道，无法删除此泳道。",
    "laneModal.cannotDeleteHasTasks": "此泳道当前包含 {count} 个任务，需清空或移走任务后方可删除。",
    "laneModal.deleteLane": "删除此泳道",
    "laneModal.confirmDeletePrompt": "确认删除？",
    "laneModal.confirmDelete": "确认删除",
    "laneModal.cancel": "取消",
    "laneModal.saving": "保存中...",
    "laneModal.saveChanges": "保存修改",
    "laneModal.submitCreate": "添加泳道",

    // Task Modal
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
    // General & Navigation
    "kanban.sidebarTitle": "Kanban",
    "kanban.title": "Task Kanban",
    "kanban.loading": "Loading kanban board data...",
    "kanban.stats": "{tasks} tasks · {lanes} lanes",
    "kanban.addLane": "+ Add Lane",
    "kanban.newTask": "+ New Task",
    "kanban.refresh": "Refresh latest data",

    // Error & Recovery States
    "kanban.loadError": "Failed to load kanban settings: {error}",
    "kanban.formatError": "Kanban settings format error: {error}",
    "kanban.formatErrorHint": "Data was not silently overwritten. Reset to default structure if needed, or retry loading.",
    "kanban.retryLoad": "Retry Loading",
    "kanban.resetDefault": "Reset to Default",
    "kanban.saveFailed": "Save failed: {error}",
    "kanban.conflictError": "Save conflict or error: {error}",

    // Project Filter
    "kanban.filterLabel": "Project Filter:",
    "kanban.filterAll": "All",
    "kanban.filterUnassigned": "No Project",
    "kanban.projectsError": "(Project list update restricted)",

    // Kanban Lane
    "lane.add": "+ Add",
    "lane.manage": "Manage",
    "lane.emptyHint": "No cards yet. Click '+' in the top right or drag cards here.",

    // Kanban Card
    "card.dragHandle": "Drag handle",
    "card.subtasksCount": "Subtasks {completed}/{total}",

    // Lane Modal
    "laneModal.titleEdit": "Manage Lane",
    "laneModal.titleCreate": "Add Lane",
    "laneModal.nameLabel": "Lane Name *",
    "laneModal.namePlaceholder": "e.g., Testing, In Review...",
    "laneModal.cannotDeleteLast": "A kanban board must retain at least one lane. Cannot delete this lane.",
    "laneModal.cannotDeleteHasTasks": "This lane currently contains {count} tasks. Clear or move tasks before deleting.",
    "laneModal.deleteLane": "Delete Lane",
    "laneModal.confirmDeletePrompt": "Confirm delete?",
    "laneModal.confirmDelete": "Confirm Delete",
    "laneModal.cancel": "Cancel",
    "laneModal.saving": "Saving...",
    "laneModal.saveChanges": "Save Changes",
    "laneModal.submitCreate": "Add Lane",

    // Task Modal
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

/**
 * Normalizes any locale string into supported languages.
 * - Chinese: "zh", "zh-CN", "zh-TW", "zh-HK", "zh-Hans", "zh-Hant", "zh-SG", etc. -> "zh"
 * - All other languages: "en", "ja", "ko", "es", "fr", "ru", "de", etc. -> "en"
 */
export function normalizeLanguage(locale?: string | null): SupportedLanguage {
  if (!locale || typeof locale !== "string") return "en";
  const trimmed = locale.trim().toLowerCase();
  if (trimmed.startsWith("zh")) {
    return "zh";
  }
  return "en";
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
  layout?: {
    compact?: boolean;
    platform?: "ios" | "android" | "web";
  };
}

interface BrowserGlobals {
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
    languages?: readonly string[];
  };
  window?: {
    addEventListener(event: string, listener: (event?: unknown) => void): void;
    removeEventListener?(event: string, listener: (event?: unknown) => void): void;
  };
  MutationObserver?: {
    new (callback: () => void): {
      observe(target: unknown, options: { attributes: boolean; attributeFilter: string[] }): void;
      disconnect(): void;
    };
  };
  i18n?: {
    language?: string;
  };
}

function getBrowserGlobals(): BrowserGlobals | undefined {
  if (typeof globalThis !== "undefined") {
    return globalThis as unknown as BrowserGlobals;
  }
  return undefined;
}

/**
 * Detects Paseo system language across multiple sources:
 * 1. Manual override (if set)
 * 2. Host props (e.g. host.locale or host.language)
 * 3. Paseo app setting persisted in localStorage ("@paseo:app-settings")
 * 4. Document element language attribute (document.documentElement.lang)
 * 5. Global i18n instance (globalThis.i18n?.language)
 * 6. Standard Intl / navigator locale
 */
export function detectPaseoLanguage(hostProps?: DetectLanguageOptions): SupportedLanguage {
  if (languageOverride) {
    return languageOverride;
  }

  // Check props passed from Paseo
  if (hostProps) {
    const propLocale =
      hostProps.locale ??
      hostProps.language ??
      hostProps.host?.locale ??
      hostProps.host?.language;
    if (propLocale && typeof propLocale === "string" && propLocale !== "system") {
      return normalizeLanguage(propLocale);
    }
  }

  const globals = getBrowserGlobals();

  // Check Paseo app settings in localStorage (Paseo Web / Desktop Electron)
  if (globals?.localStorage) {
    try {
      const raw = globals.localStorage.getItem("@paseo:app-settings");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          parsed &&
          typeof parsed.language === "string" &&
          parsed.language !== "system"
        ) {
          return normalizeLanguage(parsed.language);
        }
      }
    } catch {
      // Ignore storage read/parse error
    }
  }

  // Check HTML document lang attribute
  if (globals?.document?.documentElement?.lang) {
    const docLang = globals.document.documentElement.lang;
    if (docLang && typeof docLang === "string") {
      return normalizeLanguage(docLang);
    }
  }

  // Check global i18n object if Paseo exposes it
  if (globals?.i18n?.language) {
    const i18nLang = globals.i18n.language;
    if (i18nLang && typeof i18nLang === "string") {
      return normalizeLanguage(i18nLang);
    }
  }

  // Check standard Intl locale
  if (typeof Intl !== "undefined" && typeof Intl.DateTimeFormat === "function") {
    try {
      const intlLocale = Intl.DateTimeFormat().resolvedOptions().locale;
      if (intlLocale) {
        return normalizeLanguage(intlLocale);
      }
    } catch {
      // Ignore Intl errors
    }
  }

  // Check navigator language
  if (globals?.navigator) {
    const navLocale =
      globals.navigator.language ||
      (globals.navigator.languages && globals.navigator.languages[0]);
    if (navLocale) {
      return normalizeLanguage(navLocale);
    }
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
  const globals = getBrowserGlobals();
  if (!globals?.window) return;

  globalListenersInitialized = true;

  // Listen to cross-window storage events (e.g. Paseo settings changed in another window)
  globals.window.addEventListener("storage", (e: unknown) => {
    const storageEvent = e as { key?: string } | undefined;
    if (storageEvent?.key === "@paseo:app-settings") {
      notifyLanguageChange();
    }
  });

  // Re-check when window gains focus
  globals.window.addEventListener("focus", () => {
    notifyLanguageChange();
  });

  // Observe document lang attribute changes if MutationObserver is available
  if (globals.MutationObserver && globals.document?.documentElement) {
    const observer = new globals.MutationObserver(() => {
      notifyLanguageChange();
    });
    observer.observe(globals.document.documentElement, {
      attributes: true,
      attributeFilter: ["lang"],
    });
  }

  // Periodic fallback check (every 1.5 seconds) for in-window updates
  setInterval(() => {
    notifyLanguageChange();
  }, 1500);
}

export function getLanguage(hostProps?: DetectLanguageOptions): SupportedLanguage {
  if (hostProps) {
    return detectPaseoLanguage(hostProps);
  }
  return currentLanguage;
}

export function subscribeLanguage(listener: (lang: SupportedLanguage) => void): () => void {
  listeners.add(listener);
  ensureGlobalListeners();
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Format string with parameter interpolation.
 */
export function formatString(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return key in params && params[key] !== null && params[key] !== undefined
      ? String(params[key])
      : match;
  });
}

/**
 * Translate a key given a target language or default detected language.
 */
export function t(
  key: TranslationKey,
  langOrParams?: SupportedLanguage | TranslationParams,
  params?: TranslationParams
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

export const I18nContext =
  typeof React.createContext === "function"
    ? React.createContext<I18nContextValue | null>(null)
    : null;

export function useI18n(hostProps?: DetectLanguageOptions): I18nContextValue {
  const context =
    I18nContext && typeof React.useContext === "function"
      ? React.useContext(I18nContext)
      : null;

  const [lang, setLang] = useState<SupportedLanguage>(() => {
    return context ? context.language : detectPaseoLanguage(hostProps);
  });

  useEffect(() => {
    if (context) return;
    ensureGlobalListeners();
    const immediate = detectPaseoLanguage(hostProps);
    if (immediate !== lang) {
      setLang(immediate);
    }
    return subscribeLanguage((newLang) => {
      setLang(newLang);
    });
  }, [context, hostProps?.host?.language, hostProps?.locale, hostProps?.language]);

  const activeLang = context ? context.language : lang;

  const tBound = useMemo(
    () => (key: TranslationKey, params?: TranslationParams) => t(key, activeLang, params),
    [activeLang]
  );

  return {
    language: activeLang,
    t: tBound,
  };
}
