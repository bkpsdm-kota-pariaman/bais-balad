# AGENTS.md — BAIS Pariaman

> Catatan penting: File ini merupakan panduan utama agen AI dalam pengembangan aplikasi BAIS Pariaman.

---

## 1. Project Overview

- **Name** : BAIS Pariaman - Aplikasi Absensi Kegiatan ASN
- **Description** : Aplikasi absensi modern yang dikembangkan untuk memfasilitasi pencatatan kehadiran Aparatur Sipil Negara (ASN) di lingkungan Pemerintah Kota Pariaman.
- **Goal** : Menyediakan pencatatan kehadiran ASN berbasis PWA yang cepat dan pemantauan realtime oleh Admin.
- **Target Users**: ASN (Aparatur Sipil Negara) Kota Pariaman dan Admin.
- **Version** : v1.0.0
- **Status** : Active development

---

## 2. Tech Stack

- **Backend Language** : PHP (>= 7.2)
- **Frontend Language** : HTML, CSS, JavaScript (Native ES6+)
- **Backend Routing** : FastRoute
- **Authentication** : Firebase PHP-JWT
- **Database** : MySQL / MariaDB
- **Build System / Bundler** : Node.js, NPM, ESBuild, HTML Minifier Terser
- **Architecture** : RESTful API Backend + PWA Frontend
- **Background Worker** : Node.js

---

## 3. Commands

```bash
# Development Frontend
npm run build        # Build frontend ke folder docs/
npm run build:pwa    # Build spesifik PWA
npm run build:admin  # Build spesifik Admin
npm run build:landing# Build spesifik Landing Page

# Backend Setup
composer install     # Install dependencies PHP
```

> Jangan gunakan framework frontend modern seperti React/Next.js/Tailwind. Gunakan native web technologies sesuai struktur saat ini.

---

## 4. Project Structure

Architecture: REST API + Static PWA

```
bais-balad/
    config/              # Konfigurasi utama sistem dan database
    database/            # File struktur database (structure.sql)
    docs/                # Hasil build / output statis untuk Frontend (Siap deploy)
    public_html/         # Entry point (index.php) untuk REST API backend
        api/             # Folder web root
    src/                 # Source code utama (Backend & Frontend)
        Controllers/     # Logic API & Controller PHP
        Helpers/         # Fungsi-fungsi bantuan (Helper)
        Views/           # Source code mentah Frontend (Admin, PWA, Landing Page)
        routes.php       # Definisi rute/endpoint API
    worker/              # Script background worker/sinkronisasi
    composer.json        # Dependensi library PHP backend
    package.json         # Konfigurasi build script frontend dan dependensi NPM
```

Aturan penempatan file:
- File PHP routing dan controller harus berada di `src/Controllers` atau root `src/`.
- File Javascript/HTML mentah sebelum di build harus diletakkan di `src/Views/`.
- File worker diletakkan di folder `worker/`.

---

## 5. Naming Conventions

```
# File & Folder
- File PHP Kelas  : PascalCase (contoh: AuthController.php)
- File Helper     : camelCase atau snake_case
- File Frontend   : kebab-case atau camelCase (contoh: app.js, style.css)

# Di Dalam Kode
- Variabel PHP  : $camelCase
- Fungsi PHP    : camelCase()
- Kelas PHP     : PascalCase
- Variabel JS   : camelCase
```

---

## 6. Code Conventions

```
# Pendekatan Umum
- Terapkan prinsip Clean Code.
- Pastikan kode Javascript native kompatibel dengan bundler ESBuild.
- Pastikan endpoint PHP membalas dengan JSON yang terstruktur.

# Urutan Import PHP
- Gunakan `use` statement di bagian atas file setelah namespace.
- Pastikan composer autoload dijalankan di entry point.

# Error Handling
- PHP: Tangkap error menggunakan try-catch, return JSON HTTP error (misal 400, 500).
- JS: Gunakan try-catch untuk fetch requests, tampilkan pesan error yang jelas di UI.
```

---

## 7. API & Data Fetching Rules

```
# Pendekatan Fetching
- Gunakan native `fetch` API di sisi Frontend.

# Format Response API
- Semua endpoint backend sebaiknya mengembalikan format JSON yang konsisten, contoh:
  `{ "status": "success", "data": {...}, "message": "Berhasil" }`
  atau
  `{ "status": "error", "message": "Deskripsi error" }`
```

---

## 8. Styling Rules

```
# Aturan Styling
- Gunakan Vanilla CSS / Native CSS.
- Organisasikan CSS per komponen atau modul dalam `src/Views/`.
- Pastikan responsivitas (Mobile-first).
```

---

## 9. Git Rules

```
# Format Pesan Commit
feat     : [deskripsi fitur baru]
fix      : [deskripsi perbaikan bug]
refactor : [deskripsi perombakan kode]
style    : [perubahan tampilan/format]
docs     : [update dokumentasi]
```

---

## 10. Do Not

> JIKA INSTRUKSI USER AMBIGU, BERHENTI DAN TANYAKAN DULU. JANGAN BERASUMSI.

```
# Struktur File
- DILARANG menambahkan framework Javascript modern (React, Vue, dll).
- DILARANG menghapus proses build ESBuild.

# Kode
- DILARANG mengekspos API Secret Key ke frontend.
- DILARANG melakukan *bypass* autentikasi JWT di API.
```
