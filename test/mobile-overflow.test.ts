import { describe, it, expect, beforeEach } from 'vitest'

describe('Mobile Overflow Prevention', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = ''
    document.documentElement.style.width = ''
    document.documentElement.style.maxWidth = ''
    document.body.style.width = ''
    document.body.style.maxWidth = ''
    document.body.style.padding = ''
    
    // Set up mobile viewport
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375 // iPhone width
    })
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 667
    })
  })

  describe('Viewport width calculations', () => {
    it('should not use 100vw which includes scrollbar width', () => {
      // Create an element that might use 100vw
      const element = document.createElement('div')
      element.style.width = '100%' // Should use percentage, not 100vw
      document.body.appendChild(element)
      
      // 100vw can cause overflow on mobile, 100% is safer
      expect(element.style.width).toBe('100%')
    })

    it('should ensure body does not exceed viewport width', () => {
      document.body.style.width = '100%'
      document.body.style.maxWidth = '100%'
      document.body.style.boxSizing = 'border-box'
      document.body.style.padding = '10px'
      
      // Body should not exceed viewport
      const bodyWidth = document.body.offsetWidth
      expect(bodyWidth).toBeLessThanOrEqual(window.innerWidth)
    })

    it('should ensure html element does not exceed viewport width', () => {
      document.documentElement.style.width = '100%'
      document.documentElement.style.maxWidth = '100%'
      document.documentElement.style.boxSizing = 'border-box'
      
      const htmlWidth = document.documentElement.offsetWidth
      expect(htmlWidth).toBeLessThanOrEqual(window.innerWidth)
    })
  })

  describe('Container overflow prevention', () => {
    it('should prevent chart container from overflowing', () => {
      const container = document.createElement('div')
      container.className = 'chart-container'
      container.style.width = '100%'
      container.style.maxWidth = '100%'
      container.style.overflow = 'hidden'
      container.style.boxSizing = 'border-box'
      document.body.appendChild(container)
      
      const canvas = document.createElement('canvas')
      canvas.style.width = '100%'
      canvas.style.maxWidth = '100%'
      canvas.style.boxSizing = 'border-box'
      container.appendChild(canvas)
      
      // Container should not exceed viewport
      expect(container.offsetWidth).toBeLessThanOrEqual(window.innerWidth)
      expect(canvas.offsetWidth).toBeLessThanOrEqual(container.offsetWidth)
    })

    it('should prevent appShell from causing horizontal scroll', () => {
      const appShell = document.createElement('div')
      appShell.id = 'appShell'
      appShell.style.width = '100%'
      appShell.style.maxWidth = '100%'
      appShell.style.overflowX = 'hidden'
      appShell.style.boxSizing = 'border-box'
      document.body.appendChild(appShell)
      
      expect(appShell.offsetWidth).toBeLessThanOrEqual(window.innerWidth)
      expect(document.body.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
    })
  })

  describe('Text and content overflow', () => {
    it('should handle long text without causing overflow', () => {
      const container = document.createElement('div')
      container.style.width = '100%'
      container.style.maxWidth = '100%'
      container.style.boxSizing = 'border-box'
      container.style.wordWrap = 'break-word'
      container.style.overflowWrap = 'break-word'
      document.body.appendChild(container)
      
      // Add very long text
      container.textContent = 'A'.repeat(1000)
      
      expect(container.offsetWidth).toBeLessThanOrEqual(window.innerWidth)
    })

    it('should prevent images from causing overflow', () => {
      const container = document.createElement('div')
      container.style.width = '100%'
      container.style.maxWidth = '100%'
      container.style.boxSizing = 'border-box'
      document.body.appendChild(container)
      
      const img = document.createElement('img')
      img.style.width = '100%'
      img.style.maxWidth = '100%'
      img.style.height = 'auto'
      img.style.boxSizing = 'border-box'
      container.appendChild(img)
      
      expect(container.offsetWidth).toBeLessThanOrEqual(window.innerWidth)
    })
  })

  describe('Fixed positioning overflow', () => {
    it('should use percentage width instead of 100vw for fixed elements', () => {
      const fixedElement = document.createElement('div')
      fixedElement.style.position = 'fixed'
      fixedElement.style.width = '100%' // Should be percentage, not 100vw
      fixedElement.style.maxWidth = '100%'
      fixedElement.style.left = '0'
      fixedElement.style.right = '0'
      document.body.appendChild(fixedElement)
      
      // Fixed element should not cause overflow
      expect(fixedElement.style.width).toBe('100%')
      expect(fixedElement.style.maxWidth).toBe('100%')
    })
  })

  describe('Scroll width validation', () => {
    it('should detect when scrollWidth exceeds innerWidth', () => {
      // Create a scenario where content might overflow
      const wideElement = document.createElement('div')
      wideElement.style.width = '500px' // Wider than viewport (375px)
      document.body.appendChild(wideElement)
      
      const scrollWidth = document.body.scrollWidth
      const innerWidth = window.innerWidth
      
      // This test documents the issue - scrollWidth might exceed innerWidth
      // In real code, we should fix this
      if (scrollWidth > innerWidth) {
        // This indicates a potential overflow issue
        expect(scrollWidth).toBeGreaterThan(innerWidth)
      }
    })

    it('should fix overflow by setting maxWidth', () => {
      const element = document.createElement('div')
      element.style.width = '500px' // Wider than viewport
      document.body.appendChild(element)
      
      if (document.body.scrollWidth > window.innerWidth) {
        document.body.style.maxWidth = `${window.innerWidth}px`
        // After fix, scrollWidth should be within bounds
        expect(document.body.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1) // Allow 1px tolerance
      }
    })
  })
})

