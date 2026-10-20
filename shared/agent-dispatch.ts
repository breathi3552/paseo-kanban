import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const agentDispatchSettings = defineSettings({
  id: "agent-dispatch",
  scope: "host",
  version: 1,
  schema: z.object({ prompt: z.string().nullable().default(null) }),
});

export const validateGitBranch = defineRpc({
  name: "agent-dispatch.validate-branch",
  input: z.object({ branchName: z.string() }),
  output: z.object({ valid: z.boolean() }),
});
