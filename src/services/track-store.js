// IndexedDB wrapper for the music library.
// Stores: encoded audio blob + extracted metadata + waveform peaks + artwork.

const DB_NAME = 'notdj';
const DB_VERSION = 1;
const TRACK_STORE = 'tracks';
const CRATE_STORE = 'crates';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(TRACK_STORE)) {
        const s = db.createObjectStore(TRACK_STORE, { keyPath: 'id' });
        s.createIndex('addedAt', 'addedAt');
        s.createIndex('bpm', 'bpm');
        s.createIndex('artist', 'artist');
      }
      if (!db.objectStoreNames.contains(CRATE_STORE)) {
        db.createObjectStore(CRATE_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const tx = async (store, mode = 'readonly') => (await openDB()).transaction(store, mode).objectStore(store);
const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export const trackStore = {
  async put(track) { return wrap((await tx(TRACK_STORE, 'readwrite')).put(track)); },
  async get(id) { return wrap((await tx(TRACK_STORE)).get(id)); },
  async delete(id) { return wrap((await tx(TRACK_STORE, 'readwrite')).delete(id)); },
  async all() { return wrap((await tx(TRACK_STORE)).getAll()); },
  async clear() { return wrap((await tx(TRACK_STORE, 'readwrite')).clear()); },
};

export const crateStore = {
  async put(crate) { return wrap((await tx(CRATE_STORE, 'readwrite')).put(crate)); },
  async get(id) { return wrap((await tx(CRATE_STORE)).get(id)); },
  async delete(id) { return wrap((await tx(CRATE_STORE, 'readwrite')).delete(id)); },
  async all() { return wrap((await tx(CRATE_STORE)).getAll()); },
};
