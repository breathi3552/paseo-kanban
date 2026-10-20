import test from "node:test";
import assert from "node:assert/strict";
import { loadClientModule } from "./helpers/react-host-env.mjs";

function server({
  remote = "git@github.com:example/repo.git",
  failure,
  totalCount = 51,
} = {}) {
  const commands = [];
  const handlers = new Map();
  const settings = [];
  const { default: contribute } = loadClientModule("../index.server", {
    "node:child_process": {
      execFile(command, args, options, callback) {
        commands.push({ command, args, cwd: options.cwd });
        if (failure?.command === command)
          return callback(
            Object.assign(new Error(failure.message), { code: failure.code }),
            "",
            failure.message,
          );
        if (command === "git") return callback(null, remote + "\n", "");
        // Enforce the outgoing GitHub API contract, not just a canned response:
        // the page size and cursor actually determine what this process returns.
        assert.equal(command, "gh");
        assert.equal(args[args.indexOf("--hostname") + 1], "github.com");
        assert.equal(options.cwd, "/projects/a");
        const fields = Object.fromEntries(
          args
            .filter((arg) => arg.includes("="))
            .map((arg) => {
              const separator = arg.indexOf("=");
              return [arg.slice(0, separator), arg.slice(separator + 1)];
            }),
        );
        const argument = (source, name) => {
          const token = source.match(
            new RegExp(
              `\\b${name}\\s*:\\s*(\\$\\w+|"[^"]*"|\\[\\s*\\w+\\s*\\]|\\w+)`,
            ),
          )?.[1];
          if (token?.startsWith("$")) return fields[token.slice(1)];
          if (token?.startsWith('"')) return JSON.parse(token);
          return token?.replace(/[[\]\s]/g, "");
        };
        const repository = fields.query.match(
          /\brepository\s*\(([^)]*)\)/,
        )?.[1];
        assert.ok(repository, "read the project's repository");
        assert.equal(argument(repository, "owner"), "example");
        assert.equal(argument(repository, "name"), "repo");
        const connection = fields.query.match(/\bissues\s*\(([\s\S]*?)\)\s*\{/);
        assert.ok(
          connection,
          "read the repository Issue connection, not PR search",
        );
        assert.equal(argument(connection[1], "states"), "OPEN");
        assert.equal(argument(connection[1], "field"), "CREATED_AT");
        const pageSize = Number(argument(connection[1], "first"));
        assert.ok(Number.isInteger(pageSize) && pageSize > 0);
        const cursor = argument(connection[1], "after");
        const offset = cursor ? Number(cursor) : 0;
        const ascending = argument(connection[1], "direction") === "ASC";
        const count = Math.min(pageSize, totalCount - offset);
        const nodes = Array.from({ length: count }, (_, i) => {
          const number = ascending ? offset + i + 1 : totalCount - offset - i;
          return {
            number,
            title: `Issue ${number}`,
            body: "Body",
            url: `https://github.com/example/repo/issues/${number}`,
            author: { login: "alice" },
            createdAt: new Date(
              Date.UTC(2026, 0, 1, 0, 0, number),
            ).toISOString(),
          };
        });
        callback(
          null,
          JSON.stringify({
            data: {
              repository: {
                issues: {
                  totalCount,
                  nodes,
                  pageInfo: {
                    hasNextPage: offset + count < totalCount,
                    endCursor: String(offset + count),
                  },
                },
              },
            },
          }),
          "",
        );
      },
    },
  });
  contribute({
    registerSettings: (s) => settings.push(s),
    handle: (contract, handler) =>
      handlers.set(contract.name, { contract, handler }),
  });
  const context = {
    paseo: {
      projects: {
        list: async () => ({
          projects: [
            {
              projectId: "p1",
              projectRootPath: "/projects/a",
              projectKind: "git",
            },
          ],
        }),
      },
    },
  };
  return {
    settings,
    commands,
    async query(input) {
      const rpc = handlers.get("github.issues");
      assert.ok(rpc, "server contribution exposes Issue listing RPC");
      return rpc.contract.output.parse(
        await rpc.handler(rpc.contract.input.parse(input), context),
      );
    },
  };
}

