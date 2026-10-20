import { useState, useEffect, useMemo, createContext, useContext } from "react";

export type SupportedLanguage = "zh" | "en";

export const I18nLanguageContext = createContext<SupportedLanguage | null>(
  null,
);

export type TranslationParams = Record<
  string,
  string | number | boolean | null | undefined
>;

export const translations = {
  zh: {
    "dispatch.title": "发送到 Agent",
    "dispatch.project": "项目",
    "dispatch.selectProject": "请选择项目。",
    "dispatch.selectWorkspace": "请选择工作区。",
    "dispatch.selectProfile": "请选择 Agent 配置。",
    "dispatch.invalidBranch": "请输入有效的 Git 分支名称。",
    "dispatch.workspace": "工作区",
    "dispatch.newDirectory": "新建普通工作区",
    "dispatch.newWorktree": "新建 worktree",
    "dispatch.branchName": "Git 分支名称",
    "dispatch.profile": "Agent 配置",
    "dispatch.manageProfiles":
      "前往 Paseo 设置中的 Agent 页面管理 Agent 配置。",
    "dispatch.cancel": "取消",
    "dispatch.send": "发送",
    "dispatch.sending": "发送中…",
    "dispatch.defaultPrompt": "请处理以下任务。",
    "dispatch.promptSaved": "prompt 已保存",
    "dispatch.failed": "发送失败，输入已保留，请核实后重试。",
    "import.title": "从 GitHub 导入",
    "import.project": "项目",
    "import.lane": "导入到泳道",
    "import.selectProject": "请选择项目以查看 Issues",
    "import.selected": "已选择 {count} 项",
    "import.submit": "导入",
    "import.cancel": "取消",
    "import.retry": "重试",
    "import.loading": "正在读取 GitHub Issues…",
    "import.empty": "此仓库暂无 Open Issues",
    "import.issue": "Issue",
    "import.selectIssue": "选择 Issue #{number}",
    "import.selectAll": "全选当前页",
    "import.previous": "上一页",
    "import.next": "下一页",
    "import.page": "第 {page} 页，共 {pages} 页",
    "import.oldest": "最早优先",
    "import.newest": "最新优先",
    "import.subtitle": "#{number} · {author} 创建于 {time}",
    "import.created": "创建于 {time}",
    "import.success": "已导入 {count} 个任务",
    "import.error": "导入失败或版本冲突，请核实最新数据后重试。",
    "import.target": "请选择有效项目和普通泳道。",
    "import.project_missing": "项目不存在或不是可读取的 Git 项目。",
    "import.github_origin": "项目的 origin 不是有效的 GitHub.com 仓库。",
    "import.gh_missing": "Paseo daemon 所在机器未安装 gh。",
    "import.github_auth": "请在 Paseo daemon 所在机器使用 gh 登录 GitHub。",
    "import.github_access":
      "无法访问 GitHub 仓库，请检查 gh 登录账号和仓库权限。",
    "import.github_network": "读取 GitHub 失败，请检查网络后重试。",
    "import.github_page": "Issue 分页已变化，请重新加载。",
    "external.open": "在浏览器打开 Issue",
    "external.failed": "无法打开外部链接，请重试。",
    "notification.taskCreated": "任务已创建",
    "notification.taskUpdated": "任务已更新",
    "notification.taskDeleted": "任务已删除",
    "notification.laneCreated": "泳道已创建",
    "notification.laneRenamed": "泳道已重命名",
    "notification.laneDeleted": "泳道已删除",
    "notification.taskSaveFailed": "任务保存失败，草稿已保留，请核实最新数据。",
    "notification.taskDeleteFailed": "任务删除失败，请核实最新数据。",
    "notification.laneSaveFailed": "泳道保存失败，草稿已保留，请核实最新数据。",
    "notification.laneDeleteFailed": "泳道删除失败，请核实最新数据。",
    "notification.taskReorderFailed": "任务移动失败，请刷新最新数据后重试。",
    "notification.taskCompletionFailed":
      "任务完成状态保存失败，请核实最新状态。",
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
    "lane.emptyHint": "暂无卡片，可点击右上角添加或拖动卡片至此",
    "lane.emptyCompletionHint": "暂无已完成任务，可勾选任务或将卡片拖入此泳道",
    "card.completeTask": "完成任务：{title}",
    "card.reopenTask": "取消完成：{title}",
    "card.dragHandle": "拖动手柄",
    "card.subtasksCount": "子步骤 {completed}/{total}",
    "laneManagement.title": "管理泳道",
    "laneManagement.close": "关闭",
    "laneManagement.add": "＋ 添加泳道",
    "laneManagement.confirm": "确认",
    "laneManagement.rename": "重命名 {title}",
    "laneManagement.empty": "泳道名称不能为空",
    "laneManagement.duplicate": "泳道名称不可重复",
    "laneManagement.reorder": "拖动排序 {title}",
    "laneManagement.left": "左移 {title}",
    "laneManagement.right": "右移 {title}",
    "laneManagement.delete": "删除 {title}",
    "laneManagement.saveOrder": "保存顺序",
    "laneManagement.restoreOrder": "还原顺序",
    "laneManagement.orderPending":
      "请先保存或还原顺序，再添加、重命名或删除泳道。",
    "laneManagement.orderSaved": "泳道顺序已保存",
    "laneManagement.deleteTitle": "删除泳道？",
    "laneManagement.deletePrompt":
      "该泳道及其中所有项目的未完成任务将被删除，已完成任务会保留。",
    "laneManagement.confirmDelete": "删除泳道",
    "laneManagement.completion": "完成泳道 · 固定",
    "laneManagement.conflict":
      "泳道已被其他窗口修改，草稿已保留。请放弃当前修改并加载最新。",
    "laneManagement.reload": "放弃修改并加载最新",
    "laneModal.titleEdit": "管理泳道",
    "laneModal.titleCreate": "新增泳道",
    "laneModal.nameLabel": "泳道名称 *",
    "laneModal.namePlaceholder": "例如：待测试、发布中...",
    "laneModal.cannotDeleteLast":
      "看板必须至少保留一条普通泳道，无法删除此泳道。",
    "laneModal.cannotDeleteCompletion": "完成泳道不可删除，可以修改名称。",
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
    "dispatch.title": "Send to Agent",
    "dispatch.project": "Project",
    "dispatch.selectProject": "Select a project.",
    "dispatch.selectWorkspace": "Select a workspace.",
    "dispatch.selectProfile": "Select an Agent profile.",
    "dispatch.invalidBranch": "Enter a valid Git branch name.",
    "dispatch.workspace": "Workspace",
    "dispatch.newDirectory": "New regular workspace",
    "dispatch.newWorktree": "New worktree",
    "dispatch.branchName": "Git branch name",
    "dispatch.profile": "Agent profile",
    "dispatch.manageProfiles":
      "Manage Agent profiles on the Agent page in Paseo settings.",
    "dispatch.cancel": "Cancel",
    "dispatch.send": "Send",
    "dispatch.sending": "Sending…",
    "dispatch.defaultPrompt": "Please work on the following task.",
    "dispatch.promptSaved": "prompt saved",
    "dispatch.failed":
      "Sending failed. Your input is preserved; check before retrying.",
    "import.title": "Import from GitHub",
    "import.project": "Project",
    "import.lane": "Import to lane",
    "import.selectProject": "Select a project to view issues",
    "import.selected": "{count} selected",
    "import.submit": "Import",
    "import.cancel": "Cancel",
    "import.retry": "Retry",
    "import.loading": "Loading GitHub issues…",
    "import.empty": "No open issues in this repository",
    "import.issue": "Issue",
    "import.selectIssue": "Select Issue #{number}",
    "import.selectAll": "Select all on this page",
    "import.previous": "Previous page",
    "import.next": "Next page",
    "import.page": "Page {page} of {pages}",
    "import.oldest": "Oldest first",
    "import.newest": "Newest first",
    "import.subtitle": "#{number} · {author} opened {time}",
    "import.created": "Created at {time}",
    "import.success": "Imported {count} tasks",
    "import.error":
      "Import failed or version conflict. Check the latest board and retry.",
    "import.target": "Select a valid project and ordinary lane.",
    "import.project_missing":
      "The project is missing or is not a readable Git project.",
    "import.github_origin":
      "The project's origin is not a valid GitHub.com repository.",
    "import.gh_missing": "gh is not installed on the Paseo daemon machine.",
    "import.github_auth":
      "Sign in to GitHub using gh on the Paseo daemon machine.",
    "import.github_access":
      "Cannot access the GitHub repository. Check the gh account and repository permissions.",
    "import.github_network":
      "Could not read GitHub. Check the network and retry.",
    "import.github_page": "Issue pagination changed. Reload the list.",
    "external.open": "Open Issue in browser",
    "external.failed": "Could not open the external link. Please retry.",
    "notification.taskCreated": "Task created",
    "notification.taskUpdated": "Task updated",
    "notification.taskDeleted": "Task deleted",
    "notification.laneCreated": "Lane created",
    "notification.laneRenamed": "Lane renamed",
    "notification.laneDeleted": "Lane deleted",
    "notification.taskSaveFailed":
      "Task save failed. Draft preserved; check the latest data.",
    "notification.taskDeleteFailed":
      "Task deletion failed. Check the latest data.",
    "notification.laneSaveFailed":
      "Lane save failed. Draft preserved; check the latest data.",
    "notification.laneDeleteFailed":
      "Lane deletion failed. Check the latest data.",
    "notification.taskReorderFailed":
      "Task move failed. Refresh the latest data and try again.",
    "notification.taskCompletionFailed":
      "Task completion change failed. Check the latest state.",
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
    "lane.emptyHint":
      "No cards yet. Click '+' in the top right or drag cards here.",
    "lane.emptyCompletionHint":
      "No completed tasks. Check a task or drag it into this lane.",
    "card.completeTask": "Mark {title} complete",
    "card.reopenTask": "Mark {title} incomplete",
    "card.dragHandle": "Drag handle",
    "card.subtasksCount": "Subtasks {completed}/{total}",
    "laneManagement.title": "Manage lanes",
    "laneManagement.close": "Close",
    "laneManagement.add": "+ Add lane",
    "laneManagement.confirm": "Confirm",
    "laneManagement.rename": "Rename {title}",
    "laneManagement.empty": "Lane name cannot be empty",
    "laneManagement.duplicate": "Lane names must be unique",
    "laneManagement.reorder": "Reorder {title}",
    "laneManagement.left": "Move {title} left",
    "laneManagement.right": "Move {title} right",
    "laneManagement.delete": "Delete {title}",
    "laneManagement.saveOrder": "Save order",
    "laneManagement.restoreOrder": "Restore order",
    "laneManagement.orderPending":
      "Save or restore the order before adding, renaming or deleting lanes.",
    "laneManagement.orderSaved": "Lane order saved",
    "laneManagement.deleteTitle": "Delete lane?",
    "laneManagement.deletePrompt":
      "This lane and its unfinished tasks across all projects will be deleted. Completed tasks will be kept.",
    "laneManagement.confirmDelete": "Delete lane",
    "laneManagement.completion": "Completion lane · Fixed",
    "laneManagement.conflict":
      "Lanes changed in another window. Draft preserved. Discard changes and load latest to continue.",
    "laneManagement.reload": "Discard changes and load latest",
    "laneModal.titleEdit": "Manage Lane",
    "laneModal.titleCreate": "Add Lane",
    "laneModal.nameLabel": "Lane Name *",
    "laneModal.namePlaceholder": "e.g., Testing, In Review...",
    "laneModal.cannotDeleteLast":
      "A kanban board must retain at least one ordinary lane. Cannot delete this lane.",
    "laneModal.cannotDeleteCompletion":
      "The completion lane cannot be deleted. You can rename it.",
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
    languages?: readonly string[];
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

  // Match Paseo's web system-language source before page/Intl defaults.
  const navLocale = env.navigator?.languages?.[0] || env.navigator?.language;
  if (navLocale) {
    return normalizeLanguage(navLocale);
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
  const inheritedLanguage = useContext(I18nLanguageContext);
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

  const language = hostLocale ? lang : (inheritedLanguage ?? lang);
  const tBound = useMemo(
    () => (key: TranslationKey, params?: TranslationParams) =>
      t(key, language, params),
    [language],
  );

  return {
    language,
    t: tBound,
  };
}
