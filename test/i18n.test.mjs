import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import {
  openTaskSession,
  openLaneSession,
  executeTaskReorder,
} from "../client/kanban-session.ts";

const require = createRequire(import.meta.url);

// Transpile and load client/i18n.tsx
const source = ts.transpileModule(
  readFileSync(new URL("../client/i18n.tsx", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText;

const i18n = {};
new Function("require", "exports", source)((id) => {
  if (id === "react") return require("react");
  return require(id);
}, i18n);

const {
  normalizeLanguage,
  detectPaseoLanguage,
  translations,
  t,
  formatString,
  getLanguage,
  setLanguageOverride,
  subscribeLanguage,
} = i18n;

test("normalizeLanguage: 准确将各类中文标头归一化为 zh", () => {
  const zhVariants = [
    "zh",
    "zh-CN",
    "zh-TW",
    "zh-Hans",
    "zh-Hant",
    "  ZH-cn  ",
  ];

  for (const variant of zhVariants) {
    assert.equal(
      normalizeLanguage(variant),
      "zh",
      `Expected ${variant} to normalize to 'zh'`,
    );
  }
});

test("normalizeLanguage: 其他所有语言均回退归一化为 en", () => {
  const otherLanguages = ["en", "en-US", "ja", "fr", "", null, undefined];

  for (const lang of otherLanguages) {
    assert.equal(
      normalizeLanguage(lang),
      "en",
      `Expected ${lang} to normalize to 'en'`,
    );
  }
});

test("translations: zh 与 en 词条键完整对齐且无遗漏", () => {
  const zhKeys = Object.keys(translations.zh).sort();
  const enKeys = Object.keys(translations.en).sort();

  assert.deepEqual(
    zhKeys,
    enKeys,
    "zh and en dictionaries must have identical translation keys",
  );
});

test("formatString & t: 文本翻译与参数插值正确工作", () => {
  assert.equal(formatString("Hello {name}", { name: "Paseo" }), "Hello Paseo");

  // Chinese
  assert.equal(t("kanban.title", "zh"), "任务看板");
  assert.equal(t("kanban.sidebarTitle", "zh"), "看板");
  assert.equal(
    t("kanban.stats", "zh", { tasks: 12, lanes: 4 }),
    "12 任务 · 4 泳道",
  );
  // English
  assert.equal(t("kanban.title", "en"), "Task Kanban");
  assert.equal(t("kanban.sidebarTitle", "en"), "Kanban");
  assert.equal(
    t("kanban.stats", "en", { tasks: 12, lanes: 4 }),
    "12 tasks · 4 lanes",
  );
});

test("detectPaseoLanguage: 读取宿主传入的语言属性", () => {
  assert.equal(detectPaseoLanguage({ locale: "zh-CN" }), "zh");
  assert.equal(detectPaseoLanguage({ language: "zh-TW" }), "zh");
  assert.equal(detectPaseoLanguage({ host: { locale: "zh-HK" } }), "zh");
  assert.equal(detectPaseoLanguage({ host: { language: "zh-SG" } }), "zh");
  assert.equal(detectPaseoLanguage({ locale: "en-US" }), "en");
});

test("detectPaseoLanguage: 支持从 @paseo:app-settings 存储读取系统语言配置", () => {
  try {
    // Mock localStorage
    const store = new Map();
    globalThis.localStorage = {
      getItem(key) {
        return store.get(key) ?? null;
      },
      setItem(key, val) {
        store.set(key, val);
      },
    };

    // User selected Simplified Chinese in Paseo
    store.set("@paseo:app-settings", JSON.stringify({ language: "zh-CN" }));
    assert.equal(detectPaseoLanguage(), "zh");

    // User selected English in Paseo
    store.set("@paseo:app-settings", JSON.stringify({ language: "en" }));
    assert.equal(detectPaseoLanguage(), "en");

    // User selected 'system' -> falls through to document/Intl
    store.set("@paseo:app-settings", JSON.stringify({ language: "system" }));
    globalThis.document = { documentElement: { lang: "zh-TW" } };
    assert.equal(detectPaseoLanguage(), "zh");

    globalThis.document = { documentElement: { lang: "en-US" } };
    assert.equal(detectPaseoLanguage(), "en");
  } finally {
    delete globalThis.localStorage;
    delete globalThis.document;
  }
});

test("setLanguageOverride & subscribeLanguage: 动态切换与订阅响应闭环", () => {
  const events = [];
  const unsubscribe = subscribeLanguage((lang) => {
    events.push(lang);
  });

  setLanguageOverride("en");
  assert.equal(getLanguage(), "en");
  assert.equal(t("kanban.title"), "Task Kanban");

  setLanguageOverride("zh");
  assert.equal(getLanguage(), "zh");
  assert.equal(t("kanban.title"), "任务看板");
  assert.ok(events.includes("zh"), "语言切换须通知订阅方");

  // Restore override
  setLanguageOverride(null);
  unsubscribe();
});

test("kanban-session: 国际化错误信息在英文与中文模式下正确产出", async () => {
  const baseBoard = {
    lanes: [
      { id: "to-plan", title: "待规划" },
      { id: "done", title: "已完成" },
    ],
    tasks: [
      {
        id: "t1",
        title: "Task 1",
        laneId: "to-plan",
        description: "",
        subtasks: [],
      },
    ],
  };

  // 1. English Mode Task Session
  const enTaskSession = openTaskSession({
    mode: "create",
    baseBoard,
    baseRevision: "rev-1",
    save: async () => true,
    language: "en",
  });

  const emptyTitleRes = await enTaskSession.save({
    title: "   ",
    laneId: "to-plan",
  });
  assert.equal(emptyTitleRes.success, false);
  assert.equal(emptyTitleRes.error, "Task title cannot be empty");

  const emptySubtaskOk = enTaskSession.addSubtask("   ");
  assert.equal(emptySubtaskOk, false);
  assert.equal(
    enTaskSession.getSnapshot().error,
    "Subtask content cannot be empty",
  );

  // English Mode Save Conflict
  enTaskSession.setTitle("Valid Title");
  const enConflictSession = openTaskSession({
    mode: "create",
    baseBoard,
    baseRevision: "rev-1",
    save: async () => false, // simulate conflict
    language: "en",
  });
  enConflictSession.setTitle("Valid Task");
  const enConflictRes = await enConflictSession.save();
  assert.equal(enConflictRes.success, false);
  assert.match(enConflictRes.error, /Save failed: Data may have been modified/);

  // 2. English Mode Lane Session
  const enLaneSession = openLaneSession({
    mode: "create",
    baseBoard,
    baseRevision: "rev-1",
    save: async () => true,
    language: "en",
  });

  const emptyLaneRes = await enLaneSession.save({ title: "   " });
  assert.equal(emptyLaneRes.success, false);
  assert.equal(emptyLaneRes.error, "Lane name cannot be empty");

  // 3. English Mode Task Reorder Conflict
  const enReorderRes = await executeTaskReorder({
    baseBoard,
    baseRevision: "rev-1",
    taskId: "t1",
    targetLaneId: "done",
    targetIndex: 0,
    save: async () => false, // simulate conflict
    language: "en",
  });
  assert.equal(enReorderRes.success, false);
  assert.equal(
    enReorderRes.error,
    "Save failed or version conflict, data was not modified. Please refresh and try again.",
  );

  // 4. 中文模式
  const zhTaskSession = openTaskSession({
    mode: "create",
    baseBoard,
    baseRevision: "rev-1",
    save: async () => true,
    language: "zh",
  });
  const zhEmptyRes = await zhTaskSession.save({ title: "" });
  assert.equal(zhEmptyRes.error, "任务标题不能为空");
});
