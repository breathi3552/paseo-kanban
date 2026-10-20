import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const validateGitBranch = defineRpc({
  name: "agent-dispatch.validate-branch",
  input: z.object({ branchName: z.string() }),
  output: z.object({ valid: z.boolean() }),
});
