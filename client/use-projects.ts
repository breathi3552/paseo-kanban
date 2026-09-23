import { usePaseo } from "@getpaseo/plugin/client";
import { useState, useEffect, useMemo } from "react";

export interface ProjectItem {
  projectId: string;
  projectDisplayName: string;
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

export function getProjectDisplayName(
  projectId: string | null | undefined,
  projectsOrResolver: ProjectItem[] | ProjectNameResolver,
): string | null {
  if (!projectId) return null;
  if (typeof projectsOrResolver === "function") {
    return projectsOrResolver(projectId);
  }
  const match = projectsOrResolver.find((p) => p.projectId === projectId);
  return match ? match.projectDisplayName : projectId;
}

export interface ProjectsState {
  projects?: ProjectItem[];
  isLoading?: boolean;
  error?: string | null;
}

export function fetchProjectsWithOrderControl(
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
