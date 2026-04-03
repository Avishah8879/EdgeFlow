// @ts-nocheck
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  envDir: path.resolve(import.meta.dirname), // Look for .env files in project root
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,

    // Enable code splitting for better performance
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/lightweight-charts') || id.includes('node_modules/recharts')) {
            return 'vendor-charts';
          }
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/wouter')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/@tanstack/react-query')) {
            return 'vendor-query';
          }
          if (
            id.includes('node_modules/@radix-ui/react-dialog') ||
            id.includes('node_modules/@radix-ui/react-select') ||
            id.includes('node_modules/@radix-ui/react-tabs') ||
            id.includes('node_modules/@radix-ui/react-toast') ||
            id.includes('node_modules/@radix-ui/react-dropdown-menu') ||
            id.includes('node_modules/@radix-ui/react-popover')
          ) {
            return 'vendor-ui-core';
          }
          if (id.includes('node_modules/@radix-ui/')) {
            return 'vendor-ui-extended';
          }
          if (
            id.includes('node_modules/react-hook-form') ||
            id.includes('node_modules/@hookform/') ||
            id.includes('node_modules/zod')
          ) {
            return 'vendor-forms';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
        },
      },
    },

    // Chunk size warning limit (500 KB)
    chunkSizeWarningLimit: 500,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
