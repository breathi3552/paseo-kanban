import test from "node:test";
import assert from "node:assert/strict";
import { act } from "./helpers/react-host-env.mjs";
import { createHost, mount, text } from "./helpers/kanban-host.mjs";

const displays = {
  zh: { title: "任务看板", entry: "看板", stats: "3 任务 · 2 泳道" },
  en: { title: "Task Kanban", entry: "Kanban", stats: "3 tasks · 2 lanes" },
};

function configureUpstream(t) {
  let language = "system";
  const navigator = { languages: ["en-US"], language: "en-US" };
  const window = new EventTarget();
  const globals = {
    localStorage: {
      getItem: (key) =>
        key === "@paseo:app-settings" ? JSON.stringify({ language }) : null,
    },
    navigator,
    window,
    document: { documentElement: { lang: "en" } },
  };
  for (const [key, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else delete globalThis[key];
    });
  }
  t.mock.method(Intl, "DateTimeFormat", () => ({
    resolvedOptions: () => ({ locale: "en-US" }),
  }));
  return {
    select(nextLanguage, systemLocale = "en-US") {
      language = nextLanguage;
      navigator.languages = [systemLocale];
      navigator.language = systemLocale;
    },
    focus() {
      window.dispatchEvent(new Event("focus"));
    },
  };
}

function assertDisplay(renderer, host, expected, scenario) {
  const texts = renderer.root.findAllByType("Text").map(text);
  assert.ok(texts.includes(expected.title), scenario);
  assert.ok(texts.includes(expected.stats), scenario);
  assert.equal(host.sidebars.get("kanban").title, expected.entry, scenario);
  assert.equal(host.panels.get("kanban").title, expected.entry, scenario);
}

test("上游语言决定插件显示（简繁中文/英文/跟随系统），窗口获焦时动态同步已打开看板与入口标题", async (t) => {
  const upstream = configureUpstream(t);
  for (const [language, systemLocale, display] of [
    ["zh-CN", "en-US", "zh"],
    ["zh-TW", "en-US", "zh"],
    ["en", "zh-CN", "en"],
    ["ja", "zh-CN", "en"],
    ["system", "zh-CN", "zh"],
    ["system", "zh-TW", "zh"],
    ["system", "en-US", "en"],
  ]) {
    upstream.select(language, systemLocale);
    const host = createHost();
    const renderer = await mount(t, host);
    assertDisplay(
      renderer,
      host,
      displays[display],
      `${language}/${systemLocale}`,
    );
  }

  upstream.select("en");
  const host = createHost();
  const renderer = await mount(t, host);
  assertDisplay(renderer, host, displays.en, "initial en");

  for (const [language, display] of [
    ["zh-TW", "zh"],
    ["en", "en"],
  ]) {
    await act(async () => {
      upstream.select(language);
      upstream.focus();
    });
    assertDisplay(renderer, host, displays[display], `focus ${language}`);
  }
});
