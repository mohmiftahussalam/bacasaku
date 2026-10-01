/* storage.js — penyimpanan buku, progres baca, dan setelan.
   Konten buku disimpan di IndexedDB; kalau tidak tersedia, fallback ke localStorage. */
(function () {
  'use strict';

  const DB_NAME = 'bacasaku';
  const STORE = 'books';
  const META_KEY = 'bacasaku.books';
  const PROGRESS_PREFIX = 'bacasaku.progress.';
  const SETTINGS_KEY = 'bacasaku.settings';
  const CONTENT_PREFIX = 'bacasaku.content.';

  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('indexedDB tidak tersedia')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => { dbPromise = null; });
    return dbPromise;
  }

  function idb(mode, work) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const req = work(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  function readMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY) || '[]'); }
    catch (e) { return []; }
  }

  function writeMeta(list) {
    localStorage.setItem(META_KEY, JSON.stringify(list));
  }

  const Storage = {
    /** Simpan buku {id, title, format, addedAt, chapters} + meta-nya. */
    saveBook(book) {
      const record = {
        id: book.id,
        title: book.title,
        format: book.format,
        addedAt: book.addedAt,
        chapters: book.chapters
      };
      return idb('readwrite', s => s.put(record))
        .catch(() => {
          // fallback: localStorage (kapasitas terbatas ~5MB)
          localStorage.setItem(CONTENT_PREFIX + book.id, JSON.stringify(record));
        })
        .then(() => {
          const list = readMeta();
          list.unshift({ id: book.id, title: book.title, format: book.format, addedAt: book.addedAt });
          writeMeta(list);
        });
    },

    getBook(id) {
      return idb('readonly', s => s.get(id))
        .then(rec => {
          if (rec) return rec;
          const raw = localStorage.getItem(CONTENT_PREFIX + id);
          if (!raw) throw new Error('Buku tidak ditemukan di penyimpanan');
          return JSON.parse(raw);
        })
        .catch(err => {
          if (err && err.name === 'NotFoundError') return null;
          throw err;
        });
    },

    deleteBook(id) {
      return idb('readwrite', s => s.delete(id))
        .catch(() => { localStorage.removeItem(CONTENT_PREFIX + id); })
        .then(() => {
          writeMeta(readMeta().filter(b => b.id !== id));
          localStorage.removeItem(PROGRESS_PREFIX + id);
        });
    },

    listBooks() { return readMeta(); },

    getProgress(id) {
      try { return JSON.parse(localStorage.getItem(PROGRESS_PREFIX + id) || 'null'); }
      catch (e) { return null; }
    },

    setProgress(id, page, pages) {
      localStorage.setItem(PROGRESS_PREFIX + id, JSON.stringify({ page, pages }));
    },

    getSettings() {
      try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); }
      catch (e) { return null; }
    },

    saveSettings(settings) {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }
  };

  window.BSStorage = Storage;
})();
