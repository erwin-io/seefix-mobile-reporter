import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

// jsdom has no IndexedDB: fake-indexeddb is an in-memory implementation. A fresh database per test keeps
// on-device data from leaking between tests.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  sessionStorage.clear(); // a fresh browser tab: the web session token doesn't leak between tests
});

// Polyfills for running unit tests under jsdom (the default Vitest environment).
// Ionic components such as ion-menu and ion-split-pane query `window.matchMedia`,
// which jsdom does not implement.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
