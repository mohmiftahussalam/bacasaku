# BacaSaku — e-reader saku ala Xteink X4 untuk HP

Aplikasi baca buku (**EPUB** & **TXT**) yang berjalan di browser HP, terinspirasi dari e-reader saku Xteink X4: sederhana, bebas distraksi, dan nyaman untuk membaca halaman-per-halaman.

## Fitur

- **Impor file dari HP** — pilih file `.epub` atau `.txt`, langsung masuk pustaka (tersimpan offline di IndexedDB)
- **Baca halaman-per-halaman** seperti e-reader sungguhan:
  - tap **kiri/kanan** layar = halaman sebelumnya/berikutnya
  - **swipe** kiri/kanan = ganti halaman
  - tap **tengah** = mode fokus (menu disembunyikan, teks full screen)
  - di desktop: tombol `←` `→` `Spasi` `Esc`
- **Setelan baca**: ukuran teks, font (serif/sans/mono), jarak baris, margin
- **3 tema**: ☀️ Terang, 📜 Sepia, 🌙 Malam (nyaman untuk baca malam hari)
- **Daftar isi** per bab + **progres baca** yang tersimpan otomatis (dilanjut lagi saat dibuka)
- **🎚️ Scrubber progres** — seret slider di bar bawah untuk melompat ke halaman mana pun; muncul pratinjau "Hal. x / y" + judul bab saat diseret
- **🔖 Penanda halaman** — tandai halaman penting, daftarnya tersimpan per buku
- **📊 Statistik membaca** — total waktu & rekor hari beruntun (dilihat lewat tombol 📊)
- **Urutan pustaka** — Terakhir dibaca / Terbaru / Judul A–Z
- **📤 Ekspor & impor cadangan** — semua data (buku + isi, progres, penanda, statistik, setelan) disimpan dalam 1 file JSON lewat tombol **⋯**
- **📲 PWA — pasang di layar HP** — tambahkan ke homescreen seperti app native; bisa dibuka **offline** (service worker + manifest)

## Cara Menjalankan

Buka `index.html` dengan klik dua klik, atau jalankan task **Buka Website di Browser** dari panel Tasks, atau pakai Live Server di VS Code.

> Untuk mencoba tanpa punya file: impor file contoh di folder `contoh/` (`buku-contoh.txt` atau `buku-contoh.epub`).

## Deploy ke Vercel (otomatis via GitHub)

Situs ini sudah live: **https://try-vert-delta.vercel.app**

Kode sumber ada di GitHub: **https://github.com/mohmiftahussalam/bacasaku**

Proyek Vercel sudah terhubung ke repository GitHub (branch produksi: `main`), jadi **setiap `git push` ke `main` akan otomatis di-deploy ke Vercel** — tidak perlu deploy manual lagi:

```powershell
git add -A
git commit -m "deskripsi perubahan"
git push
```

Deploy selesai dalam ± 30 detik dan bisa dipantau di https://vercel.com/teams-7fb3/try/deployments.

<details>
<summary>Alternatif: deploy manual dari terminal (tanpa GitHub)</summary>

```powershell
npx vercel@latest deploy --prod --yes
```

</details>

Catatan:

- Proyek statis — tidak ada build step (Vercel mendeteksi output = root folder)
- `.vercelignore` mengecualikan `.github/` dari upload manual; `.gitignore` mengecualikan folder `.vercel/` dari repository
- Deployment Protection sudah dimatikan agar bisa dibuka langsung dari HP

## Struktur Proyek

```text
├── index.html           → shell aplikasi (layar pustaka + layar baca)
├── manifest.webmanifest → manifest PWA (nama, ikon, mode standalone)
├── sw.js                → service worker (cache aset → jalan offline)
├── css/style.css        → gaya mobile-first, tema terang/sepia/malam
├── js/
│   ├── storage.js       → simpan buku (IndexedDB), progres, cadangan
│   ├── parse.js         → parser file TXT & EPUB
│   └── script.js        → logika utama (gestur, halaman, setelan, PWA)
├── img/                 → ikon app (SVG + PNG 180/192/512)
├── lib/jszip.min.js     → library untuk membuka file EPUB (format ZIP)
└── contoh/              → file contoh untuk uji coba
```

## Belajar Vibecoding dengan Proyek Ini

1. Baca satu file per satu, mulai dari `index.html`
2. Kasih feedback ke AI, misal: "tambahkan bookmark" atau "ganti warna tema malam"
3. Jalankan ulang website setiap kali ada perubahan

## Rencana Berikutnya

- Highlight & anotasi teks
- Kutipan acak di layar awal ala idle screen Xteink
- Mode terang/gelap otomatis mengikuti sistem
