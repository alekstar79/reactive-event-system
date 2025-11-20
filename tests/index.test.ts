import { describe, it, expect, beforeEach } from 'vitest'
import ReactiveEventSystem from '../src/index'

describe('EventBus', () => {
  let bus: ReactiveEventSystem

  beforeEach(() => {
    bus = new ReactiveEventSystem()
  })

  describe('Basic Event Handling', () => {
    it('should emit and receive events', () => {
      let received = false
      bus.on('test', () => {
        received = true
      })
      bus.emit('test', {})
      expect(received).toBe(true)
    })

    it('should pass data to listeners', () => {
      let receivedData: any
      bus.on('message', (data) => {
        receivedData = data
      })
      const testData = { text: 'hello' }
      bus.emit('message', testData)
      expect(receivedData).toEqual(testData)
    })

    it('should return true if event had listeners', () => {
      bus.on('test', () => {})
      expect(bus.emit('test', {})).toBe(true)
    })

    it('should return false if event had no listeners', () => {
      expect(bus.emit('test', {})).toBe(false)
    })
  })

  describe('One-time Events', () => {
    it('should only call once listener once', () => {
      let count = 0
      bus.once('test', () => {
        count++
      })
      bus.emit('test', {})
      bus.emit('test', {})
      expect(count).toBe(1)
    })

    it('should return unsubscribe function', () => {
      let called = false
      const unsubscribe = bus.once('test', () => {
        called = true
      })
      unsubscribe()
      bus.emit('test', {})
      expect(called).toBe(false)
    })
  })

  describe('Subscription Management', () => {
    it('should unsubscribe from events', () => {
      let count = 0
      const handler = () => count++
      const unsubscribe = bus.on('test', handler)
      bus.emit('test', {})
      unsubscribe()
      bus.emit('test', {})
      expect(count).toBe(1)
    })

    it('should remove all listeners for event', () => {
      let count = 0
      bus.on('test', () => count++)
      bus.on('test', () => count++)
      bus.removeAllListeners('test')
      bus.emit('test', {})
      expect(count).toBe(0)
    })

    it('should remove all listeners', () => {
      let count = 0
      bus.on('event1', () => count++)
      bus.on('event2', () => count++)
      bus.removeAllListeners()
      bus.emit('event1', {})
      bus.emit('event2', {})
      expect(count).toBe(0)
    })
  })

  describe('Listener Count', () => {
    it('should count regular listeners', () => {
      bus.on('test', () => {})
      bus.on('test', () => {})
      expect(bus.listenerCount('test')).toBe(2)
    })

    it('should count once listeners', () => {
      bus.once('test', () => {})
      expect(bus.listenerCount('test')).toBe(1)
    })

    it('should return zero for unknown events', () => {
      expect(bus.listenerCount('unknown')).toBe(0)
    })

    it('should check if event has listeners', () => {
      bus.on('test', () => {})
      expect(bus.hasListeners('test')).toBe(true)
      expect(bus.hasListeners('unknown')).toBe(false)
    })
  })

  describe('Event Names', () => {
    it('should return all event names', () => {
      bus.on('event1', () => {})
      bus.on('event2', () => {})
      bus.once('event3', () => {})
      const names = bus.eventNames()
      expect(names).toContain('event1')
      expect(names).toContain('event2')
      expect(names).toContain('event3')
    })

    it('should return empty array when no listeners', () => {
      expect(bus.eventNames()).toEqual([])
    })

    it('should not duplicate event names', () => {
      bus.on('test', () => {})
      bus.once('test', () => {})
      const names = bus.eventNames()
      expect(names.filter(n => n === 'test').length).toBe(1)
    })
  })

  describe('Error Handling', () => {
    it('should handle errors in listeners', () => {
      let errorHandled = false
      const customBus = new ReactiveEventSystem({
        errorHandler: (_error) => {
          errorHandled = true
        }
      })

      customBus.on('test', () => {
        throw new Error('Test error')
      })
      customBus.emit('test', {})
      expect(errorHandled).toBe(true)
    })

    it('should increment error count on error', () => {
      const customBus = new ReactiveEventSystem({ enableMetrics: true })
      customBus.on('test', () => {
        throw new Error('Test error')
      })
      customBus.emit('test', {})
      const metrics = customBus.getMetrics()
      expect(metrics.state.errorCount).toBe(1)
    })

    it('should throw TypeError for non-function listeners', () => {
      expect(() => {
        bus.on('test', 'not a function' as any)
      }).toThrow(TypeError)
    })
  })

  describe('Middleware', () => {
    it('should apply middleware transformation', () => {
      let receivedData: any
      bus.use('test', (data) => {
        return { ...data, modified: true }
      })
      bus.on('test', (data) => {
        receivedData = data
      })
      bus.emit('test', { original: true })
      expect(receivedData.modified).toBe(true)
    })

    it('should apply global middleware', () => {
      let called = false
      bus.use('*', () => {
        called = true
      })
      bus.emit('any', {})
      expect(called).toBe(true)
    })

    it('should unregister middleware', () => {
      let count = 0
      const unregister = bus.use('test', (data) => {
        count++
        return data
      })
      bus.emit('test', {})
      unregister()
      bus.emit('test', {})
      expect(count).toBe(1)
    })
  })

  describe('Metrics', () => {
    it('should track total events emitted', () => {
      const customBus = new ReactiveEventSystem({ enableMetrics: true })
      customBus.on('test', () => {})
      customBus.emit('test', {})
      customBus.emit('test', {})
      const metrics = customBus.getMetrics()
      expect(metrics.state.totalEventsEmitted).toBe(2)
    })

    it('should track last emitted event', () => {
      const customBus = new ReactiveEventSystem({ enableMetrics: true })
      customBus.emit('event1', {})
      customBus.emit('event2', {})
      const metrics = customBus.getMetrics()
      expect(metrics.state.lastEmittedEvent).toBe('event2')
    })

    it('should track active listeners count', () => {
      const customBus = new ReactiveEventSystem({ enableMetrics: true })
      customBus.on('test', () => {})
      customBus.on('test', () => {})
      const metrics = customBus.getMetrics()
      expect(metrics.state.activeListeners).toBe(2)
    })
  })

  describe('WaitFor', () => {
    it('should wait for event', async () => {
      setTimeout(() => bus.emit('test', { data: 'hello' }), 10)
      const data = await bus.waitFor('test')
      expect(data).toEqual({ data: 'hello' })
    })

    it('should timeout if event not emitted', async () => {
      try {
        await bus.waitFor('test', 10)
        expect.fail('Should have thrown')
      } catch (error) {
        expect((error as Error).message).toContain('Timeout')
      }
    })
  })

  describe('Piping', () => {
    it('should pipe events to another bus', () => {
      const targetBus = new ReactiveEventSystem()
      let received: any
      targetBus.on('test', (data) => {
        received = data
      })
      bus.pipe('test', targetBus)
      const testData = { text: 'piped' }
      bus.emit('test', testData)
      expect(received).toEqual(testData)
    })

    it('should unpipe events', () => {
      const targetBus = new ReactiveEventSystem()
      let count = 0
      targetBus.on('test', () => count++)
      const unpipe = bus.pipe('test', targetBus)
      bus.emit('test', {})
      unpipe()
      bus.emit('test', {})
      expect(count).toBe(1)
    })

    it('should pipe with event name transformation', () => {
      const targetBus = new ReactiveEventSystem()
      let received: any
      targetBus.on('transformed', (data) => {
        received = data
      })
      bus.pipe('original', targetBus, 'transformed')
      const testData = { text: 'test' }
      bus.emit('original', testData)
      expect(received).toEqual(testData)
    })
  })

  describe('Cleanup', () => {
    it('should destroy bus and cleanup resources', () => {
      bus.on('test', () => {})
      bus.destroy()
      expect(bus.eventNames().length).toBe(0)
      expect(bus.listenerCount('test')).toBe(0)
    })
  })
})
