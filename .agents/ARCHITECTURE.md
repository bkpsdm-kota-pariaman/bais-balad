# ARCHITECTURE — BAIS Pariaman

> File ini berfokus pada topologi sistem aplikasi BAIS Pariaman.

> **Version:** v1.0.0

---

## 1. System Overview

Aplikasi BAIS Pariaman adalah arsitektur berbasis Client-Server (RESTful API & Static Frontend PWA).
Backend memproses request menggunakan PHP murni tanpa heavy framework, menggunakan FastRoute.
Frontend merupakan aplikasi Single Page Application (SPA) / Progressive Web App (PWA) yang dibuild dari native JS/HTML/CSS menjadi aset statis.

## 2. Architecture Layers

- **Presentation Layer (Frontend):** PWA berbasis Native JS/HTML/CSS, dibuild oleh ESBuild & Terser.
- **Application Layer (Backend):** RESTful API dengan PHP, FastRoute untuk routing, dan Firebase PHP-JWT untuk autentikasi token.
- **Background Layer:** Node.js script di folder `worker/` untuk proses antrean asinkron.
- **Data Access Layer:** PHP PDO Murni ke database MySQL/MariaDB.

## 3. Directory Structure

```text
bais-balad/
  config/              # Konfigurasi sistem (DB, JWT secret)
  database/            # Struktur SQL
  docs/                # Compiled static assets (Web Root Frontend)
  public_html/api/     # Web Root Backend API (Entry point index.php)
  src/                 # Source kode utama
    Controllers/       # PHP Controllers
    Helpers/           # PHP Utility classes/functions
    Views/             # Native JS, CSS, HTML sumber PWA/Admin
    routes.php         # FastRoute definitions
  worker/              # Worker script (Node.js)
```

## 4. Database Schema

- Berbasis MySQL/MariaDB.
- Struktur tabel tersedia pada file `database/structure.sql`.
- Tabel utama mengatur ASN, Jadwal, Absensi, dan Admin.

## 5. API Design

- **Method**: GET, POST, PUT, DELETE
- **Auth**: JWT (Authorization: Bearer <token>)
- **Format**: JSON Payload & JSON Response

## 6. Key Design Decisions

- **FastRoute & PHP Native**: Dipilih untuk performa maksimal dan kebutuhan memori minimal di server.
- **Native JS & ESBuild**: PWA ringan dan cepat, tidak memerlukan payload React/Vue yang besar.
- **Background Worker**: Node.js worker menangani antrean proses di belakang layar untuk mencegah beban berlebih di server utama PHP.
