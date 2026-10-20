import { execFile } from "node:child_process";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { validateGitBranch } from "../shared/agent-dispatch";

export function registerAgentDispatch(server: PluginServerContext) {
  server.handle(
    validateGitBranch,
    ({ branchName }) =>
      new Promise<{ valid: boolean }>((resolve, reject) => {
        execFile(
          "git",
          ["check-ref-format", "--branch", branchName],
          { timeout: 10_000, maxBuffer: 64 * 1024 },
          (error) => {
            if (!error) resolve({ valid: true });
            else if (error.code === 1 || error.code === 128)
              resolve({ valid: false });
            else reject(error);
          },
        );
      }),
  );
}
