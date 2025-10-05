import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom', // For DOM testing
    globals: true, // Enable global test functions (describe, it, expect)
    setupFiles: ['./test/setup.ts'], // Test setup file
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
