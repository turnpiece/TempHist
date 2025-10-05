import { defineConfig } from 'vite'
import { copyFileSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

// Read package.json to get version
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version)
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        about: resolve(__dirname, 'about.html'),
        privacy: resolve(__dirname, 'privacy.html')
      }
    }
  },
  plugins: [
    {
      name: 'copy-static-files',
      writeBundle() {
        // Copy .htaccess if it exists
        try {
          copyFileSync('.htaccess', 'dist/.htaccess')
        } catch (error) {
          // .htaccess might not exist, that's okay
        }
        // Copy favicon
        copyFileSync('favicon.ico', 'dist/favicon.ico')
        // Copy assets directory
        const { execSync } = require('child_process')
        execSync('cp -r assets dist/', { stdio: 'inherit' })
        
        console.log(`✅ Copied static files to dist/`)
      }
    }
  ]
})
