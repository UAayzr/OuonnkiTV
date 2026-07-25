import '@testing-library/jest-dom/vitest'

const localStorageStore = new Map<string, string>()

const localStorageMock: Storage = {
  get length() {
    return localStorageStore.size
  },
  clear() {
    localStorageStore.clear()
  },
  getItem(key: string) {
    return localStorageStore.get(key) ?? null
  },
  key(index: number) {
    return Array.from(localStorageStore.keys())[index] ?? null
  },
  removeItem(key: string) {
    localStorageStore.delete(key)
  },
  setItem(key: string, value: string) {
    localStorageStore.set(key, String(value))
  },
}

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  configurable: true,
})

Object.defineProperty(globalThis, 'sessionStorage', {
  value: localStorageMock,
  configurable: true,
})

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
})

Object.defineProperty(window, 'scrollTo', {
  writable: true,
  value: () => undefined,
})

Object.defineProperty(window, 'requestAnimationFrame', {
  writable: true,
  value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 0),
})

Object.defineProperty(window, 'cancelAnimationFrame', {
  writable: true,
  value: (id: number) => window.clearTimeout(id),
})

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class IntersectionObserverMock {
  readonly root = null
  readonly rootMargin = ''
  readonly thresholds = []

  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  value: ResizeObserverMock,
  configurable: true,
})

Object.defineProperty(globalThis, 'IntersectionObserver', {
  value: IntersectionObserverMock,
  configurable: true,
})

Object.defineProperty(HTMLMediaElement.prototype, 'canPlayType', {
  configurable: true,
  value: () => '',
})

Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  configurable: true,
  value: () => undefined,
})

Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
  configurable: true,
  value: () => false,
})

Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
  configurable: true,
  value: () => undefined,
})

Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
  configurable: true,
  value: () => undefined,
})
