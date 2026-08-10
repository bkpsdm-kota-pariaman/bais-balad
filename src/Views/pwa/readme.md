# PWA Absensi ASN - Dokumentasi & Alur Fitur

Berdasarkan analisis pada kode sumber `src/Views/pwa/js/app.js` dan `src/Views/pwa/index.html`, aplikasi *Progressive Web App* (PWA) ini bertindak sebagai antarmuka klien (client-side) utama bagi para Aparatur Sipil Negara (ASN) untuk mencatatkan kehadirannya pada suatu kegiatan.

Aplikasi ini menggunakan pendekatan **Mobile-First** dan murni menggunakan HTML, Vanilla JavaScript, serta Tailwind CSS.

---

## 🚀 Daftar Fitur Utama

### 1. Dashboard Interaktif
- **Informasi Pegawai**: Menampilkan informasi singkat (Nama, NIP, Jabatan/OPD) dari ASN yang sedang login (data didapat dari JWT Token yang disimpan di `localforage`).
- **Pintasan Aksi**: Terdapat tombol besar untuk `Scan QR Absen`, `Riwayat Absen`, dan `Profil`.

### 2. Metode Identifikasi Kegiatan (Scanning)
- **Kamera QR Scanner**: Menggunakan pustaka pihak ketiga (`html5-qrcode`) untuk membuka kamera belakang/depan dan membaca QR Code kegiatan.
- **Input Kode Manual**: Mendukung alternatif pengetikan kode akses alfanumerik secara manual jika kamera bermasalah (`masukkanKodeManual()`).
- **Validasi Keamanan Berlapis**:
  1. *Client-side Validation*: Mengecek token JWT dari QR Code apakah masih berlaku untuk tanggal dan jam hari ini (`handleJwtValidation()`).
  2. *Server-side Validation*: Mengirim permintaan ke server untuk mengecek detail aturan jadwal dan mencegah absensi ganda (`handleServerValidation()`).

### 3. Smart Geolocation & Strict Rules (Form Absen)
Setelah kegiatan divalidasi, form absensi dibuka dengan alur yang cerdas:
- **Auto-GPS Tracking**: Aplikasi secara otomatis menggunakan API Geolocation peramban (`cekLokasiOtomatis()`) untuk melacak garis lintang dan bujur pengguna, lalu mengubahnya menjadi alamat teks menggunakan Nominatim (OpenStreetMap).
- **Strict Location (Radius)**: Sistem membandingkan koordinat ASN dengan koordinat tujuan (menggunakan rumus *Haversine* di fungsi `getDistanceInMeters()`). Jika ASN berada di luar radius yang diizinkan dan kegiatan di-set sebagai *Strict Location*, tombol "Hadir" akan diblokir.
- **Strict Time (Waktu)**: Jika batas jam absen kegiatan sudah lewat, opsi kehadiran "Hadir" otomatis dinonaktifkan (`forceIzin = true`).

### 4. Dua Mode Kehadiran (Tipe Kehadiran)
Pegawai dapat memilih dua alur yang berbeda menggunakan tombol *radio*:
- **✅ Hadir di Lokasi**:
  - Mengaktifkan *stream* kamera *selfie* di dalam *browser* (`mulaiKameraSelfie()`).
  - Menyediakan *UI viewfinder* untuk menjepret wajah pengguna dan mengonversinya menjadi ukuran yang terkompresi (Base64 JPEG kualitas 0.5) agar hemat *bandwidth*.
- **❌ Tidak Bisa Hadir (Izin / Cuti / DL)**:
  - Mengalihkan UI ke mode formulir (`checkIzinForm()`).
  - Meminta ASN memilih alasan spesifik dari *dropdown*, mengetikkan keterangan wajib, dan mengunggah dokumen/bukti sah (PDF atau Gambar) dengan ukuran maksimal 1MB.

### 5. Mode "Absen Cepat" (Khusus Admin)
Aplikasi membedakan peran antara ASN biasa dan Panitia/Admin.
- Jika pengguna adalah admin, mereka bisa mengaktifkan mode `isAbsenCepatMode`.
- Alur ini memungkinkan kamera tetap terbuka (*Continuous Scan*) untuk memindai kartu nama/ID Card pegawai lain secara beruntun.
- Fitur ini melewatkan pengecekan lokasi GPS dan foto *selfie*, langsung mencatatkan kehadiran bawahan ke dalam sistem dengan status yang ditentukan secara sepihak.

### 6. High-Availability & Queue System
Dalam mengantisipasi ribuan ASN yang absen secara bersamaan (misalnya saat upacara), kode PWA dirancang untuk memiliki *fallback* (cadangan):
- Pertama, PWA mencoba mengirim _payload_ absensi ke **Cloudflare Worker Queue** (`WORKER_URL`). Worker bertugas menampung antrean agar server tidak mati.
- Jika request ke Worker gagal atau terganggu (*timeout/error*), PWA otomatis dan seketika mencoba mengirim request langsung ke **Server Utama** (`API_BASE_URL`).

### 7. Progressive Web App (PWA) / Dukungan Offline
- Menggunakan berkas Service Worker (`sw.js`).
- Menyimpan *App Shell* (`index.html`), seluruh file `.js`, CSS Tailwind, dan *font* ke dalam *cache* peramban. Hal ini memastikan UI aplikasi tetap bisa dibuka dalam hitungan milidetik meskipun sinyal internet ASN sedang buruk (walaupun untuk melakukan absensi pada akhirnya tetap membutuhkan internet).

---

## 🔄 Alur Pemakaian (User Journey)

1. **Awal Buka Aplikasi**: ASN membuka URL aplikasi, memuat *Dashboard*.
2. **Memulai Absen**: ASN menekan tombol **"Scan QR Absen"**.
3. **Pilih Metode**: ASN mengarahkan kamera ke layar monitor/kertas yang berisi QR Code Kegiatan, atau menekan opsi "Masukkan Kode Manual".
4. **Verifikasi**: Sistem menampilkan layar memuat ("Validasi Jadwal...").
5. **Form Terbuka**:
   - ASN melihat detail kegiatan (Judul, Waktu Pelaksanaan).
   - Layar memuat kembali untuk **"Mendeteksi Lokasi"** (GPS).
6. **Pemilihan Opsi**:
   - Jika hadir, ASN memastikan wajahnya terlihat di bingkai kamera lalu menekan **"Ambil Foto"**. Jika terlambat/lokasi tidak pas, kotak keterangan akan muncul dan mewajibkan ASN mengetik alasan (misal: "Izin ke toilet sebentar").
   - Jika izin, ASN mengeklik tombol radio izin, mengisi *form*, dan memilih dokumen (misal surat jalan) lewat tombol *Browse file*.
7. **Kirim Data**: ASN menekan **"Kirim Presensi"**. *Spinner loading* muncul hingga sistem menampilkan notifikasi Sukses besar (*SweetAlert*) dan melempar ASN kembali ke *Dashboard*.
