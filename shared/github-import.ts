import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const GitHubIssueSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().trim().min(1),
  body: z.string(),
  url: z
    .url()
    .refine((value) =>
      /^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+$/.test(value),
    ),
  author: z.string(),
  createdAt: z.iso.datetime(),
});

export const listGitHubIssues = defineRpc({
  name: "github.issues",
  input: z.object({
    projectId: z.string().trim().min(1),
    page: z.number().int().positive(),
    sort: z.enum(["asc", "desc"]),
  }),
  output: z.object({
    repository: z.string(),
    issues: z.array(GitHubIssueSchema).max(25),
    totalCount: z.number().int().nonnegative(),
  }),
});

export type GitHubIssue = z.infer<typeof GitHubIssueSchema>;
export type IssuePage = z.infer<typeof listGitHubIssues.output>;
