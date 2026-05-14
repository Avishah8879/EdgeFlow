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

export type ScreenerType = "expert" | "fundamental";

export interface UserScreenerTemplate {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  expression: string;
  screener_type: ScreenerType;
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

async function fetchTemplates(screenerType: ScreenerType): Promise<UserScreenerTemplate[]> {
  const qs = `?screenerType=${encodeURIComponent(screenerType)}`;
  const res = await fetch(url(qs));
  if (!res.ok) throw await parseError(res);
  const body: ListResponse = await res.json();
  return body.templates ?? [];
}

export interface CreateTemplateInput {
  name: string;
  description?: string | null;
  expression: string;
  screenerType: ScreenerType;
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
  screenerType: ScreenerType;
  name?: string;
  description?: string | null;
  expression?: string;
}

async function updateTemplate({ id, screenerType, ...patch }: UpdateTemplateInput): Promise<UserScreenerTemplate> {
  // screenerType is asserted as a query param so the route can scope the
  // ownership lookup correctly (Expert UI never accidentally PATCHes a
  // Fundamental row by id).
  const qs = `?screenerType=${encodeURIComponent(screenerType)}`;
  const res = await fetch(url(`/${id}${qs}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...patch, screenerType }),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export interface DeleteTemplateInput {
  id: string;
  screenerType: ScreenerType;
}

async function deleteTemplate({ id, screenerType }: DeleteTemplateInput): Promise<void> {
  const qs = `?screenerType=${encodeURIComponent(screenerType)}`;
  const res = await fetch(url(`/${id}${qs}`), { method: "DELETE" });
  if (!res.ok) throw await parseError(res);
}

function queryKey(screenerType: ScreenerType) {
  return ["user-templates", screenerType] as const;
}

export function useUserTemplates(screenerType: ScreenerType) {
  return useQuery({
    queryKey: queryKey(screenerType),
    queryFn: () => fetchTemplates(screenerType),
    staleTime: 60_000,
  });
}

export function useCreateUserTemplate(screenerType: ScreenerType) {
  const qc = useQueryClient();
  return useMutation<UserScreenerTemplate, UserTemplateMutationError, CreateTemplateInput>({
    mutationFn: createTemplate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKey(screenerType) });
    },
  });
}

// The hook injects screenerType so callers can keep passing just the field
// patch + id, matching the pre-PR-3-fix call shape in SaveTemplateDialog.
type UpdateTemplatePatch = Omit<UpdateTemplateInput, "screenerType">;

export function useUpdateUserTemplate(screenerType: ScreenerType) {
  const qc = useQueryClient();
  return useMutation<UserScreenerTemplate, UserTemplateMutationError, UpdateTemplatePatch>({
    mutationFn: (patch: UpdateTemplatePatch) => updateTemplate({ ...patch, screenerType }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKey(screenerType) });
    },
  });
}

export function useDeleteUserTemplate(screenerType: ScreenerType) {
  const qc = useQueryClient();
  return useMutation<void, UserTemplateMutationError, string>({
    // Wrap so the caller can keep passing just an id; the hook injects its
    // own screenerType. Keeps the existing MyTemplates call shape unchanged.
    mutationFn: (id: string) => deleteTemplate({ id, screenerType }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKey(screenerType) });
    },
  });
}
