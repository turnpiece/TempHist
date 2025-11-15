import { defineConfig, loadEnv } from 'vite'
import { copyFileSync, readFileSync, existsSync } from 'fs'
import { resolve, join } from 'path'
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
      name: 'inject-templates',
      transformIndexHtml(html, ctx) {
        const templatesDir = resolve(__dirname, 'templates')
        
        // Determine page context for variable substitution
        const pageName = ctx.filename || 'index.html'
        const isIndex = pageName.includes('index.html')
        const isAbout = pageName.includes('about.html')
        const isPrivacy = pageName.includes('privacy.html')
        
        // Define variables for template substitution
        const vars = {
          HOME_LINK: isIndex ? '#/today' : '/',
          TODAY_LINK: isIndex ? '#/today' : '/#/today',
          WEEK_LINK: isIndex ? '#/week' : '/#/week',
          MONTH_LINK: isIndex ? '#/month' : '/#/month',
          YEAR_LINK: isIndex ? '#/year' : '/#/year',
          ABOUT_LINK: isIndex ? '#/about' : '/about',
          PRIVACY_LINK: isIndex ? '#/privacy' : '/privacy',
          ABOUT_ACTIVE: isAbout ? ' class="active"' : '',
          PRIVACY_ACTIVE: isPrivacy ? ' class="active"' : ''
        }
        
        // Helper function to load and substitute template
        const loadTemplate = (templateName: string, extension: string = 'html') => {
          const templatePath = join(templatesDir, `${templateName}.${extension}`)
          if (!existsSync(templatePath)) {
            console.warn(`Template not found: ${templatePath}`)
            return ''
          }
          let content = readFileSync(templatePath, 'utf-8')
          // Replace variables
          Object.entries(vars).forEach(([key, value]) => {
            content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
          })
          return content
        }
        
        // Load WebApplication JSON template
        const webAppJson = JSON.parse(loadTemplate('webapplication-json', 'json'))
        
        // Replace template placeholders
        html = html.replace(/<!-- INCLUDE:head-common -->/g, loadTemplate('head-common'))
        html = html.replace(/<!-- INCLUDE:header -->/g, loadTemplate('header'))
        html = html.replace(/<!-- INCLUDE:nav -->/g, loadTemplate('nav'))
        
        // Handle WebApplication JSON injection
        // For index.html, we need to merge with additional properties
        if (isIndex && html.includes('<!-- INCLUDE:webapplication-json -->')) {
          // Merge WebApplication JSON with additional properties
          const mergedJson = {
            ...webAppJson,
            operatingSystem: "Web Browser",
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "USD"
            },
            featureList: [
              "Historical temperature comparison",
              "Location-based weather data",
              "Interactive temperature charts",
              "50-year historical data",
              "Daily, weekly, monthly, and yearly views"
            ],
            browserRequirements: "Requires JavaScript and location access",
            screenshot: "https://temphist.com/assets/logo.png"
          }
          // Format the merged JSON with proper indentation (skip the outer braces)
          const mergedJsonStr = JSON.stringify(mergedJson, null, 2)
            .split('\n')
            .slice(1, -1) // Remove first and last lines (opening and closing braces)
            .map(line => '      ' + line)
            .join('\n')
          // Replace from after @context to the closing brace, removing the placeholder and all properties
          html = html.replace(
            /"@context": "https:\/\/schema\.org",\s*<!-- INCLUDE:webapplication-json -->,[\s\S]*?"screenshot": "https:\/\/temphist\.com\/assets\/logo\.png"\s*\n\s*\}/m,
            `"@context": "https://schema.org",\n${mergedJsonStr}\n    }`
          )
        } else {
          // For other pages, just replace the placeholder with the JSON
          const webAppJsonStr = JSON.stringify(webAppJson, null, 2)
            .split('\n')
            .map((line, i) => i === 0 ? line : '        ' + line)
            .join('\n')
          html = html.replace(/<!-- INCLUDE:webapplication-json -->/g, webAppJsonStr)
        }
        
        return html
      }
    },
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
        // Copy favicon files
        copyFileSync('favicon.ico', 'dist/favicon.ico')
        const faviconSizes = [16, 32, 48, 64, 192, 512]
        faviconSizes.forEach(size => {
          const src = `favicon-${size}.png`
          if (existsSync(src)) {
            copyFileSync(src, `dist/${src}`)
          }
        })
        // Copy apple touch icon
        if (existsSync('apple-touch-icon.png')) {
          copyFileSync('apple-touch-icon.png', 'dist/apple-touch-icon.png')
        }
        // Assets are now in public/ directory and handled by Vite automatically
        // But we still copy them here as a backup to ensure they're present
        if (existsSync('assets')) {
          execSync('cp -r assets dist/', { stdio: 'inherit' })
        }
        
        console.log(`✅ Copied static files to dist/`)
      }
    }
  ]
  }
})
