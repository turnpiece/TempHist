import { vi } from 'vitest'

// Mock Chart.js
global.Chart = vi.fn().mockImplementation(() => ({
  destroy: vi.fn(),
  update: vi.fn(),
  data: { datasets: [] },
  options: { scales: {} }
}))

// Mock Chart.getChart
Chart.getChart = vi.fn()

// Mock Firebase
global.firebase = {
  initializeApp: vi.fn(),
  getAuth: vi.fn(() => ({
    signInAnonymously: vi.fn().mockResolvedValue({}),
    onAuthStateChanged: vi.fn()
  })),
  signInAnonymously: vi.fn().mockResolvedValue({}),
  onAuthStateChanged: vi.fn()
}

// Mock fetch
global.fetch = vi.fn()

// Mock navigator.geolocation
Object.defineProperty(navigator, 'geolocation', {
  value: {
    getCurrentPosition: vi.fn(),
    watchPosition: vi.fn(),
    clearWatch: vi.fn()
  },
  writable: true
})

// Mock document.cookie with proper getter/setter behavior
let cookieStore = ''

Object.defineProperty(document, 'cookie', {
  get() {
    return cookieStore
  },
  set(value) {
    // Simulate browser cookie behavior
    if (value.includes('=')) {
      const [nameValue] = value.split(';')
      const [name, val] = nameValue.split('=')
      // Remove existing cookie with same name
      cookieStore = cookieStore
        .split(';')
        .filter(cookie => !cookie.trim().startsWith(name + '='))
        .join(';')
        .replace(/^;|;$/g, '')
      
      // Add new cookie
      if (cookieStore) {
        cookieStore += ';'
      }
      cookieStore += nameValue
    }
  }
})

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    href: 'http://localhost:3000',
    hostname: 'localhost',
    protocol: 'http:',
    hash: '',
    pathname: '/',
    search: '',
    port: '3000',
    host: 'localhost:3000',
    origin: 'http://localhost:3000',
    assign: vi.fn(),
    replace: vi.fn(),
    reload: vi.fn()
  },
  writable: true
})

// Mock console methods to avoid noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn()
}

// Mock debugLog function used by TypeScript modules
global.debugLog = vi.fn();

// Mock import.meta.env for Vite environment variables
Object.defineProperty(global, 'import', {
  value: {
    meta: {
      env: {
        VITE_API_BASE: 'http://localhost:3000/api',
        DEV: false,
        PROD: true,
        SSR: false
      }
    }
  },
  writable: true
});

// Helper to clear cookies between tests
global.clearCookies = () => {
  cookieStore = ''
}
