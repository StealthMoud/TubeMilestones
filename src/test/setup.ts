import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverStub;
