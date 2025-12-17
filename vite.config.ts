import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    // base: './' ensures assets are loaded relatively, which is required for dist/index.html to find js/css files
    base: './', 
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      // Reduce chunking to make file structure simpler
      rollupOptions: {
        output: {
          manualChunks: undefined
        }
      }
    }
  }
})