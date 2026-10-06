/* script.js — logika aplikasi BacaSaku:
   pustaka, impor file, pembaca halaman-per-halaman (gaya e-reader), setelan & tema. */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  const el = {
    screenLib: $('screen-library'),
    screenReader: $('screen-reader'),
    bookList: $('book-list'),
    emptyState: $('empty-state'),
    fileInput: $('file-input'),
    btnImportTop: $('btn-import-top'),
    btnImportEmpty: $('btn-import-empty'),
    btnImportFab: $('btn-import-fab'),
    viewport: $('reader-viewport'),
    flow: $('reader-flow'),
    readerTitle: $('reader-title'),
    btnBack: $('btn-back'),
    btnFocus: $('btn-focus'),
    btnToc: $('btn-toc'),
    btnSettings: $('btn-settings'),
    progressSlider: $('progress-slider'),
    pageLabel: $('page-label'),
    chapterLabel: $('chapter-label'),
    sheetBackdrop: $('sheet-backdrop'),
    sheetSettings: $('sheet-settings'),
    sheetToc: $('sheet-toc'),
    tocList: $('toc-list'),
    setSize: $('set-size'),
    valSize: $('val-size'),
    setFont: $('set-font'),
    setLeading: $('set-leading'),
    setMargin: $('set-margin'),
    setTheme: $('set-theme'),
    loading: $('loading-overlay'),
    loadingText: $('loading-text'),
    toast: $('toast'),
    readerTop: document.querySelector('header.reader-top'),
    readerBottom: document.querySelector('footer.reader-bottom'),
    btnBookmark: $('btn-bookmark'),
    sheetTabs: $('sheet-tabs'),
    bmList: $('bm-list'),
    bmCount: $('bm-count'),
    bmEmpty: $('bm-empty'),
    libToolbar: $('lib-toolbar'),
    libCount: $('lib-count'),
    libSort: $('lib-sort'),
    btnStats: $('btn-stats'),
    sheetStats: $('sheet-stats'),
    statsBackdrop: $('stats-backdrop'),
    btnStatsClose: $('btn-stats-close'),
    stToday: $('st-today'),
    stStreak: $('st-streak'),
    stTotal: $('st-total'),
    stBooks: $('st-books'),
    statChart: $('stat-chart'),
    btnMore: $('btn-more'),
    sheetData: $('sheet-data'),
    dataBackdrop: $('data-backdrop'),
    btnExport: $('btn-export'),
    btnRestore: $('btn-restore'),
    fileData: $('file-data'),
    libQuote: $('lib-quote'),
    quoteText: $('quote-text'),
    quoteSrc: $('quote-src'),
    quoteAgain: $('quote-again'),
    scrubPreview: $('scrub-preview'),
    scrubPage: $('scrub-page'),
    scrubChapter: $('scrub-chapter')
  };

  const FONTS = {
    serif: "Georgia, 'Times New Roman', serif",
    sans: "-apple-system, 'Segoe UI', system-ui, Roboto, sans-serif",
    mono: "'Cascadia Mono', Consolas, 'Courier New', monospace"
  };
  const THEME_COLORS = { terang: '#f7f5f0', sepia: '#efe5d0', malam: '#141317' };

  /* ---------------- state ---------------- */
  const DEFAULT_SETTINGS =
    { size: 18, font: 'serif', leading: 1.7, margin: 18, theme: 'terang', libSort: 'recent' };
  let settings = Object.assign({}, DEFAULT_SETTINGS, BSStorage.getSettings() || {});
  let books = [];          // meta buku
  let current = null;      // buku yang sedang dibaca
  let bookmarks = [];      // penanda halaman buku saat ini
  let pages = 1;           // jumlah halaman
  let page = 0;            // halaman sekarang (0-based)
  let pageW = 0;           // lebar satu halaman (px)
  let chapterStarts = [];  // [{ index, title, page }]
  let relayoutTimer = null;
  let stats = BSStorage.getStats();   // { days: { 'YYYY-MM-DD': detik } }
  let lastStatTick = Date.now();
  let scrubbing = false;    // true saat slider progres sedang digeser

  /* ---------------- util ---------------- */
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function newId() {
    return (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  let toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    requestAnimationFrame(() => el.toast.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.toast.classList.remove('show');
      setTimeout(() => { el.toast.hidden = true; }, 280);
    }, 2600);
  }

  function showLoading(text) {
    el.loadingText.textContent = text || 'Memuat…';
    el.loading.hidden = false;
  }
  function hideLoading() { el.loading.hidden = true; }

  function showScreen(name) {
    el.screenLib.classList.toggle('active', name === 'library');
    el.screenReader.classList.toggle('active', name === 'reader');
  }

  /* ---------------- setelan & tema ---------------- */
  function applySettings() {
    const st = document.body.style;
    st.setProperty('--read-size', settings.size + 'px');
    st.setProperty('--read-leading', String(settings.leading));
    st.setProperty('--read-font', FONTS[settings.font] || FONTS.serif);
    st.setProperty('--pad-x', settings.margin + 'px');
    document.body.dataset.theme = settings.theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLORS[settings.theme] || THEME_COLORS.terang);

    // samakan tampilan kontrol
    el.setSize.value = settings.size;
    el.valSize.textContent = settings.size;
    syncGroup(el.setFont, settings.font);
    syncGroup(el.setLeading, String(settings.leading));
    syncGroup(el.setMargin, String(settings.margin));
    syncGroup(el.setTheme, settings.theme);

    BSStorage.saveSettings(settings);
  }

  function syncGroup(group, value) {
    if (!group) return;
    group.querySelectorAll('button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.val === String(value));
    });
  }

  function scheduleRelayout() {
    clearTimeout(relayoutTimer);
    relayoutTimer = setTimeout(() => relayout(true), 160);
  }

  /* ---------------- pustaka ---------------- */
  function renderLibrary() {
    books = BSStorage.listBooks();
    const has = books.length > 0;
    el.emptyState.hidden = has;
    el.bookList.hidden = !has;
    el.libToolbar.hidden = !has;
    el.libCount.textContent = books.length + ' buku';
    el.libSort.value = settings.libSort;

    // progres tiap buku (untuk % & urutan "terakhir dibaca")
    const info = {};
    books.forEach(b => { info[b.id] = BSStorage.getProgress(b.id) || {}; });

    const sorted = books.slice();
    if (settings.libSort === 'title') {
      sorted.sort((a, b) => a.title.localeCompare(b.title, 'id'));
    } else if (settings.libSort === 'added') {
      sorted.sort((a, b) => b.addedAt - a.addedAt);
    } else {
      // terakhir dibaca dulu; yang belum pernah dibaca di bawah, menurut tanggal impor
      sorted.sort((a, b) => (info[b.id].at || 0) - (info[a.id].at || 0)
        || b.addedAt - a.addedAt);
    }
    // buku yang paling baru dibaca → disorot
    let recentId = '';
    let recentAt = 0;
    sorted.forEach(b => {
      if ((info[b.id].at || 0) > recentAt) { recentAt = info[b.id].at; recentId = b.id; }
    });

    el.bookList.innerHTML = '';
    sorted.forEach(b => {
      const prog = info[b.id];
      const pct = (prog.pages > 1)
        ? Math.min(100, Math.round(prog.page / (prog.pages - 1) * 100))
        : 0;
      const isRecent = recentAt > 0 && b.id === recentId;
      const li = document.createElement('li');
      li.className = 'book-card' + (isRecent ? ' recent' : '');
      li.dataset.id = b.id;
      const cover = BSStorage.getCover(b.id);
      const gen = escapeHtml(b.title.length > 30 ? b.title.slice(0, 28) + '…' : b.title);
      li.innerHTML =
        '<div class="book-cover">' + (cover
          ? '<img src="' + cover + '" alt="">'
          : '<span class="cover-gen">' + gen + '</span>') + '</div>' +
        '<div class="book-info">' +
          '<div class="book-title">' + escapeHtml(b.title) + '</div>' +
          '<div class="book-meta">' + b.format.toUpperCase() +
            (pct > 0 ? ' &middot; ' + pct + '% dibaca' : ' &middot; belum dibaca') +
            (isRecent ? '<span class="book-badge">TERAKHIR DIBACA</span>' : '') +
          '</div>' +
          '<div class="book-progress"><i style="width:' + Math.max(pct, 1.5) + '%"></i></div>' +
        '</div>' +
        '<button class="book-delete" title="Hapus buku" aria-label="Hapus buku">✕</button>';
      el.bookList.appendChild(li);
    });
    renderQuote();
  }

  /* ---------------- kutipan acak (idle) di layar pustaka ---------------- */
  let quoteSig = '';
  let lastQuoteId = null;

  function renderQuote(force) {
    const metas = BSStorage.listBooks();
    if (!metas.length) { quoteSig = ''; el.libQuote.hidden = true; return; }
    const sig = metas.map(m => m.id).sort().join(',');
    if (!force && sig === quoteSig && !el.libQuote.hidden) return;
    quoteSig = sig;
    const pool = (metas.length > 1 && lastQuoteId)
      ? metas.filter(m => m.id !== lastQuoteId)
      : metas;
    const pick = pool[Math.floor(Math.random() * pool.length)] || metas[0];
    BSStorage.getBook(pick.id).then(book => {
      if (sig !== quoteSig) return; // daftar buku sudah berubah
      lastQuoteId = book.id;
      const chs = (book.chapters || []).filter(c => c && c.html);
      if (!chs.length) { el.libQuote.hidden = true; return; }
      const ch = chs[Math.floor(Math.random() * chs.length)];
      const div = document.createElement('div');
      div.innerHTML = ch.html;
      const text = (div.textContent || '').replace(/\s+/g, ' ').trim();
      const sents = (text.match(/[^.!?…]+[.!?…”]+|[^.!?…]+$/g) || [])
        .map(s => s.trim()).filter(s => s.length >= 60 && s.length <= 260);
      const cand = sents.length ? sents : (text ? [text] : []);
      if (!cand.length) { el.libQuote.hidden = true; return; }
      let q = cand[Math.floor(Math.random() * cand.length)];
      if (q.length > 240) q = q.slice(0, 237).trim() + '…';
      el.quoteText.textContent = '\u201c' + q + '\u201d';
      el.quoteSrc.textContent = book.title + (chs.length > 1 ? ' · ' + ch.title : '');
      el.libQuote.hidden = false;
    }).catch(() => { el.libQuote.hidden = true; });
  }

  el.quoteAgain.addEventListener('click', () => renderQuote(true));

  el.libSort.addEventListener('change', () => {
    settings.libSort = el.libSort.value;
    BSStorage.saveSettings(settings);
    renderLibrary();
  });

  el.bookList.addEventListener('click', e => {
    const card = e.target.closest('.book-card');
    if (!card) return;
    const id = card.dataset.id;
    if (e.target.closest('.book-delete')) {
      const meta = books.find(b => b.id === id);
      if (confirm('Hapus "' + (meta ? meta.title : 'buku') + '" dari pustaka?')) {
        BSStorage.deleteBook(id).then(renderLibrary);
      }
      return;
    }
    openBook(id);
  });

  /* ---------------- impor file ---------------- */
  function importFile(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext !== 'epub' && ext !== 'txt' && ext !== 'text') {
      toast('Format .' + ext + ' belum didukung — pakai .epub atau .txt');
      return;
    }
    const fallbackTitle = file.name.replace(/\.[^.]+$/, '');
    showLoading('Membaca ' + file.name + '…');

    const task = (ext === 'epub')
      ? BSParse.parseEpub(file, fallbackTitle)
      : file.text().then(t => BSParse.parseTxt(t, fallbackTitle));

    task.then(parsed => {
      const book = {
        id: newId(),
        title: (parsed.title || fallbackTitle).trim(),
        format: parsed.format,
        addedAt: Date.now(),
        chapters: parsed.chapters,
        cover: parsed.cover || null
      };
      return BSStorage.saveBook(book).then(() => book);
    }).then(book => {
      renderLibrary();
      hideLoading();
      toast('“' + book.title + '” ditambahkan ke pustaka');
    }).catch(err => {
      console.error(err);
      hideLoading();
      toast('Gagal membaca file: ' + (err.message || 'format tidak dikenali'));
    });
  }

  function pickFile() { el.fileInput.click(); }
  el.btnImportTop.addEventListener('click', pickFile);
  el.btnImportEmpty.addEventListener('click', pickFile);
  el.btnImportFab.addEventListener('click', pickFile);
  el.fileInput.addEventListener('change', () => {
    const file = el.fileInput.files && el.fileInput.files[0];
    if (file) importFile(file);
    el.fileInput.value = '';
  });

  /* ---------------- membuka buku ---------------- */
  function openBook(id) {
    showLoading('Membuka buku…');
    BSStorage.getBook(id).then(book => {
      if (!book) throw new Error('Buku tidak ditemukan');
      current = book;
      bookmarks = BSStorage.getBookmarks(book.id);
      el.readerTitle.textContent = book.title;
      el.flow.innerHTML = book.chapters.map((c, i) => {
        const hasHeading = /^\s*<h[1-3][^>]*>/i.test(c.html);
        const head = hasHeading ? '' :
          '<h2 class="chapter-title">' + escapeHtml(c.title) + '</h2>';
        return '<section data-chapter="' + i + '">' + head + c.html + '</section>';
      }).join('');

      // gambar yang termuat belakangan bisa mengubah tata letak
      el.flow.querySelectorAll('img').forEach(img => {
        if (!img.complete) img.addEventListener('load', scheduleRelayout, { once: true });
      });

      showScreen('reader');
      relayout(false);

      const prog = BSStorage.getProgress(book.id);
      if (prog && prog.pages > 1 && prog.page > 0 && pages > 1) {
        // rasio disimpan sebagai halaman / (jumlah halaman - 1)
        const ratio = prog.page / (prog.pages - 1);
        goTo(Math.round(ratio * (pages - 1)), false);
      }
      buildToc();
      hideLoading();
    }).catch(err => {
      console.error(err);
      hideLoading();
      toast('Gagal membuka buku: ' + (err.message || ''));
      showScreen('library');
    });
  }

  /* ---------------- tata letak halaman ---------------- */
  /* Ukur tinggi bilah atas/bawah → var CSS --rtop/--rbot, lalu viewport
     di inset di bawah bilah supaya teks tidak pernah tertutup bilah.
     Padding vertikal .reader-flow juga berlaku untuk semua kolom (halaman). */
  function updateBarInsets() {
    const ss = el.screenReader.style;
    if (document.body.classList.contains('focus-mode')) {
      ss.setProperty('--rtop', 'calc(env(safe-area-inset-top, 0px) + 4px)');
      ss.setProperty('--rbot', 'calc(env(safe-area-inset-bottom, 0px) + 6px)');
      return;
    }
    const t = el.readerTop.offsetHeight;
    const b = el.readerBottom.offsetHeight;
    if (t) ss.setProperty('--rtop', t + 'px');
    if (b) ss.setProperty('--rbot', b + 'px');
  }

  function relayout(keepRatio) {
    if (!current) return;
    const ratio = pages > 1 ? page / (pages - 1) : 0;

    el.flow.style.transition = 'none';
    el.flow.style.transform = 'none';
    el.flow.style.width = '';

    const W = el.viewport.clientWidth;
    if (!W) { el.flow.style.transition = ''; return; }
    updateBarInsets();          // sebelum ukur tinggi flow (mengubah tinggi viewport)
    pageW = W;
    el.flow.style.setProperty('--page-w', W + 'px');

    const sw = el.flow.scrollWidth;
    pages = Math.max(1, Math.ceil(sw / W - 0.02));
    el.flow.style.width = (pages * W) + 'px';

    page = keepRatio ? Math.min(pages - 1, Math.round(ratio * (pages - 1))) : 0;

    void el.flow.offsetWidth; // paksa reflow sebelum transisi aktif kembali
    el.flow.style.transition = '';
    applyTransform();
    computeChapterStarts();
    updateHud();
  }

  function applyTransform() {
    el.flow.style.transform = 'translate3d(' + (-page * pageW) + 'px, 0, 0)';
  }

  function goTo(next, animate) {
    const np = Math.max(0, Math.min(pages - 1, next));
    page = np;
    if (animate === false) {
      el.flow.style.transition = 'none';
      applyTransform();
      void el.flow.offsetWidth;
      el.flow.style.transition = '';
    } else {
      applyTransform();
    }
    updateHud();
    // saat scrubbing, progres ditulis nanti (saat slider dilepas)
    if (!scrubbing) BSStorage.setProgress(current.id, page, pages);
  }

  function computeChapterStarts() {
    chapterStarts = [];
    el.flow.querySelectorAll('section').forEach(sec => {
      const idx = Number(sec.dataset.chapter);
      const left = sec.getBoundingClientRect().left - el.flow.getBoundingClientRect().left;
      chapterStarts.push({
        index: idx,
        title: (current.chapters[idx] || {}).title || ('Bagian ' + (idx + 1)),
        page: Math.max(0, Math.round(left / (pageW || 1)))
      });
    });
  }

  function currentChapterTitle() {
    if (!chapterStarts.length) return '—';
    let cur = chapterStarts[0];
    for (const ch of chapterStarts) { if (ch.page <= page) cur = ch; }
    return cur.title;
  }

  function updateHud() {
    el.pageLabel.textContent = (page + 1) + ' / ' + pages;
    el.chapterLabel.textContent = currentChapterTitle();
    el.progressSlider.max = pages;
    el.progressSlider.value = page + 1;
    updateBookmarkUi();
    const cur = currentChapterTitle();
    el.tocList.querySelectorAll('li').forEach(li => {
      li.classList.toggle('current', li.textContent.trim() === cur);
    });
  }

  /* ---------------- penanda halaman ---------------- */
  /* Posisi disimpan sebagai RASIO page/(pages-1) supaya tetap valid
     walau ukuran font/margin/layar berubah → halaman berbeda nanti. */
  function ratioOfPage(p) { return pages > 1 ? p / (pages - 1) : 0; }
  function pageOfRatio(r) { return Math.max(0, Math.min(pages - 1, Math.round(r * (pages - 1)))); }

  function snippetAtTop() {
    // ambil potongan teks di bagian atas halaman sekarang;
    // coba beberapa titik karena awal halaman bisa berupa padding/judul bab
    try {
      const r = el.viewport.getBoundingClientRect();
      const probes = [
        [r.left + 34, r.top + 30],
        [r.left + 34, r.top + 14],
        [r.left + 60, r.top + 44]
      ];
      for (const [x, y] of probes) {
        const range = document.caretRangeFromPoint && document.caretRangeFromPoint(x, y);
        if (!range || !range.startContainer) continue;
        const node = range.startContainer;
        const text = (node.nodeType === 3 ? node.textContent : node.textContent || '')
          .slice(range.startOffset || 0).replace(/\s+/g, ' ').trim();
        if (text.length > 6) return text.slice(0, 72) + (text.length > 72 ? '…' : '');
      }
    } catch (e) { /* caretRangeFromPoint tidak tersedia → abaikan */ }
    return currentChapterTitle();   // cadangan: nama bab
  }

  function bmOnThisPage() {
    return bookmarks.findIndex(b => pageOfRatio(b.pos) === page);
  }

  function updateBookmarkUi() {
    if (!el.btnBookmark) return;
    el.btnBookmark.classList.toggle('marked', !!current && bmOnThisPage() >= 0);
    el.bmCount.hidden = bookmarks.length === 0;
    el.bmCount.textContent = bookmarks.length;
  }

  function toggleBookmark() {
    if (!current) return;
    const i = bmOnThisPage();
    if (i >= 0) {
      bookmarks.splice(i, 1);
      toast('Penanda dihapus');
    } else {
      bookmarks.push({
        pos: ratioOfPage(page),
        snippet: snippetAtTop(),
        chapter: currentChapterTitle(),
        ts: Date.now()
      });
      bookmarks.sort((a, b) => a.pos - b.pos);
      toast('Halaman ditandai 🔖');
    }
    BSStorage.saveBookmarks(current.id, bookmarks);
    updateBookmarkUi();
    if (!el.sheetToc.hidden) buildBmList();   // sheet terbuka → segarkan daftar
  }

  function buildBmList() {
    el.bmList.innerHTML = '';
    // pesan kosong hanya untuk tab Penanda, bukan tab Daftar Isi
    el.bmEmpty.hidden = bookmarks.length > 0 || el.bmList.hidden;
    bookmarks.forEach((b, i) => {
      const target = pageOfRatio(b.pos);
      const li = document.createElement('li');

      const go = document.createElement('button');
      go.className = 'bm-item';
      const sn = document.createElement('span');
      sn.className = 'bm-snippet';
      sn.textContent = b.snippet || '(tanpa teks)';
      const meta = document.createElement('span');
      meta.className = 'bm-meta';
      meta.textContent = 'Hal. ' + (target + 1) + ' · ' + (b.chapter || '');
      go.appendChild(sn);
      go.appendChild(meta);
      go.addEventListener('click', () => { goTo(target); closeSheets(); });

      const del = document.createElement('button');
      del.className = 'bm-del';
      del.textContent = '✕';
      del.title = 'Hapus penanda';
      del.addEventListener('click', ev => {
        ev.stopPropagation();
        bookmarks.splice(i, 1);
        BSStorage.saveBookmarks(current.id, bookmarks);
        updateBookmarkUi();
        buildBmList();
      });

      li.appendChild(go);
      li.appendChild(del);
      el.bmList.appendChild(li);
    });
  }

  /* ---------------- gestur: tap & swipe ---------------- */
  let gesture = null;

  el.viewport.addEventListener('pointerdown', e => {
    if (!sheetsClosed()) return;
    gesture = { x: e.clientX, y: e.clientY, t: Date.now() };
  });

  el.viewport.addEventListener('pointerup', e => {
    if (!gesture) return;
    const dx = e.clientX - gesture.x;
    const dy = e.clientY - gesture.y;
    const dt = Date.now() - gesture.t;
    gesture = null;

    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
      goTo(dx < 0 ? page + 1 : page - 1);   // swipe kiri = halaman berikutnya
      return;
    }
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && dt < 600) {
      const rect = el.viewport.getBoundingClientRect();
      const r = (e.clientX - rect.left) / rect.width;
      if (r < 0.30) goTo(page - 1);          // tap kiri = sebelumnya
      else if (r > 0.70) goTo(page + 1);     // tap kanan = berikutnya
      else toggleFocus();                    // tap tengah = mode fokus / menu
    }
  });
  el.viewport.addEventListener('pointercancel', () => { gesture = null; });
  el.viewport.addEventListener('contextmenu', e => e.preventDefault());

  document.addEventListener('keydown', e => {
    if (!el.screenReader.classList.contains('active')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); goTo(page + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goTo(page - 1); }
    else if (e.key === 'b' || e.key === 'B') { toggleBookmark(); }
    else if (e.key === 'Escape') {
      if (!sheetsClosed()) closeSheets();
      else if (document.body.classList.contains('focus-mode')) toggleFocus();
      else goLibrary();
    }
  });

  function toggleFocus() {
    const on = document.body.classList.toggle('focus-mode');
    toast(on ? 'Mode fokus — ketuk tengah untuk menu' : 'Menu tampil lagi');
    if (current) relayout(true);   // inset viewport berubah → tata ulang halaman
  }

  /* ---------------- panel (sheet) ---------------- */
  function sheetsClosed() {
    return el.sheetSettings.hidden && el.sheetToc.hidden &&
      el.sheetStats.hidden && el.sheetData.hidden;
  }

  function backdropFor(sheet) {
    if (sheet === el.sheetStats) return el.statsBackdrop;
    if (sheet === el.sheetData) return el.dataBackdrop;
    return el.sheetBackdrop;
  }

  function openSheet(sheet) {
    closeSheets(true);
    const bd = backdropFor(sheet);
    bd.hidden = false;
    sheet.hidden = false;
    requestAnimationFrame(() => {
      bd.classList.add('open');
      sheet.classList.add('open');
    });
  }

  function closeSheets(instant) {
    [el.sheetSettings, el.sheetToc, el.sheetStats, el.sheetData].forEach(s => {
      if (s.hidden) return;
      s.classList.remove('open');
      const hide = () => { if (!s.classList.contains('open')) s.hidden = true; };
      instant ? hide() : setTimeout(hide, 300);
    });
    [el.sheetBackdrop, el.statsBackdrop, el.dataBackdrop].forEach(bd => {
      if (bd.hidden) return;
      bd.classList.remove('open');
      const hideBd = () => { if (!bd.classList.contains('open')) bd.hidden = true; };
      instant ? hideBd() : setTimeout(hideBd, 300);
    });
  }

  el.sheetBackdrop.addEventListener('click', () => closeSheets());
  el.statsBackdrop.addEventListener('click', () => closeSheets());
  el.dataBackdrop.addEventListener('click', () => closeSheets());
  el.btnSettings.addEventListener('click', () => openSheet(el.sheetSettings));
  el.btnToc.addEventListener('click', () => {
    buildToc();
    buildBmList();
    switchTab('toc');
    openSheet(el.sheetToc);
  });
  el.btnFocus.addEventListener('click', toggleFocus);   // tombol ⛶ = mode fokus
  el.btnBookmark.addEventListener('click', toggleBookmark);  // 🔖 = tandai halaman

  /* ---------------- daftar isi ---------------- */
  function buildToc() {
    el.tocList.innerHTML = '';
    chapterStarts.forEach(ch => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.textContent = ch.title;
      btn.addEventListener('click', () => {
        goTo(ch.page);
        closeSheets();
      });
      li.appendChild(btn);
      el.tocList.appendChild(li);
    });
    updateHud();
  }

  /* tab dalam sheet: Daftar Isi ⇄ Penanda */
  function switchTab(name) {
    el.sheetTabs.querySelectorAll('button').forEach(btn => {
      const on = btn.dataset.tab === name;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', String(on));
    });
    el.tocList.hidden = name !== 'toc';
    el.bmList.hidden = name !== 'bm';
    el.bmEmpty.hidden = name !== 'bm' || bookmarks.length > 0;
  }

  el.sheetTabs.addEventListener('click', e => {
    const btn = e.target.closest('button[data-tab]');
    if (btn) switchTab(btn.dataset.tab);
  });

  /* ---------------- statistik baca ---------------- */
  function dayKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function fmtDur(sec) {
    sec = Math.max(0, Math.round(sec));
    if (sec < 60) return sec + ' dtk';
    const m = Math.round(sec / 60);
    if (m < 60) return m + ' mnt';
    const h = Math.floor(m / 60);
    return h + 'j ' + (m % 60) + 'm';
  }

  /* Akumulasi waktu baca: tiap ketukan, hanya jika layar baca tampil
     dan tab aktif. `force` = flush saat tab mau disembunyikan/tutup
     (saat itu document.hidden sudah true, jadi tanpa force keburu return). */
  function tickReading(force) {
    const now = Date.now();
    const elapsed = (now - lastStatTick) / 1000;
    lastStatTick = now;
    if (elapsed < 1) return;
    if (!force && document.hidden) return;
    if (!el.screenReader.classList.contains('active') || !current) return;
    stats.days = stats.days || {};
    const k = dayKey();
    stats.days[k] = (stats.days[k] || 0) + Math.round(elapsed);
    BSStorage.saveStats(stats);
  }
  setInterval(tickReading, 15000);
  document.addEventListener('visibilitychange', e => {
    if (e.target.hidden) tickReading(true);   // flush sisa waktu sebelum tab disembunyikan
    lastStatTick = Date.now();                // waktu tersembunyikan tidak dihitung
  });
  window.addEventListener('pagehide', () => tickReading(true));

  function computeStreak(days) {
    let n = 0;
    const d = new Date();
    if (!(days[dayKey(d)] > 0)) d.setDate(d.getDate() - 1);  // hari ini belum baca → mulai kemarin
    while (days[dayKey(d)] > 0) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  function openStats() {
    const days = stats.days || {};
    el.stToday.textContent = fmtDur(days[dayKey()] || 0);
    el.stStreak.textContent = computeStreak(days);
    let total = 0;
    Object.keys(days).forEach(k => { total += days[k] || 0; });
    el.stTotal.textContent = fmtDur(total);
    el.stBooks.textContent = String(books.length);

    // grafik 7 hari terakhir
    const labels = ['M', 'S', 'S', 'R', 'K', 'J', 'S'];   // min…sab (getDay)
    const vals = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      vals.push({ v: days[dayKey(d)] || 0, label: labels[d.getDay()], today: i === 0 });
    }
    const max = Math.max(1, ...vals.map(x => x.v));
    el.statChart.innerHTML = vals.map(x =>
      '<div class="stat-col' + (x.today ? ' today' : '') + '" title="' + fmtDur(x.v) + '">' +
        '<i style="height:' + Math.max(4, Math.round(x.v / max * 100)) + '%"></i>' +
        '<span>' + x.label + '</span>' +
      '</div>').join('');

    openSheet(el.sheetStats);
  }

  el.btnStats.addEventListener('click', openStats);
  el.btnStatsClose.addEventListener('click', () => closeSheets());

  /* ---------------- data & cadangan ---------------- */
  el.btnMore.addEventListener('click', () => openSheet(el.sheetData));

  el.btnExport.addEventListener('click', () => {
    showLoading('Menyiapkan cadangan…');
    BSStorage.collectBackup().then(backup => {
      const blob = new Blob([JSON.stringify(backup, null, 2)],
        { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bacasaku-cadangan-' + dayKey() + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      hideLoading();
      closeSheets();
      toast('Cadangan diekspor — ' + backup.books.length + ' buku 📤');
    }).catch(err => {
      console.error(err);
      hideLoading();
      toast('Gagal mengekspor: ' + (err.message || ''));
    });
  });

  el.btnRestore.addEventListener('click', () => el.fileData.click());

  el.fileData.addEventListener('change', () => {
    const file = el.fileData.files && el.fileData.files[0];
    el.fileData.value = '';
    if (!file) return;
    file.text()
      .then(JSON.parse)
      .then(data => {
        if (!data || data.app !== 'bacasaku' || !Array.isArray(data.books)) {
          throw new Error('file bukan cadangan BacaSaku');
        }
        const n = data.books.length;
        const ok = confirm(
          'Pulihkan cadangan "' + file.name + '" (' + n + ' buku)?\n' +
          'SEMUA data di perangkat ini akan DIGANTI isi cadangan.');
        if (!ok) return null;
        showLoading('Memulihkan cadangan…');
        return BSStorage.restoreBackup(data).then(() => n);
      })
      .then(n => {
        if (n == null) return;
        settings = Object.assign({}, DEFAULT_SETTINGS, BSStorage.getSettings() || {});
        stats = BSStorage.getStats();
        applySettings();
        renderLibrary();
        hideLoading();
        closeSheets();
        toast('Cadangan dipulihkan ✓ ' + n + ' buku');
      })
      .catch(err => {
        console.error(err);
        hideLoading();
        const msg = (err instanceof SyntaxError)
          ? 'file bukan JSON yang valid'
          : (err.message || 'tidak diketahui');
        toast('Gagal memulihkan: ' + msg);
      });
  });

  /* ---------------- kontrol setelan ---------------- */
  el.setSize.addEventListener('input', () => {
    settings.size = Number(el.setSize.value);
    applySettings();
    scheduleRelayout();
  });

  function wireGroup(group, key, transform) {
    if (!group) return;
    group.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      settings[key] = transform ? transform(btn.dataset.val) : btn.dataset.val;
      applySettings();
      scheduleRelayout();
    });
  }
  wireGroup(el.setFont, 'font');
  wireGroup(el.setLeading, 'leading', Number);
  wireGroup(el.setMargin, 'margin', Number);
  wireGroup(el.setTheme, 'theme');

  /* ---------------- navigasi ---------------- */
  el.btnBack.addEventListener('click', goLibrary);

  function goLibrary() {
    tickReading(true);       // simpan waktu baca sampai detik ini
    lastStatTick = Date.now();
    closeSheets();
    showScreen('library');
    renderLibrary();
  }

  /* ---------------- scrubber progres ---------------- */
  /* Geser slider → halaman ikut jari tanpa animasi, gelembung
     "Hal. X / Y" tampil mengikuti thumb; progres ditulis saat dilepas. */
  let scrubHideTimer = null;

  function showScrubPreview() {
    const v = Number(el.progressSlider.value);
    el.scrubPage.textContent = 'Hal. ' + v + ' / ' + pages;
    el.scrubChapter.textContent = currentChapterTitle();
    el.scrubPreview.hidden = false;
    const w = el.progressSlider.clientWidth || 1;
    const pct = pages > 1 ? (v - 1) / (pages - 1) : 0;
    const x = el.progressSlider.offsetLeft +
      Math.max(36, Math.min(w - 36, pct * w));
    el.scrubPreview.style.left = x + 'px';
    clearTimeout(scrubHideTimer);
    scrubHideTimer = setTimeout(() => { el.scrubPreview.hidden = true; }, 1400);
  }

  el.progressSlider.addEventListener('pointerdown', () => { scrubbing = true; });

  ['pointerup', 'pointercancel'].forEach(evt =>
    window.addEventListener(evt, () => {
      if (!scrubbing) return;
      scrubbing = false;
      if (current) BSStorage.setProgress(current.id, page, pages);
    }));

  el.progressSlider.addEventListener('input', () => {
    if (!current) return;
    goTo(Number(el.progressSlider.value) - 1, !scrubbing);
    showScrubPreview();
  });

  el.progressSlider.addEventListener('change', () => {
    if (current) BSStorage.setProgress(current.id, page, pages);
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (!el.screenReader.classList.contains('active') || !current) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => relayout(true), 150);
  });

  /* ---------------- mulai ---------------- */
  /* PWA: daftarkan service worker hanya di http(s) — file:// tidak didukung */
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js')
      .catch(err => console.warn('Service worker gagal didaftarkan:', err));
  }

  applySettings();
  renderLibrary();
})();
