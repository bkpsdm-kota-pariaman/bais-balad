# DESIGN — BAIS Pariaman

> File ini adalah panduan UI/UX (Design System).

> **Version:** v1.0.0

---

## 1. Design Philosophy

- **Mobile-first:** Mengingat pengguna utama PWA adalah ASN yang menggunakan smartphone.
- **Minimalist & Fast:** Desain tidak boleh memberatkan proses render di smartphone. Hindari animasi berlebihan.

## 2. Color System

- Menggunakan warna-warna elegan dan formal (karena ini aplikasi instansi pemerintah).
- Tetapkan skema warna di file CSS (variabel CSS akar seperti `--primary-color`).

## 3. Typography

- **Primary Font:** Gunakan font sistem native (seperti Segoe UI, Roboto, Helvetica Neue) untuk meminimalkan waktu muat font eksternal.

## 4. Component Design Standards

- Karena dibangun menggunakan HTML/CSS Native, gunakan struktur class yang jelas.
- Hindari penggunaan inline-styles secara masif.
- Pisahkan CSS komponen tertentu (misal tombol, modal) di `src/Views/css/` yang nantinya digabung oleh ESBuild.
