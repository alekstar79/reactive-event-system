import { computed, reactive, effect, batch } from '@alekstar79/reactivity'

export * from '@alekstar79/reactivity'

export type EventData<T = Record<string, any>> = {
  [K in keyof T]: T[K]
}

/**
 * Interface for reactive event emitter state
 */
export interface EventSystemState {
  totalEventsEmitted: number
  lastEmittedEvent: string | null
  activeListeners: number
  errorCount: number
}

/**
 * Interface for event middleware function
 */
export interface EventMiddleware<T = EventData> {
  (data: T, event: string, self?: EventSystem): T | void
}

/**
 * Interface for stream object
 */
export interface EventStream<T = EventData> {
  subscribe: (listener: (data: T) => void) => () => void
  destroy: () => void
  state: {
    value: T | null
    count: number
  }
}

/**
 * Interface for event-system metrics
 */
export interface EventSystemMetrics {
  state: EventSystemState
  events: () => string[]
  totalListeners: () => number
}

export interface EventSystem<T extends EventData = EventData> {
  on(event: string, listener: (data: T) => void, options?: { reactive?: boolean }): () => void
  once(event: string, listener: (data: T) => void, options?: { reactive?: boolean }): () => void
  off(event: string, listener: (data: T) => void): void
  emit(event: string, data: T): boolean
  listenerCount(event: string): number
  removeAllListeners(event?: string): void
  eventNames(): string[]
  hasListeners(event: string): boolean
  use(event: string, middleware: EventMiddleware<T>): () => void
  stream(event: string): EventStream<T>
  getMetrics(): EventSystemMetrics
  waitFor(event: string, timeout?: number): Promise<T>
  pipe(fromEvent: string, toEmitter: EventSystem, toEvent?: string): () => void
  destroy(): void
}

/**
 * @class ReactiveEventSystem
 * @classdesc High-performance reactive event system with batched updates, middleware support, and streaming capabilities
 * @template T - Event data type
 *
 * @example
 * // Basic usage
 * const bus = new ReactiveEventSystem()
 * bus.on('message', (data) => console.log(data))
 * bus.emit('message', { text: 'Hello' })
 *
 * @example
 * // With reactive streaming
 * const messageStream = bus.stream('messages')
 * effect(() => {
 *   console.log('Latest message:', messageStream.state.value)
 * })
 *
 * @example
 * // Middleware pipeline
 * bus.use('userAction', (data, event) => {
 *   return { ...data, timestamp: Date.now() }
 * })
 */
export default class ReactiveEventSystem<T extends EventData = EventData> implements EventSystem
{
  /**
   * @private
   * @type {Map<string, Set<Function>>}
   */
  private events: Map<string, Set<(data: T) => void>> = new Map()

  /**
   * @private
   * @type {Map<string, Set<Function>>}
   */
  private onceEvents: Map<string, Set<(data: T) => void>> = new Map()

  /**
   * @private
   * @type {WeakMap<Function, () => void>}
   */
  private reactiveEffects: WeakMap<Function, () => void> = new WeakMap()

  /**
   * @private
   * @type {EventSystemState}
   */
  private readonly reactiveState: EventSystemState

  /**
   * @private
   * @type {Map<string, any>}
   */
  private computedMetrics: Map<string, any> = new Map()

  /**
   * @private
   * @type {Map<string, EventMiddleware[]>}
   */
  private middleware: Map<string, EventMiddleware<T>[]> = new Map()

  /**
   * @private
   * Optional error handler
   */
  private readonly errorHandler?: (error: Error, event: string, listener: Function) => void

  /**
   * @constructor
   * @param {Object} [options] - Configuration options
   */
  constructor(options?: {
    enableMetrics?: boolean
    errorHandler?: (error: Error, event: string, listener: Function) => void
  }) {
    this.reactiveState = reactive({
      lastEmittedEvent: null,
      totalEventsEmitted: 0,
      activeListeners: 0,
      errorCount: 0
    })

    this.errorHandler = options?.errorHandler

    if (options?.enableMetrics) {
      this.setupMetrics()
    }
  }

  /**
   * Subscribe to an event with reactive context awareness
   * @method
   * @name ReactiveEventSystem#on
   * @param {string} event - Event name
   * @param {Function} listener - Callback function
   * @param {Object} [options] - Subscription options
   * @param {boolean} [options.reactive] - Enable reactive context for this listener
   * @returns {Function} Unsubscribe function
   */
  on(event: string, listener: (data: T) => void, options?: { reactive?: boolean }): () => void
  {
    if (typeof listener !== 'function') {
      throw new TypeError('The listener must be a function')
    }

    if (!this.events.has(event)) {
      this.events.set(event, new Set())
    }

    this.events.get(event)!.add(listener)

    if (options?.reactive) {
      this.setupReactiveEffect(listener)
    }

    this.updateMetrics()

    return () => {
      this.off(event, listener)
    }
  }

