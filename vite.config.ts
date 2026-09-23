import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(moduleId) {
          if (moduleId.includes('node_modules/react') || moduleId.includes('node_modules/react-dom') || moduleId.includes('node_modules/react-markdown') || moduleId.includes('node_modules/remark-gfm')) return 'react'
          if (moduleId.includes('node_modules/@supabase')) return 'supabase'
          return undefined
        },
      },
    },
  },
})
