import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  base: './',
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
          'three-addons': ['three/examples/jsm/controls/OrbitControls.js', 
                          'three/examples/jsm/postprocessing/EffectComposer.js',
                          'three/examples/jsm/postprocessing/RenderPass.js',
                          'three/examples/jsm/postprocessing/UnrealBloomPass.js',
                          'three/examples/jsm/postprocessing/ShaderPass.js',
                          'three/examples/jsm/shaders/FXAAShader.js'],
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