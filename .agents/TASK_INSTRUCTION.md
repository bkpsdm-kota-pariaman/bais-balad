# TASK INSTRUCTION — BAIS Pariaman

> Panduan pengembangan spesifik untuk BAIS Pariaman.

---

## 0. Prerequisite Reading

**WAJIB BACA sebelum menulis kode:**

1. `AGENTS.md` (Aturan koding)
2. `ARCHITECTURE.md` (Struktur folder)
3. `README.md` utama di root folder.

## Panduan Modifikasi Backend (PHP)

1. **Routing:** Jika menambah rute, daftarkan di `src/routes.php` (FastRoute).
2. **Controller:** Buat atau ubah logic di `src/Controllers/`. Tangkap input, panggil query ke Database via class khusus, lalu return response format JSON.
3. **Validasi:** Pastikan semua input disanitasi.
4. **Auth:** Jangan lupa sertakan middleware/pengecekan token JWT untuk rute yang bukan publik.

## Panduan Modifikasi Frontend

1. **Edit Source:** Selalu lakukan pengeditan di `src/Views/` (Javascript, CSS, HTML mentah). JANGAN edit file langsung di dalam folder `docs/`.
2. **Build:** Perintah `npm run build` setelah setiap perubahan di `src/Views/` untuk men-generate file minify terbaru ke dalam folder `docs/` secara manual oleh user.
3. **Commit:** Commit folder `src/` dan hasil build `docs/` agar sinkron.

## Panduan Worker

1. Script worker berada di folder `worker/`.
2. Script ini berbasis Node.js.
3. Fungsi utamanya adalah sebagai cache data bagi server utama (PHP) serta fitur worker/queue untuk input data ke server utama secara antrian agar server utama tidak berat loadnya.
