# TESTING — BAIS Pariaman

> Panduan untuk menjaga kualitas kode (QA/Automated Testing).

> **Version:** v1.0.0

---

## 1. Testing Strategy

- Saat ini proyek ini menggunakan testing native atau runner berbasis Node (seperti Jest, terlihat dari keberadaan `jest.config.js`).
- **Fokus:** Backend API logic dan worker logic.

## 2. Unit Tests & Integration

- Test ditulis di dalam folder `tests/`.
- Backend PHP API dapat ditest menggunakan integrasi tool eksternal atau test runner Node (melakukan HTTP request test).
- Test script frontend/worker diletakkan di `tests/js/`.

## 3. End-to-End (E2E) Tests

- Lakukan uji E2E untuk alur berikut:
  1. Login ASN.
  2. Scan QR dan submit Absen (termasuk saat simulasi jaringan offline dan sync ulang).
  3. Login Admin.
  4. Pengambilan laporan rekapitulasi.

## 4. Perintah Eksekusi
- Jalankan suite test yang tersedia (misal: `npm run test` atau eksekusi Jest secara langsung).
