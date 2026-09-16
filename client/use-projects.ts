import { usePaseo } from "@getpaseo/plugin/client";
import { useState, useEffect } from "react";

export interface ProjectItem {
  projectId: string;
  projectDisplayName: string;
}

export function useProjects() {
  const paseo = usePaseo();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchProjects = async () => {
      try {
        const result = await paseo.projects.list();
        if (mounted) {
          setProjects((result.projects ?? []) as ProjectItem[]);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    fetchProjects();
    const unsubscribe = paseo.projects.subscribe(fetchProjects);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [paseo]);

  return {
    projects,
    isLoading,
    isError: error !== null,
    error,
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
