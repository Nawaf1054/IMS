/// <reference types="vitest/config" />
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // One .env at the repository root is shared by docker-compose, the backend and the frontend.
  envDir: '..',
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Node's fetch needs an absolute URL; the mock handlers match any origin.
    env: { VITE_API_BASE_URL: 'http://localhost/api/v1' },
  },
})
