import { execFile } from "node:child_process";
import { z } from "zod";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { listGitHubIssues } from "../shared/github-import";

const connectionSchema = z.object({
  totalCount: z.number().int().nonnegative(),
  nodes: z.array(
    z.object({
      number: z.number(),
      title: z.string(),
      body: z.string().nullable(),
      url: z.string(),
      author: z.object({ login: z.string() }).nullable(),
      createdAt: z.string(),
    }),
  ),
  pageInfo: z.object({
    hasNextPage: z.boolean(),
    endCursor: z.string().nullable(),
  }),
});

const query = `query($owner: String!, $name: String!, $direction: OrderDirection!, $after: String) {
  repository(owner: $owner, name: $name) {
    issues(first: 25, after: $after, states: OPEN, orderBy: {field: CREATED_AT, direction: $direction}) {
      totalCount
      nodes { number title body url author { login } createdAt }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

function run(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { cwd, timeout: 30_000, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (!error) return resolve(stdout);
        if (command === "git") return reject(new Error("github_origin"));
        const detail = `${error.message} ${stderr}`;
        const code =
          error.code === "ENOENT"
            ? "gh_missing"
            : /auth login|not logged|authentication/i.test(detail)
              ? "github_auth"
              : /403|404|forbidden|not found|could not resolve to a repository/i.test(
                    detail,
                  )
                ? "github_access"
                : "github_network";
        reject(new Error(code));
      },
    );
  });
}

function repositoryFromOrigin(remote: string): [string, string] {
  const match =
    /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/\s:]+)\/([^/\s?#]+?)(?:\.git)?\/?$/.exec(
      remote.trim(),
    );
  if (!match || match[1].startsWith("-") || match[2].startsWith("-"))
    throw new Error("github_origin");
  return [match[1], match[2]];
}

export function registerGitHubImport(server: PluginServerContext) {
  server.handle(listGitHubIssues, async (input, { paseo }) => {
    const { projectId, page, sort } = listGitHubIssues.input.parse(input);
    const { projects } = await paseo.projects.list();
    const project = projects.find((item) => item.projectId === projectId);
    if (!project?.projectRootPath || project.projectKind !== "git")
      throw new Error("project_missing");
    const cwd = project.projectRootPath;
    const origin = await run("git", ["remote", "get-url", "origin"], cwd);
    const [owner, name] = repositoryFromOrigin(origin);
    let after: string | null = null;
    // GitHub's issue connection excludes PRs and has no search-result cap. Seek
    // numbered pages via cursors without persisting pagination on tasks.
    for (let current = 1; current <= page; current++) {
      const args = [
        "api",
        "--hostname",
        "github.com",
        "graphql",
        "-f",
        `query=${query}`,
        "-f",
        `owner=${owner}`,
        "-f",
        `name=${name}`,
        "-f",
        `direction=${sort.toUpperCase()}`,
      ];
      if (after) args.push("-f", `after=${after}`);
      const raw = JSON.parse(await run("gh", args, cwd));
      if (raw.errors || !raw.data?.repository) throw new Error("github_access");
      const result = connectionSchema.parse(raw.data.repository.issues);
      if (page > Math.max(1, Math.ceil(result.totalCount / 25)))
        throw new Error("github_page");
      if (current === page)
        return listGitHubIssues.output.parse({
          repository: `${owner}/${name}`,
          totalCount: result.totalCount,
          issues: result.nodes.map((node) => ({
            ...node,
            body: node.body ?? "",
            author: node.author?.login ?? "ghost",
          })),
        });
      if (
        !result.pageInfo.hasNextPage ||
        !result.pageInfo.endCursor ||
        after === result.pageInfo.endCursor
      )
        throw new Error("github_page");
      after = result.pageInfo.endCursor;
    }
    throw new Error("github_page");
  });
}