  /**
   * Subscribe to one-time event with reactive context
   * @method
   * @name ReactiveEventSystem#once
   * @param {string} event - Event name
   * @param {Function} listener - Callback function
   * @param {Object} [options] - Subscription options
   * @returns {Function} Unsubscribe function
   */
  once(event: string, listener: (data: T) => void, options?: { reactive?: boolean }): () => void
  {
    if (typeof listener !== 'function') {
      throw new TypeError('The listener must be a function')
    }

    const onceWrapper = (data: T) => {
      this.off(event, onceWrapper)
      return listener.call(this, data)
    }

    // Store reference to original listener for cleanup
    Object.defineProperty(onceWrapper, '_originalListener', {
      enumerable: false,
      configurable: false,
      writable: false,
      value: listener
    })

    if (!this.onceEvents.has(event)) {
      this.onceEvents.set(event, new Set())
    }

    this.onceEvents.get(event)!.add(onceWrapper)

    if (options?.reactive) {
      this.setupReactiveEffect(onceWrapper)
    }

    this.updateMetrics()

    return () => {
      this.off(event, onceWrapper)
    }
  }

  /**
   * Unsubscribe from event with reactive cleanup
   * @method
   * @name ReactiveEventSystem#off
   * @param {string} event - Event name
   * @param {Function} listener - Callback function to remove
   */
  off(event: string, listener: (data: T) => void): void
  {
    this.events.get(event)?.delete(listener)
    this.onceEvents.get(event)?.delete(listener)

    this.cleanupReactiveEffect(listener)
    this.updateMetrics()
  }

  /**
   * Emit event to all subscribers with reactive batching
   * @method
   * @name ReactiveEventSystem#emit
   * @param {string} event - Event name
   * @param {T} data - Data to pass to subscribers
   * @returns {boolean} Whether any listeners were called
   */
  emit(event: string, data: T): boolean
  {
    let hasListeners = false

    // Run middleware before emission
    const processedData = this.runMiddleware(event, data)

    // Batch reactive updates for better performance
    batch(() => {
      // Update reactive state
      this.reactiveState.totalEventsEmitted++
      this.reactiveState.lastEmittedEvent = event

      // Call regular listeners
      const regularListeners = this.events.get(event)
      if (regularListeners?.size) {
        hasListeners = true
        this.callListeners(regularListeners, processedData, event)
      }

      // Handle once listeners with automatic cleanup
      const onceListeners = this.onceEvents.get(event)
      if (onceListeners?.size) {
        hasListeners = true

        // Create copy to avoid modification during iteration
        const listenersToCall = new Set(onceListeners)
        onceListeners.clear()

        this.callListeners(listenersToCall, processedData, event)

        // Clean up reactive effects for once listeners
        listenersToCall.forEach(listener => {
          this.cleanupReactiveEffect(listener)
        })
      }
    })

    return hasListeners
  }

  /**
   * Get count of listeners for specific event
   * @method
   * @name ReactiveEventSystem#listenerCount
   * @param {string} event - Event name
   * @returns {number}
   */
  listenerCount(event: string): number
  {
    const regularCount = this.events.get(event)?.size ?? 0
    const onceCount = this.onceEvents.get(event)?.size ?? 0

    return regularCount + onceCount
  }

  /**
   * Remove all listeners for specific event or all events
   * @method
   * @name ReactiveEventSystem#removeAllListeners
   * @param {string} [event] - Event name (optional - if not provided, clears all)
   */
  removeAllListeners(event?: string): void
  {
    if (event) {
      // Clean up reactive effects for this event
      this.events.get(event)?.forEach(listener => this.cleanupReactiveEffect(listener))
      this.onceEvents.get(event)?.forEach(listener => this.cleanupReactiveEffect(listener))

      this.events.delete(event)
      this.onceEvents.delete(event)
    } else {
      // Clean up all reactive effects
      this.events.forEach(listeners => {
        listeners.forEach(listener => this.cleanupReactiveEffect(listener))
      })
      this.onceEvents.forEach(listeners => {
        listeners.forEach(listener => this.cleanupReactiveEffect(listener))
      })

      this.events.clear()
      this.onceEvents.clear()
    }

    this.updateMetrics()
  }

