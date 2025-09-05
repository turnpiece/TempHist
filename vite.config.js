import { defineConfig } from 'vite'
import { copyFileSync } from 'fs'
import { resolve } from 'path'

export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      }
    }
  },
  plugins: [
    {
      name: 'copy-static-files',
      writeBundle() {
        // Copy privacy.html
        copyFileSync('privacy.html', 'dist/privacy.html')
        // Copy .htaccess
        copyFileSync('.htaccess', 'dist/.htaccess')
        // Copy stylesheets
        copyFileSync('styles.css', 'dist/styles.css')
        copyFileSync('styles.min.css', 'dist/styles.min.css')
        // Copy assets directory
        const { execSync } = require('child_process')
        execSync('cp -r assets dist/', { stdio: 'inherit' })
      }
    }
  ]
})
