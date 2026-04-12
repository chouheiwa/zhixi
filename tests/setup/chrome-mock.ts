import { beforeEach, vi } from 'vitest';

type RuntimeListener = (...args: unknown[]) => void;

const listeners = new Set<RuntimeListener>();

// In-memory backing store for chrome.storage.local mock.
const storageLocalBacking: Record<string, unknown> = {};

export const chromeMock = {
  runtime: {
    lastError: null as { message: string } | null,
    sendMessage: vi.fn((_message?: unknown, callback?: (response?: unknown) => void) => {
      callback?.();
    }),
    onMessage: {
      addListener: vi.fn((listener: RuntimeListener) => {
        listeners.add(listener);
      }),
      removeListener: vi.fn((listener: RuntimeListener) => {
        listeners.delete(listener);
      }),
      hasListener(listener: RuntimeListener) {
        return listeners.has(listener);
      },
      clear() {
        listeners.clear();
      },
    },
  },
  storage: {
    local: {
      get: vi.fn(
        (
          keys: string | string[] | Record<string, unknown> | null | undefined,
          callback?: (items: Record<string, unknown>) => void,
        ) => {
          const result: Record<string, unknown> = {};
          if (typeof keys === 'string') {
            if (keys in storageLocalBacking) result[keys] = storageLocalBacking[keys];
          } else if (Array.isArray(keys)) {
            for (const k of keys) if (k in storageLocalBacking) result[k] = storageLocalBacking[k];
          } else if (keys && typeof keys === 'object') {
            for (const k of Object.keys(keys)) {
              result[k] = k in storageLocalBacking ? storageLocalBacking[k] : (keys as Record<string, unknown>)[k];
            }
          } else {
            Object.assign(result, storageLocalBacking);
          }
          callback?.(result);
        },
      ),
      set: vi.fn((items: Record<string, unknown>, callback?: () => void) => {
        Object.assign(storageLocalBacking, items);
        callback?.();
      }),
      remove: vi.fn((keys: string | string[], callback?: () => void) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) delete storageLocalBacking[k];
        callback?.();
      }),
      clear: vi.fn((callback?: () => void) => {
        for (const k of Object.keys(storageLocalBacking)) delete storageLocalBacking[k];
        callback?.();
      }),
    },
  },
  reset() {
    this.runtime.lastError = null;
    this.runtime.sendMessage.mockReset();
    this.runtime.sendMessage.mockImplementation((_message?: unknown, callback?: (response?: unknown) => void) => {
      callback?.();
    });
    this.runtime.onMessage.addListener.mockClear();
    this.runtime.onMessage.removeListener.mockClear();
    this.runtime.onMessage.clear();
    for (const k of Object.keys(storageLocalBacking)) delete storageLocalBacking[k];
    // Other test files may replace `chrome.storage` with a narrower mock that
    // lacks `remove` / `clear`. Only clear methods that are still present and
    // still expose mock state.
    const storageLocal = (this as { storage?: { local?: Record<string, unknown> } }).storage?.local;
    if (storageLocal) {
      for (const methodName of ['get', 'set', 'remove', 'clear']) {
        const fn = storageLocal[methodName] as { mockClear?: () => void } | undefined;
        fn?.mockClear?.();
      }
    }
  },
};

vi.stubGlobal('chrome', chromeMock);

beforeEach(() => {
  chromeMock.reset();
});