  /**
   * Get array of all event names that have listeners
   * @method
   * @name ReactiveEventSystem#eventNames
   * @returns {string[]}
   */
  eventNames(): string[]
  {
    const allEvents = new Set<string>()

    this.events.forEach((_, event) => allEvents.add(event))
    this.onceEvents.forEach((_, event) => allEvents.add(event))

    return Array.from(allEvents)
  }

  /**
   * Check if event has any listeners
   * @method
   * @name ReactiveEventSystem#hasListeners
   * @param {string} event - Event name
   * @returns {boolean}
   */
  hasListeners(event: string): boolean
  {
    return this.listenerCount(event) > 0
  }

  /**
   * Add middleware for event processing
   * @method
   * @name ReactiveEventSystem#use
   * @param {string} event - Event name
   * @param {EventMiddleware<T>} middleware - Middleware function
   * @returns {Function} Unsubscribe function
   *
   * @example
   * // Add validation middleware
   * const unsubscribe = bus.use('userAction', (data, event) => {
   *   if (!data.userId) {
   *     throw new Error('userId is required')
   *   }
   *   // You can modify data before it reaches listeners
   *   return { ...data, timestamp: Date.now() }
   * })
   *
   * // Add logging middleware
   * bus.use('*', (data, event) => {
   *   console.log(`Event ${event} emitted:`, data)
   * })
   */
  use(event: string, middleware: EventMiddleware<T>): () => void
  {
    if (typeof middleware !== 'function') {
      throw new TypeError('Middleware must be a function')
    }

    if (!this.middleware.has(event)) {
      this.middleware.set(event, [])
    }

    this.middleware.get(event)!.push(middleware)

    return () => {
      const middlewares = this.middleware.get(event)
      if (middlewares) {
        const index = middlewares.indexOf(middleware)
        if (index > -1) {
          middlewares.splice(index, 1)
        }
      }
    }
  }

  /**
   * Create reactive stream from event
   * @method
   * @name ReactiveEventSystem#stream
   * @param {string} event - Event name
   * @returns {EventStream<T>} Stream object with subscribe method
   *
   * @example
   * // Create a stream for mouse movements
   * const mouseStream = bus.stream('mouseMove')
   *
   * // Subscribe to the stream
   * const unsubscribe = mouseStream.subscribe((data) => {
   *   console.log('Mouse position:', data)
   * })
   *
   * // Access reactive state
   * effect(() => {
   *   console.log('Last mouse position:', mouseStream.state.value)
   *   console.log('Total moves:', mouseStream.state.count)
   * })
   *
   * // Clean up
   * mouseStream.destroy()
   */
  stream(event: string): EventStream<T>
  {
    const streamState = reactive<{ value: T | null; count: number }>({
      value: null as T | null,
      count: 0
    })

    const listener = (data: T) => {
      batch(() => {
        streamState.value = data
        streamState.count++
      })
    }

    this.on(event, listener, { reactive: true })

    return {
      subscribe: (callback: (data: T) => void) => this.on(event, callback),
      destroy: () => this.off(event, listener),
      get state() {
        return streamState
      }
    }
  }

  /**
   * Get reactive metrics for monitoring
   * @method
   * @name ReactiveEventSystem#getMetrics
   * @returns {EventSystemMetrics} Reactive metrics object
   *
   * @example
   * const metrics = bus.getMetrics()
   *
   * // Monitor metrics reactively
   * effect(() => {
   *   console.log('Total events:', metrics.state.totalEventsEmitted)
   *   console.log('Active listeners:', metrics.state.activeListeners)
   *   console.log('Available events:', metrics.events())
   * })
   */
  getMetrics(): EventSystemMetrics
  {
    return {
      state: this.reactiveState,
      events: () => this.eventNames(),
      totalListeners: () => {
        let total = 0
        this.events.forEach(listeners => total += listeners.size)
        this.onceEvents.forEach(listeners => total += listeners.size)
        return total
      }
    }
  }