test("注册RPC识别GitHub origin并提供25项分页与全仓库创建时间排序", async () => {
  for (const remote of [
    "git@github.com:example/repo.git",
    "https://github.com/example/repo.git",
    "ssh://git@github.com/example/repo.git",
  ]) {
    const host = server({ remote });
    const first = await host.query({ projectId: "p1", page: 1, sort: "desc" });
    assert.equal(first.repository, "example/repo");
    assert.equal(first.issues[0].number, 51);
    assert.ok(
      host.commands
        .filter((c) => c.command === "git")
        .every((c) => c.cwd === "/projects/a" && c.args.includes("origin")),
    );
  }

  const host = server();
  const first = await host.query({ projectId: "p1", page: 1, sort: "desc" });
  assert.equal(first.totalCount, 51);
  assert.deepEqual(
    first.issues.map((i) => i.number),
    Array.from({ length: 25 }, (_, i) => 51 - i),
  );
  const second = await host.query({ projectId: "p1", page: 2, sort: "desc" });
  assert.deepEqual(
    second.issues.map((issue) => issue.number),
    Array.from({ length: 25 }, (_, index) => 26 - index),
  );
  const last = await host.query({ projectId: "p1", page: 3, sort: "desc" });
  assert.deepEqual(
    last.issues.map((issue) => issue.number),
    [1],
  );
  const oldest = await host.query({ projectId: "p1", page: 1, sort: "asc" });
  assert.equal(oldest.issues[0].number, 1);
  assert.equal(oldest.issues[0].author, "alice");
});

test("RPC拒绝无效项目、页码、外部仓库和无法访问GitHub，且不回退upstream", async () => {
  for (const [options, input, error] of [
    [{}, { projectId: "missing", page: 1, sort: "desc" }, /project_missing/],
    [{}, { projectId: "p1", page: 0, sort: "desc" }, /./],
    [{}, { projectId: "p1", page: 1.5, sort: "desc" }, /./],
    [
      { remote: "https://github.example.com/example/repo.git" },
      { projectId: "p1", page: 1, sort: "desc" },
      /github_origin/,
    ],
    [
      { remote: "https://github.com.evil.test/example/repo.git" },
      { projectId: "p1", page: 1, sort: "desc" },
      /github_origin/,
    ],
    [
      { failure: { command: "git", message: "No such remote 'origin'" } },
      { projectId: "p1", page: 1, sort: "desc" },
      /github_origin/,
    ],
    [
      { failure: { command: "gh", code: "ENOENT", message: "not found" } },
      { projectId: "p1", page: 1, sort: "desc" },
      /gh_missing/,
    ],
    [
      {
        failure: {
          command: "gh",
          message: "To get started with GitHub CLI, please run: gh auth login",
        },
      },
      { projectId: "p1", page: 1, sort: "desc" },
      /github_auth/,
    ],
    [
      { failure: { command: "gh", message: "HTTP 403 Forbidden" } },
      { projectId: "p1", page: 1, sort: "desc" },
      /github_access/,
    ],
    [
      { failure: { command: "gh", message: "connect ETIMEDOUT" } },
      { projectId: "p1", page: 1, sort: "desc" },
      /github_network/,
    ],
  ]) {
    const host = server(options);
    await assert.rejects(host.query(input), error);
    assert.equal(
      host.commands.some((c) => c.args.includes("upstream")),
      false,
    );
  }
});

test("空仓库和超出末页的请求不制造假Issue或无限翻页", async () => {
  const host = server({ totalCount: 0 });
  const result = await host.query({ projectId: "p1", page: 1, sort: "desc" });
  assert.deepEqual(result.issues, []);
  assert.equal(result.totalCount, 0);
  await assert.rejects(
    host.query({ projectId: "p1", page: 2, sort: "desc" }),
    /github_page/,
  );
});

test("宿主设置迁移为旧任务填三个默认属性并保留完成归属", () => {
  const settings = server().settings.find(
    (contract) => contract.id === "kanban",
  );
  const old = {
    lanes: [
      { id: "todo", title: "Todo", isCompletionLane: false },
      { id: "done", title: "Done", isCompletionLane: true },
    ],
    tasks: [
      {
        id: "old",
        title: "Old",
        description: "https://github.com/example/repo/issues/1",
        laneId: "todo",
        projectId: null,
        subtasks: [],
        completed: true,
        completedAt: 123,
      },
    ],
  };
  const migrated = settings.migrate(old, 2);
  assert.deepEqual(migrated.tasks[0], {
    ...old.tasks[0],
    source: "manual",
    issueNumber: null,
    externalUrl: null,
  });
  const legacy = settings.migrate(
    {
      lanes: [
        { id: "todo", title: "Todo" },
        { id: "done", title: "Done" },
      ],
      tasks: [{ id: "v1", title: "Done", laneId: "done", subtasks: [] }],
    },
    1,
  );
  assert.equal(legacy.tasks[0].completed, true);
  assert.equal(legacy.tasks[0].laneId, "todo");
  assert.equal(legacy.tasks[0].source, "manual");
});
