/* storage.js — penyimpanan buku, progres baca, dan setelan.
   Konten buku disimpan di IndexedDB; kalau tidak tersedia, fallback ke localStorage. */
(function () {
  'use strict';

  const DB_NAME = 'bacasaku';
  const STORE = 'books';
  const META_KEY = 'bacasaku.books';
  const PROGRESS_PREFIX = 'bacasaku.progress.';
  const BOOKMARK_PREFIX = 'bacasaku.bookmarks.';
  const SETTINGS_KEY = 'bacasaku.settings';
  const CONTENT_PREFIX = 'bacasaku.content.';
  const STATS_KEY = 'bacasaku.stats';
  const COVER_PREFIX = 'bacasaku.cover.';

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
          // sampul (data URL) disimpan terpisah supaya meta tetap ringan
          if (book.cover) localStorage.setItem(COVER_PREFIX + book.id, book.cover);
          else localStorage.removeItem(COVER_PREFIX + book.id);
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
          localStorage.removeItem(BOOKMARK_PREFIX + id);
          localStorage.removeItem(COVER_PREFIX + id);
        });
    },

    listBooks() { return readMeta(); },

    /** Sampul buku (data URL) bila ada. */
    getCover(id) {
      try { return localStorage.getItem(COVER_PREFIX + id); } catch (e) { return null; }
    },

    getProgress(id) {
      try { return JSON.parse(localStorage.getItem(PROGRESS_PREFIX + id) || 'null'); }
      catch (e) { return null; }
    },

    /** `at` = waktu terakhir dibaca, dipakai untuk urutan "Terakhir dibaca". */
    setProgress(id, page, pages) {
      localStorage.setItem(PROGRESS_PREFIX + id,
        JSON.stringify({ page, pages, at: Date.now() }));
    },

    /* ---------- penanda halaman (bookmark) ---------- */
    getBookmarks(id) {
      try { return JSON.parse(localStorage.getItem(BOOKMARK_PREFIX + id) || '[]'); }
      catch (e) { return []; }
    },

    saveBookmarks(id, list) {
      localStorage.setItem(BOOKMARK_PREFIX + id, JSON.stringify(list));
    },

    /* ---------- statistik baca ---------- */
    getStats() {
      try { return JSON.parse(localStorage.getItem(STATS_KEY) || 'null') || { days: {} }; }
      catch (e) { return { days: {} }; }
    },

    saveStats(stats) {
      localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    },

    getSettings() {
      try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); }
      catch (e) { return null; }
    },

    saveSettings(settings) {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    },

    /* ---------- cadangan (ekspor / pulihkan) ---------- */
    /** Kumpulkan SELURUH data → 1 objek cadangan (isi buku diambil dari IndexedDB). */
    collectBackup() {
      const metas = readMeta();
      return Promise.all(metas.map(m => this.getBook(m.id).catch(() => null)))
        .then(full => {
          const backup = {
            app: 'bacasaku',
            version: 1,
            exportedAt: new Date().toISOString(),
            books: full.filter(Boolean).map(b => {
              const cover = this.getCover(b.id);
              if (cover) b.cover = cover;
              return b;
            }),
            progress: {},
            bookmarks: {},
            stats: this.getStats(),
            settings: this.getSettings()
          };
          metas.forEach(m => {
            const p = this.getProgress(m.id);
            if (p) backup.progress[m.id] = p;
            const bm = this.getBookmarks(m.id);
            if (bm.length) backup.bookmarks[m.id] = bm;
          });
          return backup;
        });
    },

    /** Ganti SEMUA data di perangkat dengan isi cadangan. */
    restoreBackup(data) {
      const list = Array.isArray(data.books) ? data.books : [];
      return idb('readwrite', s => s.clear())
        .catch(() => { /* IndexedDB tidak ada → lanjut bersihkan localStorage */ })
        .then(() => {
          // hapus sisa data lama (semua key ber-prefix bacasaku.)
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (k && k.indexOf('bacasaku.') === 0) localStorage.removeItem(k);
          }
          return Promise.all(list.map(b => this.saveBook(b)));
        })
        .then(() => {
          const set = (k, v) => { if (v != null) localStorage.setItem(k, JSON.stringify(v)); };
          const prog = data.progress || {};
          const bms = data.bookmarks || {};
          Object.keys(prog).forEach(id => set(PROGRESS_PREFIX + id, prog[id]));
          Object.keys(bms).forEach(id => set(BOOKMARK_PREFIX + id, bms[id]));
          set(STATS_KEY, data.stats);
          set(SETTINGS_KEY, data.settings);
        });
    }
  };

  window.BSStorage = Storage;
})();