  /**
   * Wait for specific event (Promise-based)
   * @method
   * @name ReactiveEventSystem#waitFor
   * @param {string} event - Event name
   * @param {number} [timeout] - Timeout in milliseconds
   * @returns {Promise<T>} Promise that resolves with event data
   *
   * @example
   * // Wait for authentication complete
   * try {
   *   const user = await bus.waitFor('authComplete', 5000)
   *   console.log('User authenticated:', user)
   * } catch (error) {
   *   console.log('Authentication timeout')
   * }
   *
   * // Wait without timeout
   * const data = await bus.waitFor('dataLoaded')
   */
  waitFor(event: string, timeout?: number): Promise<T>
  {
    return new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null

      const listener = (data: T): void => {
        if (timeoutId !== null) {
          clearTimeout(timeoutId)
        }
        resolve(data)
      }

      if (timeout) {
        timeoutId = setTimeout(() => {
          this.off(event, listener)
          reject(new Error(`Timeout waiting for event: ${event}`))
        }, timeout)
      }

      this.once(event, listener)
    })
  }

  /**
   * Pipe events to another emitter
   * @method
   * @name ReactiveEventSystem#pipe
   * @param {string} fromEvent - Source event name
   * @param {ReactiveEventSystem} toBus - Target bus
   * @param {string} [toEvent] - Target event name (defaults to fromEvent)
   * @returns {Function} Unpipe function
   *
   * @example
   * const sourceBus = new ReactiveEventSystem()
   * const targetBus = new ReactiveEventSystem()
   *
   * // Pipe all 'data' events from source to target
   * const unpipe = sourceBus.pipe('data', targetBus)
   *
   * // Pipe with event name transformation
   * const unpipeTransformed = sourceBus.pipe('input', targetBus, 'processedInput')
   *
   * // Stop piping
   * unpipe()
   */
  pipe(fromEvent: string, toBus: EventSystem, toEvent?: string): () => void
  {
    const targetEvent = toEvent ?? fromEvent

    const listener = (data: T): void => {
      toBus.emit(targetEvent, data)
    }

    this.on(fromEvent, listener)

    return () => {
      this.off(fromEvent, listener)
    }
  }

  /**
   * Clean up all resources
   * @method
   * @name ReactiveEventSystem#destroy
   */
  destroy(): void
  {
    this.removeAllListeners()
    this.middleware.clear()
    this.computedMetrics.clear()
  }

  /**
   * @private
   * Setup reactive effect for listener
   */
  private setupReactiveEffect(listener: (data: T) => void): void
  {
    const reactiveEffect = effect((): void => {
      // Create dependency on reactive state
      // This ensures effect re-runs when state changes
      const { totalEventsEmitted } = this.reactiveState
      void totalEventsEmitted
      // Intentional side-effect-free access
      // We don't need to do anything here
    })

    this.reactiveEffects.set(listener, reactiveEffect)
  }

  /**
   * @private
   * Clean up reactive effect for listener
   */
  private cleanupReactiveEffect(listener: (data: T) => void): void
  {
    const effectCleanup = this.reactiveEffects.get(listener)
    if (effectCleanup) {
      effectCleanup()
      this.reactiveEffects.delete(listener)
    }
  }

  /**
   * @private
   * Call listeners with error handling
   */
  private callListeners(listeners: Set<(data: T) => void>, data: T, event: string): void
  {
    listeners.forEach(listener => {
      try {
        listener.call(this, data)
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        this.reactiveState.errorCount++

        if (this.errorHandler) {
          this.errorHandler(err, event, listener)
        } else {
          console.error(`[ReactiveEventSystem] Error in listener for "${event}":`, err)
        }
      }
    })
  }

  /**
   * @private
   * Run middleware chain
   */
  private runMiddleware(event: string, data: T): T
  {
    // Run global middleware (for all events)
    const globalMiddlewares = this.middleware.get('*')
    let processedData = data

    if (globalMiddlewares?.length) {
      for (const middleware of globalMiddlewares) {
        try {
          const result = middleware(processedData, event, this)
          if (result !== undefined && result !== null) {
            processedData = result as T
          }
        } catch (error) {
          console.error(`[ReactiveEventEmitter] Error in global middleware for "${event}":`, error)
        }
      }
    }

    // Run event-specific middleware
    const eventMiddlewares = this.middleware.get(event)
    if (eventMiddlewares?.length) {
      for (const middleware of eventMiddlewares) {
        try {
          const result = middleware(processedData, event, this)
          if (result !== undefined && result !== null) {
            processedData = result as T
          }
        } catch (error) {
          console.error(`[ReactiveEventEmitter] Error in middleware for "${event}":`, error)
        }
      }
    }

    return processedData
  }

  /**
   * @private
   * Update reactive metrics
   */
  private updateMetrics(): void
  {
    let totalListeners = 0
    this.events.forEach(listeners => totalListeners += listeners.size)
    this.onceEvents.forEach(listeners => totalListeners += listeners.size)

    this.reactiveState.activeListeners = totalListeners
  }

  /**
   * @private
   * Setup computed metrics
   */
  private setupMetrics(): void
  {
    this.computedMetrics.set('eventRate', computed(() => {
      return this.reactiveState.totalEventsEmitted
    }))

    this.computedMetrics.set('errorRate', computed(() => {
      return this.reactiveState.errorCount
    }))
  }
}
