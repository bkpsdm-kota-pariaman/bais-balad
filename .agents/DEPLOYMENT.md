# DEPLOYMENT — BAIS Pariaman

> Panduan infrastruktur dan rilis aplikasi ke Production.

> **Version:** v1.0.0

---

## 1. Deployment Architecture

- **Frontend/Web PWA:** Hosting statis (Nginx/Apache), web root menunjuk ke folder `docs/`.
- **Backend/API:** PHP Server (Apache/Nginx + PHP-FPM >= 7.2), web root menunjuk ke folder `public_html/api/`.
- **Database:** Server MySQL / MariaDB terpisah atau lokal.
- **Worker:** PM2 / Systemd Node.js daemon menjalankan `worker/index.js` (atau sejenisnya).

## 2. Environment Setup

- Variabel konfigurasi Backend diatur dalam file `config/config.php` (DB User, DB Password, JWT Secret).
- Variabel Frontend (jika ada) di-inject melalui `esbuild` dalam proses Node build.

## 3. Deployment Steps

- **Prerequisites:** PHP >= 7.2, Composer, Node.js >= 22, NPM, MySQL.
- **Commands Frontend:**
  ```bash
  npm install
  npm run build
  ```
- **Commands Backend:**
  ```bash
  composer install --no-dev --optimize-autoloader
  ```
- Arahkan VirtualHost/Server Block ke `docs/` untuk domain PWA.
- Arahkan VirtualHost/Server Block ke `public_html/api/` untuk domain API.

## 4. Database Migrations

- Tidak menggunakan sistem migrasi otomatis framework (seperti Laravel/Prisma).
- Dump SQL baru ditambahkan/dimodifikasi dari `database/structure.sql` ke database Production secara manual atau melalui script khusus/phpMyAdmin.
