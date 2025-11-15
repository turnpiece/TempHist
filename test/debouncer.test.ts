import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Debouncer } from '../src/utils/Debouncer'

describe('Debouncer', () => {
  beforeEach(() => {
    // Clear all debounced functions before each test
    Debouncer.clearAll()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('debounce', () => {
    it('should delay function execution', () => {
      const callback = vi.fn()
      const debounced = Debouncer.debounce('test-key', callback, 300)

      debounced('arg1', 'arg2')
      expect(callback).not.toHaveBeenCalled()

      vi.advanceTimersByTime(300)
      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith('arg1', 'arg2')
    })

    it('should cancel previous timer but accumulate callbacks when called multiple times', () => {
      const callback = vi.fn()
      const debounced = Debouncer.debounce('test-key', callback, 300)

      debounced('first')
      vi.advanceTimersByTime(200)
      expect(callback).not.toHaveBeenCalled()

      debounced('second')
      // Timer was reset, so we need to wait 300ms from this point
      vi.advanceTimersByTime(299)
      expect(callback).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1)
      // The implementation accumulates callbacks, so both calls execute
      // but with the latest arguments
      expect(callback).toHaveBeenCalled()
      // The last call's arguments are used for all accumulated callbacks
      expect(callback).toHaveBeenCalledWith('second')
    })

    it('should execute immediately when immediate flag is true', () => {
      const callback = vi.fn()
      const debounced = Debouncer.debounce('test-key', callback, 300, true)

      debounced('arg1')
      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith('arg1')
    })

    it('should execute immediately on each call when immediate is true and no timer exists', () => {
      const callback = vi.fn()
      const debounced = Debouncer.debounce('test-key', callback, 300, true)

      debounced('first')
      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith('first')

      // After immediate execution, timer is cleared, so second call also executes immediately
      debounced('second')
      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenNthCalledWith(2, 'second')
    })

    it('should handle multiple callbacks with same key', () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn()
      const debounced1 = Debouncer.debounce('test-key', callback1, 300)
      const debounced2 = Debouncer.debounce('test-key', callback2, 300)

      debounced1('arg1')
      debounced2('arg2')

      vi.advanceTimersByTime(300)
      expect(callback1).toHaveBeenCalledWith('arg2')
      expect(callback2).toHaveBeenCalledWith('arg2')
    })

    it('should use default delay of 300ms when not specified', () => {
      const callback = vi.fn()
      const debounced = Debouncer.debounce('test-key', callback)

      debounced()
      vi.advanceTimersByTime(299)
      expect(callback).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1)
      expect(callback).toHaveBeenCalledTimes(1)
    })
  })

  describe('cancel', () => {
    it('should cancel a pending debounced function', () => {
      const callback = vi.fn()
      const debounced = Debouncer.debounce('test-key', callback, 300)

      debounced()
      Debouncer.cancel('test-key')

      vi.advanceTimersByTime(300)
      expect(callback).not.toHaveBeenCalled()
    })

    it('should not throw when canceling non-existent key', () => {
      expect(() => Debouncer.cancel('non-existent')).not.toThrow()
    })
  })

  describe('isPending', () => {
    it('should return true when a debounced function is pending', () => {
      const callback = vi.fn()
      const debounced = Debouncer.debounce('test-key', callback, 300)

      debounced()
      expect(Debouncer.isPending('test-key')).toBe(true)
    })

    it('should return false when no debounced function is pending', () => {
      expect(Debouncer.isPending('test-key')).toBe(false)
    })

    it('should return false after debounced function executes', () => {
      const callback = vi.fn()
      const debounced = Debouncer.debounce('test-key', callback, 300)

      debounced()
      vi.advanceTimersByTime(300)
      expect(Debouncer.isPending('test-key')).toBe(false)
    })
  })

  describe('clearAll', () => {
    it('should clear all pending debounced functions', () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn()
      const debounced1 = Debouncer.debounce('key1', callback1, 300)
      const debounced2 = Debouncer.debounce('key2', callback2, 300)

      debounced1()
      debounced2()
      Debouncer.clearAll()

      vi.advanceTimersByTime(300)
      expect(callback1).not.toHaveBeenCalled()
      expect(callback2).not.toHaveBeenCalled()
    })

    it('should reset isPending for all keys', () => {
      const callback = vi.fn()
      const debounced = Debouncer.debounce('test-key', callback, 300)

      debounced()
      expect(Debouncer.isPending('test-key')).toBe(true)

      Debouncer.clearAll()
      expect(Debouncer.isPending('test-key')).toBe(false)
    })
  })
})

