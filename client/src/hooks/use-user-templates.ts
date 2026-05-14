/**
 * User Screener Templates Hook
 *
 * TanStack Query bindings for the Save-as-Template CRUD endpoints
 * (`/api/expert-screener/user-templates*`). All requests go through the
 * Node backend (auth + DB) via getAuthBaseUrl(). Mutation errors carry a
 * typed `unknownIdentifiers` field when the server's expression audit
 * flagged unrecognised names, so callers can render them distinctly.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAuthBaseUrl } from "@/lib/api-config";

const AUTH_BASE_URL = getAuthBaseUrl();
const QUERY_KEY = ["user-templates"] as const;

export interface UserScreenerTemplate {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  expression: string;
  created_at: string;
  updated_at: string;
}

interface ListResponse {
  templates: UserScreenerTemplate[];
  count: number;
}

export interface UserTemplateMutationError extends Error {
  status?: number;
  unknownIdentifiers?: string[];
}

function url(path: string = ""): string {
  return `${AUTH_BASE_URL}/api/expert-screener/user-templates${path}`;
}

async function parseError(res: Response): Promise<UserTemplateMutationError> {
  let body: any = {};
  try {
    body = await res.json();
  } catch {
    /* ignore — server didn't return JSON */
  }
  const err = new Error(body?.message || `Request failed (${res.status})`) as UserTemplateMutationError;
  err.status = res.status;
  if (Array.isArray(body?.unknownIdentifiers)) {
    err.unknownIdentifiers = body.unknownIdentifiers;
  }
  return err;
}

async function fetchTemplates(): Promise<UserScreenerTemplate[]> {
  const res = await fetch(url());
  if (!res.ok) throw await parseError(res);
  const body: ListResponse = await res.json();
  return body.templates ?? [];
}

export interface CreateTemplateInput {
  name: string;
  description?: string | null;
  expression: string;
}

async function createTemplate(input: CreateTemplateInput): Promise<UserScreenerTemplate> {
  const res = await fetch(url(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export interface UpdateTemplateInput {
  id: string;
  name?: string;
  description?: string | null;
  expression?: string;
}

async function updateTemplate({ id, ...patch }: UpdateTemplateInput): Promise<UserScreenerTemplate> {
  const res = await fetch(url(`/${id}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

async function deleteTemplate(id: string): Promise<void> {
  const res = await fetch(url(`/${id}`), { method: "DELETE" });
  if (!res.ok) throw await parseError(res);
}

export function useUserTemplates() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchTemplates,
    staleTime: 60_000,
  });
}

export function useCreateUserTemplate() {
  const qc = useQueryClient();
  return useMutation<UserScreenerTemplate, UserTemplateMutationError, CreateTemplateInput>({
    mutationFn: createTemplate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useUpdateUserTemplate() {
  const qc = useQueryClient();
  return useMutation<UserScreenerTemplate, UserTemplateMutationError, UpdateTemplateInput>({
    mutationFn: updateTemplate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useDeleteUserTemplate() {
  const qc = useQueryClient();
  return useMutation<void, UserTemplateMutationError, string>({
    mutationFn: deleteTemplate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
