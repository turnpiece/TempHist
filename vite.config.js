import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: '0.0.0.0', // Allow external connections
    port: 5174, // Keep the configured port
    https: false, // Disable HTTPS for local development
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  },
  // Build configuration for production-like testing
  base: '',
  build: {
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js'
      }
    },
    // Ensure proper module resolution
    target: 'es2015',
    minify: false, // Keep readable for debugging
    sourcemap: true,
    // Ensure all dependencies are bundled
    commonjsOptions: {
      include: [/node_modules/]
    }
  },
  // Handle CSS imports properly
  css: {
    devSourcemap: true
  },
  // Ensure Firebase and other modules are properly resolved
  resolve: {
    alias: {
      // Add any specific module aliases if needed
    }
  },
  // Optimize dependencies
  optimizeDeps: {
    include: ['firebase/app', 'firebase/auth']
  }
})
