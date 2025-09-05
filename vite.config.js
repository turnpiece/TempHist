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
      }
    }
  ]
})
