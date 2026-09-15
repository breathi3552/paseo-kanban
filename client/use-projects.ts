import { usePaseo } from "@getpaseo/plugin/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

export interface ProjectItem {
  projectId: string;
  projectDisplayName: string;
  projectRootPath: string;
  projectKind: "git" | "non_git" | "directory";
}

export function useProjects() {
  const paseo = usePaseo();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["paseo-projects"],
    queryFn: async () => {
      const result = await paseo.projects.list();
      return (result.projects ?? []) as ProjectItem[];
    },
    staleTime: 30000,
  });

  useEffect(() => {
    const unsubscribe = paseo.projects.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ["paseo-projects"] });
    });
    return () => {
      unsubscribe();
    };
  }, [paseo, queryClient]);

  return {
    projects: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error ? String(query.error) : null,
  };
}

export function getProjectDisplayName(
  projectId: string | null,
  projects: ProjectItem[]
): string | null {
  if (!projectId) return null;
  const match = projects.find((p) => p.projectId === projectId);
  return match ? match.projectDisplayName : projectId;
}
