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
    toast: $('toast')
  };

  const FONTS = {
    serif: "Georgia, 'Times New Roman', serif",
    sans: "-apple-system, 'Segoe UI', system-ui, Roboto, sans-serif",
    mono: "'Cascadia Mono', Consolas, 'Courier New', monospace"
  };
  const THEME_COLORS = { terang: '#f7f5f0', sepia: '#efe5d0', malam: '#141317' };

  /* ---------------- state ---------------- */
  let settings = Object.assign(
    { size: 18, font: 'serif', leading: 1.7, margin: 18, theme: 'terang' },
    BSStorage.getSettings() || {}
  );
  let books = [];          // meta buku
  let current = null;      // buku yang sedang dibaca
  let pages = 1;           // jumlah halaman
  let page = 0;            // halaman sekarang (0-based)
  let pageW = 0;           // lebar satu halaman (px)
  let chapterStarts = [];  // [{ index, title, page }]
  let relayoutTimer = null;

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
    el.bookList.innerHTML = '';

    books.forEach(b => {
      const prog = BSStorage.getProgress(b.id);
      const pct = (prog && prog.pages > 1)
        ? Math.min(100, Math.round(prog.page / (prog.pages - 1) * 100))
        : 0;
      const li = document.createElement('li');
      li.className = 'book-card';
      li.dataset.id = b.id;
      li.innerHTML =
        '<div class="book-cover">' + (b.format === 'epub' ? '📘' : '📄') + '</div>' +
        '<div class="book-info">' +
          '<div class="book-title">' + escapeHtml(b.title) + '</div>' +
          '<div class="book-meta">' + b.format.toUpperCase() +
            (pct > 0 ? ' &middot; ' + pct + '% dibaca' : ' &middot; belum dibaca') +
          '</div>' +
          '<div class="book-progress"><i style="width:' + Math.max(pct, 1.5) + '%"></i></div>' +
        '</div>' +
        '<button class="book-delete" title="Hapus buku" aria-label="Hapus buku">✕</button>';
      el.bookList.appendChild(li);
    });
  }

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
        chapters: parsed.chapters
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
  function relayout(keepRatio) {
    if (!current) return;
    const ratio = pages > 1 ? page / (pages - 1) : 0;

    el.flow.style.transition = 'none';
    el.flow.style.transform = 'none';
    el.flow.style.width = '';

    const W = el.viewport.clientWidth;
    if (!W) { el.flow.style.transition = ''; return; }
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
    BSStorage.setProgress(current.id, page, pages);
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
    const cur = currentChapterTitle();
    el.tocList.querySelectorAll('li').forEach(li => {
      li.classList.toggle('current', li.textContent.trim() === cur);
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
    else if (e.key === 'Escape') {
      if (!sheetsClosed()) closeSheets();
      else if (document.body.classList.contains('focus-mode')) toggleFocus();
      else goLibrary();
    }
  });

  function toggleFocus() {
    const on = document.body.classList.toggle('focus-mode');
    toast(on ? 'Mode fokus — ketuk tengah untuk menu' : 'Menu tampil lagi');
  }

  /* ---------------- panel (sheet) ---------------- */
  function sheetsClosed() {
    return el.sheetSettings.hidden && el.sheetToc.hidden;
  }

  function openSheet(sheet) {
    closeSheets(true);
    el.sheetBackdrop.hidden = false;
    sheet.hidden = false;
    requestAnimationFrame(() => {
      el.sheetBackdrop.classList.add('open');
      sheet.classList.add('open');
    });
  }

  function closeSheets(instant) {
    [el.sheetSettings, el.sheetToc].forEach(s => {
      if (s.hidden) return;
      s.classList.remove('open');
      const hide = () => { if (!s.classList.contains('open')) s.hidden = true; };
      instant ? hide() : setTimeout(hide, 300);
    });
    el.sheetBackdrop.classList.remove('open');
    const hideBd = () => { if (!el.sheetBackdrop.classList.contains('open')) el.sheetBackdrop.hidden = true; };
    instant ? hideBd() : setTimeout(hideBd, 300);
  }

  el.sheetBackdrop.addEventListener('click', () => closeSheets());
  el.btnSettings.addEventListener('click', () => openSheet(el.sheetSettings));
  el.btnToc.addEventListener('click', () => { buildToc(); openSheet(el.sheetToc); });

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
    closeSheets();
    showScreen('library');
    renderLibrary();
  }

  el.progressSlider.addEventListener('input', () => {
    goTo(Number(el.progressSlider.value) - 1);
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (!el.screenReader.classList.contains('active') || !current) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => relayout(true), 150);
  });

  /* ---------------- mulai ---------------- */
  applySettings();
  renderLibrary();
})();
