/*
 * App-wide persistent storage, backed by IndexedDB (via localforage, with an
 * automatic fallback to WebSQL/localStorage where IndexedDB is unavailable).
 *
 * Unlike localStorage this is asynchronous, holds far more than ~5 MB, and stores
 * structured values directly (no JSON.stringify needed). It works the same in the
 * browser PWA and inside the Tauri webview.
 *
 * Everything lives in one database ("trackbox"); each feature gets its own named
 * store (its own IndexedDB object store) so unrelated data never collides. Add a
 * new namespace simply by calling appStore('my-feature').
 *
 *   const kv = appStore('my-feature')
 *   await kv.setItem('key', anyValue)   // value may be an object/array/Blob/…
 *   const v = await kv.getItem('key')   // null when absent
 *   await kv.removeItem('key')
 *   await kv.keys()                     // string[]
 *   await kv.iterate((value, key) => { ... })
 *   await kv.clear()
 *
 * The returned object is a localforage instance — see its docs for the full API.
 */

import localforage from 'localforage'

const DB_NAME = 'trackbox'

// Cache one instance per store name (creating a localforage instance opens a
// connection, so we reuse it for the lifetime of the app).
const instances = {}

export function appStore(storeName) {
  if (!instances[storeName]) {
    instances[storeName] = localforage.createInstance({ name: DB_NAME, storeName })
  }
  return instances[storeName]
}
