/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GRADIO_BASE_URL: string
  readonly VITE_AUTH_BASE_URL: string
  readonly VITE_FINTERMINAL_URL?: string
  readonly VITE_NODE_BASE_URL?: string
  readonly MODE: string
  readonly DEV: boolean
  readonly PROD: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
