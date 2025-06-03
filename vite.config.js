import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';  // This import was missing!

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  base: './',
  plugins: [glsl()],  // This is required to process .glsl files
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
          'three': ['three'],
          'three-addons': ['three/examples/jsm/controls/OrbitControls.js'],
          'postprocessing': ['postprocessing'],
          'tweakpane': ['tweakpane']
        }
      }
    },
    assetsInlineLimit: 4096
  },
  server: {
    port: 3000,
    open: true
  },
  optimizeDeps: {
    include: ['three', 'postprocessing', 'tweakpane']
  }
});