# TempHist Testing Guide

This project uses **Vitest** for testing, which is the recommended testing framework for Vite-based applications.

## Why Vitest?

- ✅ **Native Vite integration** - Works seamlessly with Vite's build system
- ✅ **Jest-compatible API** - Easy migration from Jest if needed
- ✅ **ESM support** - Works with modern JavaScript modules
- ✅ **Fast execution** - Faster than Jest in most cases
- ✅ **Built-in coverage** - Integrated code coverage reporting

## Test Structure

```
test/
├── setup.js           # Test environment setup and mocks
├── utils.test.js      # Utility function tests
├── location.test.js   # Location detection tests
├── api.test.js        # API integration tests
├── integration.test.js # End-to-end flow tests
└── README.md          # This file
```

## Running Tests

### Basic Commands

```bash
# Run tests in watch mode (recommended for development)
npm run test:watch

# Run tests once
npm run test:run

# Run tests with coverage report
npm run test:coverage

# Run tests with UI (browser-based interface)
npm run test:ui

# Run specific test file
npx vitest test/utils.test.js

# Run tests matching a pattern
npx vitest --run location
```

### Test Scripts Explained

- `npm test` - Runs Vitest in watch mode (default)
- `npm run test:run` - Runs tests once and exits
- `npm run test:coverage` - Generates coverage report
- `npm run test:ui` - Opens browser-based test UI
- `npm run test:watch` - Explicit watch mode

## Test Categories

### 1. Utility Functions (`utils.test.js`)

Tests for pure functions like:

- Cookie management (set/get location cookies)
- Location display formatting
- Ordinal number formatting
- String manipulation utilities

### 2. Location Detection (`location.test.js`)

Tests for location-related functionality:

- Geolocation API integration
- IP-based location fallback
- OpenStreetMap API integration
- Error handling for location services

### 3. API Integration (`api.test.js`)

Tests for API interactions:

- Firebase authentication
- Temperature data fetching
- API health checks
- Error handling and retries

### 4. Integration Tests (`integration.test.js`)

End-to-end flow tests:

- Complete location selection flow
- Cookie persistence across page loads
- Chart creation and destruction
- User interaction workflows

## Mocking Strategy

The test setup includes comprehensive mocks for:

- **Chart.js** - Mock chart creation and destruction
- **Firebase** - Mock authentication and user management
- **Fetch API** - Mock HTTP requests and responses
- **Geolocation** - Mock location detection
- **DOM APIs** - Mock browser-specific functionality

## Writing New Tests

### Test File Structure

```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("Feature Name", () => {
  beforeEach(() => {
    // Reset mocks and state
    vi.clearAllMocks();
  });

  it("should do something specific", () => {
    // Arrange
    const input = "test";

    // Act
    const result = functionUnderTest(input);

    // Assert
    expect(result).toBe("expected");
  });
});
```

### Best Practices

1. **Use descriptive test names** - "should handle geolocation permission denied"
2. **Follow AAA pattern** - Arrange, Act, Assert
3. **Mock external dependencies** - APIs, browser APIs, third-party libraries
4. **Test edge cases** - Error conditions, empty inputs, network failures
5. **Keep tests focused** - One assertion per test when possible
6. **Use beforeEach for setup** - Reset state between tests

## Coverage Goals

- **Statements**: > 80%
- **Branches**: > 75%
- **Functions**: > 80%
- **Lines**: > 80%

## Continuous Integration

Add to your CI/CD pipeline:

```yaml
# .github/workflows/test.yml
- name: Run tests
  run: npm run test:coverage

- name: Upload coverage
  uses: codecov/codecov-action@v3
```

## Debugging Tests

### Debug Mode

```bash
npx vitest --inspect-brk
```

### Browser DevTools

```bash
npm run test:ui
```

### VS Code Integration

Install the Vitest extension for VS Code to run tests directly in the editor.

## Common Issues

### Mock Issues

If mocks aren't working:

1. Check that `vi.clearAllMocks()` is called in `beforeEach`
2. Ensure mocks are defined before the module is imported
3. Use `vi.hoisted()` for mocks that need to be available before imports

### Async Testing

```javascript
it("should handle async operations", async () => {
  const result = await asyncFunction();
  expect(result).toBeDefined();
});
```

### DOM Testing

```javascript
it("should update DOM elements", () => {
  document.body.innerHTML = '<div id="test"></div>';
  const element = document.getElementById("test");
  expect(element).toBeTruthy();
});
```
