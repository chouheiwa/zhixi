import { beforeEach, vi } from 'vitest';

type RuntimeListener = (...args: unknown[]) => void;

const listeners = new Set<RuntimeListener>();

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
  reset() {
    this.runtime.lastError = null;
    this.runtime.sendMessage.mockReset();
    this.runtime.sendMessage.mockImplementation((_message?: unknown, callback?: (response?: unknown) => void) => {
      callback?.();
    });
    this.runtime.onMessage.addListener.mockClear();
    this.runtime.onMessage.removeListener.mockClear();
    this.runtime.onMessage.clear();
  },
};

vi.stubGlobal('chrome', chromeMock);

beforeEach(() => {
  chromeMock.reset();
});
