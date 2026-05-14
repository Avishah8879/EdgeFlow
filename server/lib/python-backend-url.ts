/**
 * Resolves the base URL for server-to-server calls into the FastAPI Python
 * backend. Prefers PYTHON_BACKEND_URL when set (for containerised or
 * remote-host setups); otherwise derives from PYTHON_PORT, matching the
 * convention in server/index.ts:242. Trailing slashes are stripped.
 *
 * Why default to 8100, not 7860: server/index.ts has long defaulted
 * PYTHON_PORT to '8100', the active .env ships PYTHON_PORT=8100, and the
 * frontend resolves VITE_GRADIO_BASE_URL to http://localhost:8100. The
 * older 7860 default that lived inline in expression-validation.ts and
 * routes-admin.ts was the cause of the PR 2.1 503.
 */
export function pythonBackendUrl(): string {
  const explicit = process.env.PYTHON_BACKEND_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  const port = process.env.PYTHON_PORT || '8100';
  return `http://localhost:${port}`;
}
