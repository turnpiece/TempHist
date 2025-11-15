import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Logger, LogLevel } from '../src/utils/Logger'

describe('Logger', () => {
  beforeEach(() => {
    Logger.clearLogs()
    Logger.configure({
      level: LogLevel.DEBUG,
      maxLogs: 1000
    })
    vi.spyOn(console, 'debug').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Configuration', () => {
    it('should configure log level', () => {
      Logger.configure({ level: LogLevel.WARN })
      Logger.debug('debug message')
      Logger.warn('warn message')

      const logs = Logger.getLogs()
      expect(logs.length).toBe(1)
      expect(logs[0].level).toBe(LogLevel.WARN)
    })

    it('should configure max logs', () => {
      Logger.configure({ maxLogs: 5 })
      
      for (let i = 0; i < 10; i++) {
        Logger.info(`message ${i}`)
      }

      const logs = Logger.getLogs()
      expect(logs.length).toBe(5)
      expect(logs[0].message).toBe('message 5')
      expect(logs[4].message).toBe('message 9')
    })
  })

  describe('Logging Methods', () => {
    it('should log debug messages', () => {
      Logger.debug('debug message', { key: 'value' })
      const logs = Logger.getLogs()
      
      expect(logs.length).toBe(1)
      expect(logs[0].level).toBe(LogLevel.DEBUG)
      expect(logs[0].message).toBe('debug message')
      expect(logs[0].context?.key).toBe('value')
      expect(console.debug).toHaveBeenCalled()
    })

    it('should log info messages', () => {
      Logger.info('info message')
      const logs = Logger.getLogs()
      
      expect(logs.length).toBe(1)
      expect(logs[0].level).toBe(LogLevel.INFO)
      expect(logs[0].message).toBe('info message')
      expect(console.info).toHaveBeenCalled()
    })

    it('should log warn messages', () => {
      Logger.warn('warn message')
      const logs = Logger.getLogs()
      
      expect(logs.length).toBe(1)
      expect(logs[0].level).toBe(LogLevel.WARN)
      expect(logs[0].message).toBe('warn message')
      expect(console.warn).toHaveBeenCalled()
    })

    it('should log error messages with error object', () => {
      const error = new Error('test error')
      Logger.error('error message', error, { context: 'value' })
      const logs = Logger.getLogs()
      
      expect(logs.length).toBe(1)
      expect(logs[0].level).toBe(LogLevel.ERROR)
      expect(logs[0].message).toBe('error message')
      expect(logs[0].context?.error).toBe('test error')
      expect(logs[0].context?.stack).toBeDefined()
      expect(logs[0].context?.context).toBe('value')
      expect(console.error).toHaveBeenCalled()
    })

    it('should log fatal messages', () => {
      const error = new Error('fatal error')
      Logger.fatal('fatal message', error)
      const logs = Logger.getLogs()
      
      expect(logs.length).toBe(1)
      expect(logs[0].level).toBe(LogLevel.FATAL)
      expect(logs[0].message).toBe('fatal message')
      expect(console.error).toHaveBeenCalled()
    })

    it('should respect log level filtering', () => {
      Logger.configure({ level: LogLevel.WARN })
      Logger.debug('debug')
      Logger.info('info')
      Logger.warn('warn')
      Logger.error('error')

      const logs = Logger.getLogs()
      expect(logs.length).toBe(2)
      expect(logs[0].level).toBe(LogLevel.WARN)
      expect(logs[1].level).toBe(LogLevel.ERROR)
    })
  })

  describe('Performance Logging', () => {
    it('should start and end performance measurement', () => {
      vi.spyOn(performance, 'now')
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1500)

      Logger.startPerformance('test-operation')
      Logger.endPerformance('test-operation')

      const entries = Logger.getPerformanceEntries()
      expect(entries.length).toBe(1)
      expect(entries[0].name).toBe('test-operation')
      expect(entries[0].duration).toBe(500)
    })

    it('should return null when ending non-existent performance entry', () => {
      const result = Logger.endPerformance('non-existent')
      expect(result).toBeNull()
    })

    it('should get performance summary', () => {
      vi.spyOn(performance, 'now')
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1500)
        .mockReturnValueOnce(2000)
        .mockReturnValueOnce(2500)

      Logger.startPerformance('fast')
      Logger.endPerformance('fast')
      Logger.startPerformance('slow')
      Logger.endPerformance('slow')

      const summary = Logger.getPerformanceSummary()
      expect(summary.totalEntries).toBe(2)
      expect(summary.averageDuration).toBe(500)
      // Both entries have same duration, so either could be slowest/fastest
      expect(['fast', 'slow']).toContain(summary.slowestEntry?.name)
      expect(['fast', 'slow']).toContain(summary.fastestEntry?.name)
    })

    it('should return empty summary when no entries', () => {
      const summary = Logger.getPerformanceSummary()
      expect(summary.totalEntries).toBe(0)
      expect(summary.averageDuration).toBe(0)
      expect(summary.slowestEntry).toBeNull()
      expect(summary.fastestEntry).toBeNull()
    })
  })

  describe('Specialized Logging', () => {
    it('should log user interactions', () => {
      Logger.logUserInteraction('click', 'button', { id: 'submit' })
      const logs = Logger.getLogs()
      
      expect(logs.length).toBe(1)
      expect(logs[0].message).toContain('User interaction: click')
      expect(logs[0].context?.type).toBe('user_interaction')
      expect(logs[0].context?.action).toBe('click')
      expect(logs[0].context?.element).toBe('button')
      expect(logs[0].context?.id).toBe('submit')
    })

    it('should log API calls', () => {
      Logger.logApiCall('GET', '/api/data', 200, 150, { cache: true })
      const logs = Logger.getLogs()
      
      expect(logs.length).toBe(1)
      expect(logs[0].message).toContain('API call: GET /api/data')
      expect(logs[0].context?.type).toBe('api_call')
      expect(logs[0].context?.method).toBe('GET')
      expect(logs[0].context?.url).toBe('/api/data')
      expect(logs[0].context?.status).toBe(200)
      expect(logs[0].context?.duration).toBe(150)
      expect(logs[0].context?.cache).toBe(true)
    })

    it('should log navigation', () => {
      Logger.logNavigation('/home', '/about', { source: 'link' })
      const logs = Logger.getLogs()
      
      expect(logs.length).toBe(1)
      expect(logs[0].message).toContain('Navigation: /home → /about')
      expect(logs[0].context?.type).toBe('navigation')
      expect(logs[0].context?.from).toBe('/home')
      expect(logs[0].context?.to).toBe('/about')
      expect(logs[0].context?.source).toBe('link')
    })
  })

  describe('Log Retrieval', () => {
    it('should get all logs', () => {
      Logger.info('message 1')
      Logger.warn('message 2')
      Logger.error('message 3')

      const logs = Logger.getLogs()
      expect(logs.length).toBe(3)
    })

    it('should get logs by level', () => {
      Logger.debug('debug')
      Logger.info('info')
      Logger.warn('warn')
      Logger.error('error')

      const errorLogs = Logger.getLogsByLevel(LogLevel.ERROR)
      expect(errorLogs.length).toBe(1)
      expect(errorLogs[0].message).toBe('error')
    })

    it('should return a copy of logs, not the original array', () => {
      Logger.info('message')
      const logs1 = Logger.getLogs()
      const logs2 = Logger.getLogs()
      
      expect(logs1).not.toBe(logs2)
      expect(logs1).toEqual(logs2)
    })
  })

  describe('Log Management', () => {
    it('should clear all logs', () => {
      Logger.info('message 1')
      Logger.warn('message 2')
      Logger.clearLogs()

      expect(Logger.getLogs().length).toBe(0)
      expect(Logger.getPerformanceEntries().length).toBe(0)
    })

    it('should export logs as JSON', () => {
      Logger.info('test message', { key: 'value' })
      const exported = Logger.exportLogs()
      const parsed = JSON.parse(exported)

      expect(parsed.logs).toBeDefined()
      expect(parsed.logs.length).toBe(1)
      expect(parsed.logs[0].message).toBe('test message')
      expect(parsed.sessionId).toBeDefined()
      expect(parsed.timestamp).toBeDefined()
    })
  })
})

