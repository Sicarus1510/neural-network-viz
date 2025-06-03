import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  build: {
    target: 'es2020',
    outDir: '../dist',
    emptyOutDir: true,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          postprocessing: ['postprocessing']
        }
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
});