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

## Cara Menjalankan

Buka `index.html` dengan klik dua klik, atau jalankan task **Buka Website di Browser** dari panel Tasks, atau pakai Live Server di VS Code.

> Untuk mencoba tanpa punya file: impor file contoh di folder `contoh/` (`buku-contoh.txt` atau `buku-contoh.epub`).

## Deploy ke Vercel

Situs ini sudah live: **https://try-vert-delta.vercel.app**

Untuk deploy ulang setelah ada perubahan:

```powershell
npx vercel@latest deploy --prod --yes
```

Catatan:

- Proyek statis — tidak ada build step (Vercel mendeteksi output = root folder)
- `.vercelignore` mengecualikan `.github/` dari upload
- Deployment Protection sudah dimatikan agar bisa dibuka langsung dari HP

## Struktur Proyek

```text
├── index.html         → shell aplikasi (layar pustaka + layar baca)
├── css/style.css      → gaya mobile-first, tema terang/sepia/malam
├── js/
│   ├── storage.js     → simpan buku (IndexedDB), progres, setelan
│   ├── parse.js       → parser file TXT & EPUB
│   └── script.js      → logika utama (gestur, halaman, setelan)
├── lib/jszip.min.js   → library untuk membuka file EPUB (format ZIP)
└── contoh/            → file contoh untuk uji coba
```

## Belajar Vibecoding dengan Proyek Ini

1. Baca satu file per satu, mulai dari `index.html`
2. Kasih feedback ke AI, misal: "tambahkan bookmark" atau "ganti warna tema malam"
3. Jalankan ulang website setiap kali ada perubahan

## Rencana Berikutnya

- Bookmark, highlight & anotasi (fitur utama berikutnya)
- Kutipan acak di layar awal ala idle screen Xteink
- Statistik kebiasaan membaca
