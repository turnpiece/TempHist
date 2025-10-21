import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom', // For DOM testing
    globals: true, // Enable global test functions (describe, it, expect)
    setupFiles: ['./test/setup.ts'], // Test setup file
    env: {
      VITE_API_BASE: 'http://localhost:3000/api'
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'test/',
        'dist/',
        '**/*.config.js'
      ]
    }
  }
})
