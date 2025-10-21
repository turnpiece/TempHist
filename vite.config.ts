import { defineConfig, loadEnv } from 'vite'
import { copyFileSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { execSync } from 'child_process'

// Read package.json to get version
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version)
    },
  publicDir: 'public',
  build: {
    outDir: 'dist',
    minify: 'terser',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        about: resolve(__dirname, 'about.html'),
        privacy: resolve(__dirname, 'privacy.html')
      }
    }
  },
  esbuild: {
    target: 'es2015'
  },
  plugins: [
    {
      name: 'replace-env-vars',
      transformIndexHtml(html) {
        // Replace %VITE_API_BASE% with actual environment variable
        const apiBase = env.VITE_API_BASE || 'https://api.temphist.com'
        return html.replace(/%VITE_API_BASE%/g, apiBase)
      }
    },
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
        execSync('cp -r assets dist/', { stdio: 'inherit' })
        
        // Copy data directory if it exists
        try {
          execSync('cp -r public/data dist/', { stdio: 'inherit' })
          console.log(`✅ Copied data directory to dist/`)
        } catch (error) {
          // Data directory might not exist, that's okay
        }
        
        console.log(`✅ Copied static files to dist/`)
      }
    }
  ]
  }
})
