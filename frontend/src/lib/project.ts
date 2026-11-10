"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { api, type Project, type Schema } from "@/lib/api";

export function useProjectId() {
  return useParams<{ id: string }>().id;
}

export function useProject() {
  const id = useProjectId();
  return useQuery({ queryKey: ["project", id], queryFn: () => api.get<Project>(`/projects/${id}`), refetchInterval: 20_000 });
}

export function useSchema() {
  const id = useProjectId();
  return useQuery({ queryKey: ["schema", id], queryFn: () => api.get<Schema>(`/projects/${id}/schema`) });
}
