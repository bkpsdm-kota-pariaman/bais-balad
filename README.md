# BAIS BALAD - Aplikasi Absensi Kegiatan ASN

BAIS BALAD adalah aplikasi absensi modern yang dikembangkan untuk memfasilitasi pencatatan kehadiran Aparatur Sipil Negara (ASN) di lingkungan Pemerintah Kota Pariaman. Aplikasi ini mendukung berbagai metode absensi, dilengkapi dengan Progressive Web App (PWA) untuk kenyamanan pengguna, serta Admin Dashboard untuk manajemen kegiatan dan rekapitulasi data.

## 🚀 Fitur Utama

- **PWA (Progressive Web App):** Antarmuka absensi yang ramah pengguna, dapat diinstal di perangkat seluler, dan mendukung fitur absensi secara cepat.
- **Admin Dashboard:** Panel khusus bagi admin untuk mengelola jadwal kegiatan, memantau absensi masuk, menambah data secara manual/massal, serta menghasilkan laporan rekapitulasi kehadiran.
- **RESTful API:** Dibangun dengan PHP untuk mendukung pertukaran data yang efisien dan aman.
- **Keamanan JWT:** Menggunakan JSON Web Token (JWT) untuk proses autentikasi (login ASN dan Admin).
- **Offline / Bulk Support:** Mendukung pengiriman data absensi dalam jumlah besar (batch/bulk submit) melalui background worker.

## 🛠️ Teknologi yang Digunakan

**Backend:**
- PHP (>= 7.2)
- [FastRoute](https://github.com/nikic/FastRoute) (Routing)
- [Firebase PHP-JWT](https://github.com/firebase/php-jwt) (Autentikasi Token)

**Frontend / Build System:**
- Node.js & NPM (untuk build scripts)
- ESBuild (Bundler JavaScript & CSS)
- HTML Minifier Terser (Optimasi HTML)
- HTML/CSS/JS Native

## 📁 Struktur Direktori

Berikut adalah struktur utama dalam repositori ini:

```text
bais-balad/
├── config/              # Konfigurasi utama sistem dan database
├── database/            # File struktur database (structure.sql)
├── docs/                # Hasil build / output statis untuk Frontend (Siap deploy)
├── public_html/         # Entry point (index.php) untuk REST API backend
│   └── api/
├── src/                 # Source code utama (Backend & Frontend)
│   ├── Controllers/     # Logic API & Controller PHP
│   ├── Helpers/         # Fungsi-fungsi bantuan (Helper)
│   ├── Views/           # Source code mentah Frontend (Admin, PWA, Landing Page)
│   └── routes.php       # Definisi rute/endpoint API
├── worker/              # Script background worker/sinkronisasi
├── composer.json        # Dependensi library PHP backend
└── package.json         # Konfigurasi build script frontend dan dependensi NPM
```

## ⚙️ Cara Instalasi & Menjalankan Proyek

### 1. Persiapan Backend (API)
1. Pastikan Anda memiliki PHP (>= 7.2) dan Composer terinstal di server/lokal Anda.
2. Clone repositori ini.
3. Masuk ke direktori proyek dan jalankan untuk menginstal dependensi:
   ```bash
   composer install
   ```
4. Buat database di server MySQL/MariaDB Anda dan import struktur database dari file `database/structure.sql`.
5. Sesuaikan konfigurasi koneksi database di dalam file `config/config.php`.
6. Arahkan *Document Root* web server Anda (Apache/Nginx) ke folder `public_html/api` untuk mengekspos endpoint API.

### 2. Persiapan Frontend
Frontend dibangun menggunakan tools Node.js dan di-*compile* menjadi file statis ke dalam folder `docs/`. Folder `docs` inilah yang nantinya digunakan sebagai *web root* untuk aplikasi sisi klien.

1. Pastikan Node.js (>= 22) dan NPM terinstal.
2. Install semua dependensi build:
   ```bash
   npm install
   ```
3. Lakukan proses *build* untuk menghasilkan file frontend ke folder `docs/`:
   ```bash
   npm run build
   ```
   > **Catatan:** Anda juga dapat mem-*build* bagian tertentu secara spesifik, misal: `npm run build:pwa`, `npm run build:admin`, atau `npm run build:landing`.

4. Folder `docs/` sekarang berisi file HTML/CSS/JS yang sudah di-*minify* dan siap di-hosting.

## 🔒 Endpoints API (Ringkasan)

Beberapa rute API utama yang tersedia di `src/routes.php`:
- `POST /login-asn` - Login untuk pengguna ASN
- `POST /admin/login` - Login untuk Admin
- `GET /jadwal/{kode_akses}` - Mendapatkan detail jadwal dari QR Code
- `POST /absen/submit` - Menyimpan data absensi
- `GET /admin/rekap/{kode_akses}` - Rekap absensi oleh Admin

*(Untuk daftar lengkap rute, silakan periksa file `src/routes.php`)*

## 📄 Lisensi

Proyek ini menggunakan lisensi *Proprietary* (Pemerintah Kota Pariaman).
