import test from "node:test";
import assert from "node:assert/strict";
import { createHost, mount, text } from "./helpers/kanban-host.mjs";

let storageLanguage = "en";
let browserLanguages = ["en-US"];
let browserLanguage = "en-US";
let documentLanguage = "en";

globalThis.localStorage = {
  getItem(key) {
    return key === "@paseo:app-settings"
      ? JSON.stringify({ language: storageLanguage })
      : null;
  },
};
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  get: () => ({ language: browserLanguage, languages: browserLanguages }),
});
globalThis.document = {
  get documentElement() {
    return { lang: documentLanguage };
  },
};
test.after(() => {
  delete globalThis.localStorage;
  delete globalThis.navigator;
  delete globalThis.document;
});

function texts(renderer) {
  return renderer.root.findAllByType("Text").map(text).join("\n");
}

test("打开页面时根据上游语言与系统语言决定插件界面与入口标题（简繁中文/英文/跟随系统）", async (t) => {
  for (const [setting, browser, doc, expectedTitle, expectedEntry] of [
    ["en", ["zh-CN"], "zh-CN", /Task Kanban/, "Kanban"],
    ["zh-Hans", ["en-US"], "en", /任务看板/, "看板"],
    ["zh-TW", ["en-US"], "en", /任务看板/, "看板"],
    ["system", ["zh-HK", "en-US"], "en", /任务看板/, "看板"],
    ["system", ["fr-FR"], "zh-CN", /Task Kanban/, "Kanban"],
  ]) {
    storageLanguage = setting;
    browserLanguages = browser;
    browserLanguage = browser[0];
    documentLanguage = doc;
    const host = createHost();
    const renderer = await mount(t, host);
    assert.match(texts(renderer), expectedTitle);
    assert.equal(host.sidebars.get("kanban")?.title, expectedEntry);
    assert.equal(host.panels.get("kanban")?.title, expectedEntry);
  }
});
