# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024

### Added

- Initial release of ReactiveEventSystem
- High-performance event emitter with reactive state management
- Batched reactive updates for optimal performance
- Middleware pipeline support (global and event-specific)
- Event streaming with reactive state tracking
- Promise-based event waiting with timeout support
- Event piping between bus instances
- Built-in metrics and monitoring
- Complete TypeScript support with full type safety
- Comprehensive error handling with custom error handlers
- Complete test coverage with 40+ test cases
- Detailed documentation and examples
- ES2024 compatibility

### Features

- `on()` - Subscribe to events
- `once()` - Subscribe to events once
- `off()` - Unsubscribe from events
- `emit()` - Emit events to all listeners
- `use()` - Add middleware for event processing
- `stream()` - Create reactive streams from events
- `waitFor()` - Wait for events with Promise support
- `pipe()` - Route events between buses
- `getMetrics()` - Monitor bus activity
- `listenerCount()` - Query listener counts
- `eventNames()` - Get all registered events
- `destroy()` - Cleanup resources

### Performance

- Batched reactive updates minimize unnecessary computations
- WeakMap-based cleanup prevents memory leaks
- Set-based listener storage for O(1) operations
- Minimal event emission overhead

### Browser Support

- Chrome 126+
- Firefox 127+
- Safari 17.4+
- Edge 126+
- Node.js 20+
