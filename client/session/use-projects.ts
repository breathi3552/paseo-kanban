import { usePaseo } from "@getpaseo/plugin/client";
import { useState, useEffect, useMemo } from "react";

export interface ProjectItem {
  projectId: string;
  projectDisplayName: string;
  projectRootPath?: string;
  projectKind?: "git" | "directory" | "non_git";
}

export interface ProjectOption {
  value: string;
  label: string;
  projectId: string;
  projectDisplayName: string;
}

export interface ProjectOptionsOptions {
  retainIds?: (string | null | undefined)[];
  language?: string;
}

export function getProjectOptions(
  projects: ProjectItem[],
  options?: ProjectOptionsOptions | (string | null | undefined)[],
  languageParam?: string,
): ProjectOption[] {
  const retainIds = Array.isArray(options) ? options : options?.retainIds;
  const language = Array.isArray(options)
    ? languageParam
    : (options?.language ?? languageParam);

  const optionsMap = new Map<string, ProjectOption>();
  for (const project of projects) {
    if (!project.projectId) continue;
    optionsMap.set(project.projectId, {
      value: project.projectId,
      label: project.projectDisplayName || project.projectId,
      projectId: project.projectId,
      projectDisplayName: project.projectDisplayName || project.projectId,
    });
  }

  if (retainIds) {
    for (const rawId of retainIds) {
      if (!rawId || rawId === "all" || rawId === "unassigned") continue;
      if (!optionsMap.has(rawId)) {
        optionsMap.set(rawId, {
          value: rawId,
          label: rawId,
          projectId: rawId,
          projectDisplayName: rawId,
        });
      }
    }
  }

  return Array.from(optionsMap.values()).sort((a, b) =>
    a.label.localeCompare(b.label, language),
  );
}

export type ProjectNameResolver = (
  projectId: string | null | undefined,
) => string | null;

export function createProjectNameResolver(
  projects: ProjectItem[],
): ProjectNameResolver {
  const index = new Map<string, string>();
  for (const p of projects) {
    index.set(p.projectId, p.projectDisplayName);
  }
  return (projectId: string | null | undefined): string | null => {
    if (!projectId) return null;
    return index.get(projectId) ?? projectId;
  };
}

export interface ProjectsState {
  projects?: ProjectItem[];
  isLoading?: boolean;
  error?: string | null;
}

function fetchProjectsWithOrderControl(
  onUpdate: (state: ProjectsState) => void,
) {
  let latestRequestId = 0;
  let isDestroyed = false;

  return {
    execute: async (
      fetchFn: () => Promise<{ projects?: ProjectItem[] | null } | null>,
    ): Promise<void> => {
      const requestId = ++latestRequestId;
      try {
        const result = await fetchFn();
        if (isDestroyed || requestId !== latestRequestId) {
          return;
        }
        onUpdate({
          projects: result?.projects ?? [],
          error: null,
          isLoading: false,
        });
      } catch (err) {
        if (isDestroyed || requestId !== latestRequestId) {
          return;
        }
        onUpdate({
          error: err instanceof Error ? err.message : String(err),
          isLoading: false,
        });
      }
    },
    destroy: () => {
      isDestroyed = true;
    },
  };
}

export function useProjects() {
  const paseo = usePaseo();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = fetchProjectsWithOrderControl((update) => {
      if (update.projects !== undefined) {
        setProjects(update.projects);
      }
      if (update.error !== undefined) {
        setError(update.error);
      }
      if (update.isLoading !== undefined) {
        setIsLoading(update.isLoading);
      }
    });

    controller.execute(() => paseo.projects.list());
    const unsubscribe = paseo.projects.subscribe(() => {
      controller.execute(() => paseo.projects.list());
    });

    return () => {
      controller.destroy();
      unsubscribe();
    };
  }, [paseo]);

  const resolveProjectName = useMemo(
    () => createProjectNameResolver(projects),
    [projects],
  );

  return {
    projects,
    resolveProjectName,
    isLoading,
    isError: error !== null,
    error,
  };
}
