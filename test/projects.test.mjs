import test from "node:test";
import assert from "node:assert/strict";
import { fetchProjectsWithOrderControl } from "../client/use-projects.ts";
import {
  React,
  TestRenderer,
  act,
  loadClientModule,
} from "./helpers/react-host-env.mjs";

async function mountProjects(t) {
  const requests = [];
  let listener;
  let state;
  const paseo = {
    projects: {
      list: () => {
        const request = Promise.withResolvers();
        requests.push(request);
        return request.promise;
      },
      subscribe: (callback) => {
        listener = callback;
        return () => {
          listener = null;
        };
      },
    },
  };
  const { useProjects } = loadClientModule("use-projects", {
    "@getpaseo/plugin/client": { usePaseo: () => paseo },
  });
  function Consumer() {
    state = useProjects();
    return null;
  }
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(Consumer));
  });
  t.after(async () => {
    await act(async () => renderer.unmount());
    assert.equal(listener, null, "卸载后取消宿主订阅");
  });
  return {
    requests,
    refresh: () => listener(),
    get state() {
      return state;
    },
  };
}

const initialProjects = [{ projectId: "p1", projectDisplayName: "项目1" }];
const updatedProjects = [
  { projectId: "p1", projectDisplayName: "项目1已更新" },
];

test("宿主项目加载与订阅: 失败保留列表，恢复后更新名称并清除错误", async (t) => {
  const host = await mountProjects(t);
  assert.equal(host.state.isLoading, true);
  assert.deepEqual(host.state.projects, []);

  await act(async () =>
    host.requests.shift().resolve({ projects: initialProjects }),
  );
  assert.equal(host.state.isLoading, false);
  assert.equal(host.state.resolveProjectName("p1"), "项目1");

  await act(async () => {
    host.refresh();
    host.requests.shift().reject(new Error("503 Service Unavailable"));
  });
  assert.deepEqual(host.state.projects, initialProjects);
  assert.equal(host.state.isError, true);
  assert.equal(host.state.error, "503 Service Unavailable");

  await act(async () => {
    host.refresh();
    host.requests.shift().resolve({ projects: updatedProjects });
  });
  assert.deepEqual(host.state.projects, updatedProjects);
  assert.equal(host.state.resolveProjectName("p1"), "项目1已更新");
  assert.equal(host.state.isError, false);
  assert.equal(host.state.error, null);
});

test("订阅请求乱序: 较早请求的成功或失败都不能覆盖最新项目结果", async (t) => {
  for (const outcome of ["成功", "失败"]) {
    const host = await mountProjects(t);
    const oldRequest = host.requests.shift();
    await act(async () => {
      host.refresh();
      host.requests.shift().resolve({ projects: updatedProjects });
    });
    await act(async () => {
      if (outcome === "成功") oldRequest.resolve({ projects: initialProjects });
      else oldRequest.reject(new Error("Old network timeout"));
    });
    assert.deepEqual(host.state.projects, updatedProjects, `旧请求${outcome}`);
    assert.equal(host.state.resolveProjectName("p1"), "项目1已更新");
    assert.equal(host.state.error, null, `旧请求${outcome}`);
  }
});

// React 卸载后自身会阻止渲染，须在控制器 API 边界验证在途回调确实被抑制。
test("生命周期注销: 销毁控制器后忽略在途响应", async () => {
  const updates = [];
  const controller = fetchProjectsWithOrderControl((state) =>
    updates.push(state),
  );
  const pending = Promise.withResolvers();
  const request = controller.execute(() => pending.promise);
  controller.destroy();
  pending.resolve({ projects: initialProjects });
  await request;
  assert.deepEqual(updates, []);
});
