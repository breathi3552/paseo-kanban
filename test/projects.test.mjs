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
  assert.equal(getProjectDisplayName("p1", projects), "基础设施");
  assert.equal(getProjectDisplayName("unknown", projects), "unknown");

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

test("请求乱序控制: 较早请求的成功或失败都不能覆盖最新结果", async () => {
  let state = { projects: [], error: null, isLoading: true };
  const controller = fetchProjectsWithOrderControl((next) => {
    state = { ...state, ...next };
  });

  let resolveOld;
  const oldResult = new Promise((resolve) => {
    resolveOld = resolve;
  });
  const oldRequest = controller.execute(() => oldResult);
  await controller.execute(async () => ({
    projects: [{ projectId: "pB", projectDisplayName: "项目B" }],
  }));

  resolveOld({ projects: [{ projectId: "pA", projectDisplayName: "项目A" }] });
  await oldRequest;
  assert.deepEqual(state.projects, [
    { projectId: "pB", projectDisplayName: "项目B" },
  ]);
  assert.equal(state.error, null);

  let rejectOld;
  const oldFailure = new Promise((_, reject) => {
    rejectOld = reject;
  });
  const failedRequest = controller.execute(() => oldFailure);
  await controller.execute(async () => ({
    projects: [{ projectId: "pLatest", projectDisplayName: "最新项目" }],
  }));

  rejectOld(new Error("Old network timeout"));
  await failedRequest;
  assert.equal(state.error, null);
  assert.deepEqual(state.projects, [
    { projectId: "pLatest", projectDisplayName: "最新项目" },
  ]);
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
  assert.deepEqual(state.projects, [
    { projectId: "p1", projectDisplayName: "项目1" },
  ]);
  assert.equal(state.error, null);

  // 2. 刷新请求失败: 必须保留旧项目列表，同时暴露错误
  await controller.execute(async () => {
    throw new Error("503 Service Unavailable");
  });
  assert.deepEqual(
    state.projects,
    [{ projectId: "p1", projectDisplayName: "项目1" }],
    "失败时保留最后一次成功列表",
  );
  assert.match(state.error ?? "", /503 Service Unavailable/);

  // 3. 再次请求成功: 清除错误并更新列表
  await controller.execute(async () => ({
    projects: [{ projectId: "p1", projectDisplayName: "项目1已更新" }],
  }));
  assert.deepEqual(state.projects, [
    { projectId: "p1", projectDisplayName: "项目1已更新" },
  ]);
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

  const request = controller.execute(() => pendingPromise);
  controller.destroy();

  resolvePending({ projects: [{ projectId: "px", projectDisplayName: "X" }] });
  await request;

  assert.equal(updateCount, 0, "卸载后不更新状态");
});
