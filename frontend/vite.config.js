import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/PantryAI/' : '/',
  plugins: [react()],
  css: {
    postcss: './postcss.config.js'
  }
}))
