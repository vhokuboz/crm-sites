import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      // Vendors em chunks proprios: mudar o app nao invalida o cache deles.
      output: {
        manualChunks: (id) =>
          id.includes('@supabase') ? 'supabase' : /node_modules\/(react|react-dom|scheduler)\//.test(id) ? 'react' : undefined,
      },
    },
  },
})
