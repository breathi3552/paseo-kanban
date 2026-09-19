import test from "node:test";
import assert from "node:assert/strict";
import {
  createProjectNameResolver,
  getProjectDisplayName,
  fetchProjectsWithOrderControl,
} from "../client/use-projects.ts";

test("项目名称解析: 空关联、已知项目显示名称、未知项目回退标识", () => {
  const projects = [
    { projectId: "p1", projectDisplayName: "基础设施" },
    { projectId: "p2", projectDisplayName: "用户界面" },
  ];

  const resolve = createProjectNameResolver(projects);

  // 1. 无关联
  assert.equal(resolve(null), null);
  assert.equal(resolve(undefined), null);
  assert.equal(resolve(""), null);

  // 2. 已知项目
  assert.equal(resolve("p1"), "基础设施");
  assert.equal(resolve("p2"), "用户界面");

  // 3. 未知项目回退其 ID
  assert.equal(resolve("p-unknown"), "p-unknown");

  // 4. 重命名项目后重建索引
  const renamedProjects = [
    { projectId: "p1", projectDisplayName: "基础设施 2.0" },
  ];
  const resolveRenamed = createProjectNameResolver(renamedProjects);
  assert.equal(resolveRenamed("p1"), "基础设施 2.0");
  assert.equal(resolveRenamed("p2"), "p2", "已移除项目回退为 ID");
});

test("请求乱序控制: A 先发、B 后发先完成、A 最后完成，A 的成功或失败不能覆盖 B", async () => {
  let state = {
    projects: [],
    error: null,
    isLoading: true,
  };

  const controller = fetchProjectsWithOrderControl((next) => {
    state = { ...state, ...next };
  });

  let resolveA;
  let rejectA;
  const promiseA = new Promise((resolve, reject) => {
    resolveA = resolve;
    rejectA = reject;
  });

  let resolveB;
  const promiseB = new Promise((resolve) => {
    resolveB = resolve;
  });

  // A 先发
  controller.execute(() => promiseA);

  // B 后发
  controller.execute(() => promiseB);

  // B 先成功完成
  resolveB({
    projects: [{ projectId: "pB", projectDisplayName: "项目B" }],
  });
  await promiseB;
  // 等待 microtask
  await new Promise((r) => setImmediate(r));

  assert.deepEqual(state.projects, [{ projectId: "pB", projectDisplayName: "项目B" }]);
  assert.equal(state.error, null);

  // A 随后完成（旧请求迟到）
  resolveA({
    projects: [{ projectId: "pA", projectDisplayName: "项目A" }],
  });
  await promiseA;
  await new Promise((r) => setImmediate(r));

  // A 的结果被丢弃，保留 B 的结果
  assert.deepEqual(
    state.projects,
    [{ projectId: "pB", projectDisplayName: "项目B" }],
    "旧请求 A 不能覆盖新请求 B 的结果"
  );

  // 再次验证：如果 A 抛错迟到，也不能将错误覆盖到当前状态
  let resolveC;
  const promiseC = new Promise((resolve) => { resolveC = resolve; });
  controller.execute(() => promiseC);

  let rejectD;
  const promiseD = new Promise((_, reject) => { rejectD = reject; });
  // 先发一个会被超车的慢失败请求
  const slowFailController = fetchProjectsWithOrderControl((next) => {
    state = { ...state, ...next };
  });
  slowFailController.execute(() => promiseD);
  slowFailController.execute(() => Promise.resolve({
    projects: [{ projectId: "pLatest", projectDisplayName: "最新项目" }],
  }));

  await new Promise((r) => setImmediate(r));
  assert.deepEqual(state.projects, [{ projectId: "pLatest", projectDisplayName: "最新项目" }]);

  // 此时慢失败请求 D 发生错误
  rejectD(new Error("Old network timeout"));
  try { await promiseD; } catch {}
  await new Promise((r) => setImmediate(r));

  assert.equal(state.error, null, "过期的失败不能覆盖较新的成功状态");
  assert.deepEqual(state.projects, [{ projectId: "pLatest", projectDisplayName: "最新项目" }]);
});

test("失败恢复: 查询失败保留最后成功列表并暴露错误，后续成功清除错误", async () => {
  let state = {
    projects: [],
    error: null,
  };

  const controller = fetchProjectsWithOrderControl((next) => {
    state = { ...state, ...next };
  });

  // 1. 首次请求成功
  await controller.execute(async () => ({
    projects: [{ projectId: "p1", projectDisplayName: "项目1" }],
  }));
  assert.deepEqual(state.projects, [{ projectId: "p1", projectDisplayName: "项目1" }]);
  assert.equal(state.error, null);

  // 2. 刷新请求失败: 必须保留旧项目列表，同时暴露错误
  await controller.execute(async () => {
    throw new Error("503 Service Unavailable");
  });
  assert.deepEqual(
    state.projects,
    [{ projectId: "p1", projectDisplayName: "项目1" }],
    "失败时保留最后一次成功列表"
  );
  assert.match(state.error ?? "", /503 Service Unavailable/);

  // 3. 再次请求成功: 清除错误并更新列表
  await controller.execute(async () => ({
    projects: [{ projectId: "p1", projectDisplayName: "项目1已更新" }],
  }));
  assert.deepEqual(state.projects, [{ projectId: "p1", projectDisplayName: "项目1已更新" }]);
  assert.equal(state.error, null, "后续成功清除错误");
});

test("生命周期注销: unmount 卸载后忽略在途响应并不更新状态", async () => {
  let updateCount = 0;
  const controller = fetchProjectsWithOrderControl(() => {
    updateCount++;
  });

  let resolvePending;
  const pendingPromise = new Promise((resolve) => {
    resolvePending = resolve;
  });

  controller.execute(() => pendingPromise);
  controller.destroy();

  resolvePending({ projects: [{ projectId: "px", projectDisplayName: "X" }] });
  await pendingPromise;
  await new Promise((r) => setImmediate(r));

  assert.equal(updateCount, 0, "卸载后不更新状态");
});
