import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  base: './',  // Important for relative paths
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
    assetsInlineLimit: 4096  // Inline small assets
  },
  server: {
    port: 3000,
    open: true
  },
  optimizeDeps: {
    include: ['three', 'postprocessing', 'tweakpane']
  }
});