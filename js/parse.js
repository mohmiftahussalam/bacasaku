/* parse.js — pembaca file TXT dan EPUB menjadi daftar bab {title, html}. */
(function () {
  'use strict';

  const MAX_IMAGE_BYTES = 800 * 1024; // gambar > 800KB dilewati (hemat penyimpanan)

  /* ---------------- util ---------------- */

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function resolvePath(baseDir, href) {
    href = String(href || '').split('#')[0].split('?')[0];
    try { href = decodeURIComponent(href); } catch (e) { /* biarkan apa adanya */ }
    const parts = (baseDir ? baseDir + '/' + href : href).split('/');
    const out = [];
    for (const p of parts) {
      if (p === '' || p === '.') continue;
      if (p === '..') out.pop();
      else out.push(p);
    }
    return out.join('/');
  }

  function dirname(path) {
    const i = path.lastIndexOf('/');
    return i === -1 ? '' : path.slice(0, i);
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  }

  function mimeFromPath(p) {
    const ext = String(p || '').split('.').pop().toLowerCase();
    if (ext === 'png') return 'image/png';
    if (ext === 'gif') return 'image/gif';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'svg') return 'image/svg+xml';
    return 'image/jpeg';
  }

  /** Perkecil sampul (sisi terpanjang \u2264 420px) \u2192 JPEG, supaya hemat penyimpanan. */
  function optimizeCover(dataUrl) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        try {
          const MAX = 420;
          let w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h) { resolve(null); return; }
          const scale = Math.min(1, MAX / Math.max(w, h));
          w = Math.max(1, Math.round(w * scale));
          h = Math.max(1, Math.round(h * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        } catch (e) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  /* ---------------- TXT ---------------- */

  const CHAPTER_RE = /^(bab\s+|chapter\s+|bagian\s+|part\s+|prolog|prologue|epilog|epilogue|pengantar|penutup\b)/i;

  function parseTxt(text, fallbackTitle) {
    text = String(text).replace(/\r\n?/g, '\n').replace(/\u0000/g, '');

    // paragraf dipisah baris kosong; kalau file tanpa baris kosong, tiap baris = 1 paragraf
    const hasBlankLines = /\n[ \t]*\n/.test(text);
    const lines = text.split('\n');
    const chapters = [];
    let current = null;   // judul bab yang sedang berjalan
    let paras = [];       // paragraf bab yang sedang berjalan
    let buf = [];         // baris paragraf yang sedang dikumpulkan

    function flushPara() {
      if (!buf.length) return;
      const joined = buf.join(' ');
      buf = [];
      if (joined) paras.push(joined);
    }

    function flushChapter() {
      flushPara();
      if (!paras.length) return;   // bab kosong tidak dicatat
      chapters.push({
        title: current || ('Bagian ' + (chapters.length + 1)),
        html: paras.map(p => '<p>' + escapeHtml(p) + '</p>').join('')
      });
      paras = [];
    }

    lines.forEach(rawLine => {
      if (rawLine === '\f') {           // form-feed = pembatas bab
        flushChapter();
        current = null;
        return;
      }
      const line = rawLine.trim();
      const isHeading = line.length > 0 && line.length < 80 && CHAPTER_RE.test(line);
      if (isHeading) {
        flushChapter();
        current = line.replace(/\s+/g, ' ');
        return;
      }
      if (!line) {                      // baris kosong = akhir paragraf
        flushPara();
        return;
      }
      if (hasBlankLines) buf.push(line);
      else paras.push(line);
    });
    flushChapter();

    if (!chapters.length) chapters.push({ title: 'Isi', html: '<p>(file kosong)</p>' });
    return { title: fallbackTitle, format: 'txt', chapters };
  }

  /* ---------------- EPUB ---------------- */

  async function readToc(zf, opfDoc, opfPath, manifest, spineToc) {
    const map = Object.create(null); // path -> judul

    function register(href, title, baseDir) {
      if (!href || !title) return;
      const p = resolvePath(baseDir != null ? baseDir : dirname(opfPath), href);
      if (!map[p]) map[p] = String(title).trim();
    }

    // EPUB 3: dokumen nav (properties="nav")
    const navItem = Object.values(manifest).find(m => /\bnav\b/.test(m.properties || ''));
    if (navItem && zf(navItem.path)) {
      try {
        const html = await zf(navItem.path).async('string');
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const nav = doc.querySelector('nav[type="toc"], nav[epub\\:type="toc"]') || doc.querySelector('nav');
        if (nav) {
          nav.querySelectorAll('a[href]').forEach(a => register(
            a.getAttribute('href'),
            a.textContent,
            dirname(navItem.path)
          ));
        }
      } catch (e) { /* abaikan */ }
    }

    // EPUB 2: NCX
    const ncxId = spineToc || (Object.values(manifest).find(m => /ncx/.test(m.mediaType || '')) || {}).id;
    const ncxItem = ncxId && manifest[ncxId];
    if (ncxItem && zf(ncxItem.path)) {
      try {
        const xml = await zf(ncxItem.path).async('string');
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        // pakai getElementsByTagName supaya aman terhadap namespace default NCX
        Array.from(doc.getElementsByTagName('navPoint')).forEach(np => {
          const label = (np.getElementsByTagName('navLabel')[0] || {})
            .getElementsByTagName('text')[0];
          const content = np.getElementsByTagName('content')[0];
          if (label && content) register(content.getAttribute('src'), label.textContent);
        });
      } catch (e) { /* abaikan */ }
    }
    return map;
  }

  async function chapterToHtml(zf, path, rawHtml) {
    const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
    const body = doc.body;

    // buang elemen yang tidak perlu / merusak tema
    body.querySelectorAll('script, style, link, meta, iframe, video, audio, object').forEach(el => el.remove());
    body.querySelectorAll('[style]').forEach(el => el.removeAttribute('style'));

    // gambar: ubah jadi data URL supaya bisa disimpan offline
    const imgs = Array.from(body.querySelectorAll('img, image'));
    for (const img of imgs) {
      let src = img.getAttribute('src') || img.getAttribute('xlink:href') || img.getAttribute('href');
      if (!src) { img.remove(); continue; }
      if (/^(https?:|data:)/i.test(src)) continue; // biarkan (butuh internet / sudah data)
      const p = resolvePath(dirname(path), src);
      const file = zf(p);
      if (!file) { img.remove(); continue; }
      try {
        const blob = await file.async('blob');
        if (blob.size > MAX_IMAGE_BYTES) { img.remove(); continue; }
        if (img.tagName.toLowerCase() === 'image') {
          // <image> di SVG: ganti dengan <img>
          const el = doc.createElement('img');
          el.src = await blobToDataURL(blob);
          img.replaceWith(el);
        } else {
          img.src = await blobToDataURL(blob);
          img.removeAttribute('srcset');
        }
      } catch (e) { img.remove(); }
    }

    // tautan internal dinonaktifkan, tautan external boleh dibuka
    body.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (!/^[a-z]+:/i.test(href)) a.removeAttribute('href');
      else if (/^https?:/i.test(href)) { a.target = '_blank'; a.rel = 'noopener'; }
      else a.removeAttribute('href');
    });

    return body.innerHTML.trim();
  }

  function firstHeading(html) {
    const m = html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
    if (!m) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = m[1];
    return (tmp.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 90);
  }

  async function parseEpub(file, fallbackTitle) {
    const zip = await JSZip.loadAsync(file);

    // normalisasi nama entri: zip yang dibuat di Windows sering pakai backslash
    const entries = Object.create(null);
    Object.values(zip.files).forEach(f => { entries[f.name.replace(/\\/g, '/')] = f; });
    const zf = path => entries[String(path || '').replace(/\\/g, '/')] || null;

    // 1. container.xml -> path OPF
    const containerFile = zf('META-INF/container.xml');
    if (!containerFile) throw new Error('File EPUB tidak valid (container.xml tidak ada)');
    const containerXml = await containerFile.async('string');
    const containerDoc = new DOMParser().parseFromString(containerXml, 'application/xml');
    const rootfile = containerDoc.getElementsByTagName('rootfile')[0];
    const opfPath = rootfile && rootfile.getAttribute('full-path');
    if (!opfPath || !zf(opfPath)) throw new Error('File EPUB tidak valid (OPF tidak ada)');

    // 2. baca OPF: metadata, manifest, spine
    const opfHtml = await zf(opfPath).async('string');
    const opfDoc = new DOMParser().parseFromString(opfHtml, 'text/html');

    // judul: OPF memakai <dc:title>, tapi saat di-parse sebagai HTML tag-nya jadi DC:TITLE
    // → cari elemen apa pun yang namanya berakhiran "title"
    let title = '';
    const titleEl = Array.from(opfDoc.getElementsByTagName('*'))
      .find(el => /(^|:)title$/i.test(el.tagName));
    if (titleEl) title = (titleEl.textContent || '').trim();

    const manifest = Object.create(null);
    // NB: pakai getElementsByTagName (bukan selector 'manifest > item') —
    // saat XML di-parse sebagai HTML, tag self-closing <item/> jadi bersarang
    Array.from(opfDoc.getElementsByTagName('item')).forEach(item => {
      const id = item.getAttribute('id');
      if (!id) return;
      manifest[id] = {
        path: resolvePath(dirname(opfPath), item.getAttribute('href') || ''),
        mediaType: item.getAttribute('media-type') || '',
        properties: item.getAttribute('properties') || ''
      };
    });

    const spineEl = opfDoc.getElementsByTagName('spine')[0];
    const spineToc = spineEl && spineEl.getAttribute('toc');
    const spine = Array.from(opfDoc.getElementsByTagName('itemref'))
      .map(ref => manifest[ref.getAttribute('idref')])
      .filter(Boolean)
      .filter(m => !/\bnav\b/.test(m.properties || ''))
      .filter(m => /html|xml/.test(m.mediaType) || /\.(x?html?)$/i.test(m.path));

    if (!spine.length) throw new Error('EPUB ini tidak punya daftar bab');

    // 3. daftar isi (judul bab)
    const tocMap = await readToc(zf, opfDoc, opfPath, manifest, spineToc);

    // 4. baca tiap bab
    const chapters = [];
    const seen = new Set();
    for (let i = 0; i < spine.length; i++) {
      const item = spine[i];
      if (seen.has(item.path)) continue;
      seen.add(item.path);
      const entry = zf(item.path);
      if (!entry) continue;
      const raw = await entry.async('string');
      const html = await chapterToHtml(zf, item.path, raw);
      if (!html) continue;
      chapters.push({
        title: tocMap[item.path] || firstHeading(html) || 'Bagian ' + (chapters.length + 1),
        html
      });
    }

    if (!chapters.length) throw new Error('EPUB ini tidak punya bab yang bisa dibaca');

    // 5. sampul: EPUB3 properties="cover-image", EPUB2 <meta name="cover">, atau <reference type="cover">
    let cover = null;
    try {
      let coverPath = null;
      let coverMime = '';
      const byProp = Object.values(manifest).find(m => /\bcover-image\b/.test(m.properties || ''));
      if (byProp) { coverPath = byProp.path; coverMime = byProp.mediaType; }
      if (!coverPath) {
        const meta = Array.from(opfDoc.getElementsByTagName('meta'))
          .find(x => (x.getAttribute('name') || '').toLowerCase() === 'cover');
        const item = meta && manifest[meta.getAttribute('content')];
        if (item) { coverPath = item.path; coverMime = item.mediaType; }
      }
      if (!coverPath) {
        const ref = Array.from(opfDoc.getElementsByTagName('reference'))
          .find(x => (x.getAttribute('type') || '').toLowerCase() === 'cover');
        if (ref) coverPath = resolvePath(dirname(opfPath), ref.getAttribute('href') || '');
      }
      const entry = coverPath && zf(coverPath);
      if (entry) {
        const b64 = await entry.async('base64');
        cover = await optimizeCover('data:' + (coverMime || mimeFromPath(coverPath)) + ';base64,' + b64);
      }
    } catch (e) { cover = null; }

    return { title: title || fallbackTitle, format: 'epub', chapters, cover };
  }

  window.BSParse = { parseTxt, parseEpub };
})();
