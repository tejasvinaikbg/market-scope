/** Runs before every test file: jest-dom matchers, and the two browser APIs jsdom lacks that our code touches. */
import '@testing-library/jest-dom';

// next-themes reads the OS preference through matchMedia, which jsdom does not implement.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Jest's jsdom environment has no fetch. Tests install their own with mockApi; an unmocked call fails loudly.
Object.defineProperty(globalThis, 'fetch', {
  writable: true,
  value: () => {
    throw new Error('fetch is not mocked in this test');
  },
});

// jsdom lays nothing out, so it has no scrollIntoView; the dashboard calls it to bring a picked row into view.
Element.prototype.scrollIntoView = () => {};
