// vite.config.js - Update to this
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/PantryAI/',
  plugins: [react()],
  css: {
    postcss: './postcss.config.js'
  }
})
