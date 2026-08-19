# PRD — BAIS Pariaman

> File ini berfokus pada "Apa" yang akan dibuat dan "Untuk Siapa".

> **Version:** v1.0.0

---

## 1. Executive Summary

**BAIS Pariaman** adalah aplikasi absensi modern yang dirancang untuk memfasilitasi pencatatan kehadiran Aparatur Sipil Negara (ASN) di lingkungan Pemerintah Kota Pariaman, mencakup PWA untuk user dan Dashboard untuk Admin.

- **Vision Statement:** Menjadi aplikasi pencatatan kehadiran yang handal, cepat, dan memanfaatkan teknologi PWA untuk proses loading aplikasi yang lebih instan.

## 2. Target Users & Personas

- **ASN (Aparatur Sipil Negara):**
  - Menggunakan PWA di smartphone.
  - Melakukan scan QR atau absensi jarak.
  - Membutuhkan sistem yang responsif dan waktu muat (loading) yang cepat berkat PWA.
- **Admin Instansi/BKPSDM:**
  - Mengakses Admin Dashboard (Web).
  - Mengelola jadwal kegiatan.
  - Memantau rekapitulasi kehadiran ASN.

## 3. Feature Specifications

### 3.1 PWA (Progressive Web App) Absensi
- **Deskripsi:** Aplikasi ringan berbasis browser smartphone. ASN bisa absen melalui scan QR kegiatan atau input kode akses kegiatan, menggunakan autentikasi token JWT.

### 3.2 Caching PWA
- **Deskripsi:** Memanfaatkan caching PWA untuk mempercepat loading aset aplikasi sehingga tampilan awal dapat dimuat secara instan.

### 3.3 Admin Dashboard
- **Deskripsi:** Panel kontrol untuk mengelola data jadwal kegiatan, rekap absensi dengan rentang waktu, statistik kehadiran rentang waktu,  dan mengekstrak laporan rekapitulasi per kegiatan.

## 4. Non-Functional Requirements

- **Performance:** Aplikasi frontend ringan (dikompilasi dengan Terser), backend merespon < 200ms dengan FastRoute.
- **Reliability:** Mendukung penyimpanan lokal sementara (IndexedDB/LocalStorage) untuk mode Offline PWA untuk mempercepat loading tampilan aplikasi.
