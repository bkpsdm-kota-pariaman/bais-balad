# SECURITY — BAIS Pariaman

> File ini berisi protokol dan standar keamanan aplikasi.

> **Version:** v1.0.0

---

## 1. Security Architecture

BAIS Pariaman memisahkan antara frontend statis (tanpa komputasi rahasia) dan backend API yang diamankan oleh JWT (JSON Web Token).

## 2. Authentication & Session

- **Auth Provider:** Native JWT (`firebase/php-jwt`).
- **Session Strategy:** Stateless. Frontend menyimpan JWT di localStorage/sessionStorage atau HttpOnly cookies, lalu disematkan di header `Authorization: Bearer <token>` pada setiap request.
- **Login Types:**
  - ASN: `POST /login-asn`
  - Admin: `POST /admin/login`

## 3. Authorization (RBAC)

- **Roles:** Admin dan ASN.
- **Enforcement:** Di level backend PHP. Payload JWT menyimpan tipe user (admin/asn). Rute API khusus admin harus memvalidasi role ini dalam token sebelum memberikan respon.

## 4. Input Validation

- **Client-side:** Validasi native JS (required, pola regex) sebelum `fetch`.
- **Server-side:** Validasi variabel input (via POST/GET) menggunakan fungsi sanitize di PHP sebelum dieksekusi di database untuk mencegah SQL Injection. Semua eksekusi SQL WAJIB menggunakan prepared statements (PDO).

## 5. Data Security

- **Environment Variables:** Konfigurasi kredensial DB dan JWT_SECRET dijaga di `config.php` yang tidak diekspos melalui web server.
- **Database:** Gunakan algoritma hashing standar (misal `password_hash()` di PHP) untuk menyimpan password. yang menjadi password adalah kolom nik di tabel data_pegawai
