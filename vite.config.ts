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
        // Copy router.js
        copyFileSync('router.js', 'dist/router.js')
        // Copy .htaccess
        copyFileSync('.htaccess', 'dist/.htaccess')
        // Copy favicon
        copyFileSync('favicon.ico', 'dist/favicon.ico')
        // Copy stylesheets
        copyFileSync('styles.css', 'dist/styles.css')
        copyFileSync('styles.min.css', 'dist/styles.min.css')
        // Copy assets directory
        const { execSync } = require('child_process')
        execSync('cp -r assets dist/', { stdio: 'inherit' })
        
        // Add cache-busting to router.js in HTML files
        const timestamp = Date.now()
        const htmlFiles = ['dist/index.html', 'dist/about.html', 'dist/privacy.html']
        htmlFiles.forEach(file => {
          let content = readFileSync(file, 'utf8')
          content = content.replace(/router\.js"/g, `router.js?v=${timestamp}"`)
          writeFileSync(file, content)
        })
        console.log(`✅ Added cache-busting timestamp ${timestamp} to router.js references`)
      }
    }
  ]
})
