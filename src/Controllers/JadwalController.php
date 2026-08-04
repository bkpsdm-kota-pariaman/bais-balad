<?php
// src/Controllers/JadwalController.php

namespace App\Controllers;

use App\Helpers\Response;
use App\Helpers\Database;
use App\Helpers\AuthHelper;
use PDO;
use DateTime;
use DateTimeZone;

class JadwalController {

    /**
     * Mengambil detail jadwal spesifik berdasarkan kode_akses.
     * API ini juga akan mengambil daftar OPD yang menjadi target kegiatan.
     * @param array $vars Variabel dari URL, berisi 'kode_akses'
     */
    public function getJadwal($vars) {
        // 1. Validasi token JWT (bisa token login utama atau token sementara)
        $pegawaiData = AuthHelper::validateToken(); 
        $kodeAkses = $vars['kode_akses'] ?? null;

        if (!$kodeAkses) {
            Response::json(false, 400, "Kode akses tidak boleh kosong.");
            return;
        }

        // 2. Dapatkan koneksi database
        $db = Database::getConnection();

        // Cek absensi ganda untuk pengguna yang diidentifikasi dari token
        $stmtCheck = $db->prepare("SELECT waktu FROM app_absensi_data_absensi WHERE nip = :nip AND kode_akses = :kode_akses");
        $stmtCheck->execute([':nip' => $pegawaiData['nip'], ':kode_akses' => $kodeAkses]);
        $existingAbsen = $stmtCheck->fetch(PDO::FETCH_ASSOC);

        // Cek jika record ada DAN kolom 'waktu' tidak NULL.
        if ($existingAbsen && $existingAbsen['waktu'] !== null) {
            // Format tanggal agar lebih mudah dibaca
            $waktuFormatted = $existingAbsen['waktu']; // Fallback
            try {
                $date = new DateTime($existingAbsen['waktu']);
                $bulan = array(1=>'Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember');
                $namaBulan = $bulan[ (int)$date->format('n') ];
                $waktuFormatted = $date->format('d') . ' ' . $namaBulan . ' ' . $date->format('Y H:i:s');
            } catch (\Exception $e) {
                // Biarkan $waktuFormatted menggunakan nilai fallback jika parsing gagal
            }

            // Kirim response error jika data sudah ada, untuk mencegah duplikasi.
            Response::json(false, 409, "Anda sudah tercatat melakukan absensi untuk kegiatan ini pada: " . $waktuFormatted);
            return;
        }

        // 3. Siapkan tanggal hari ini (WIB) untuk validasi
        $now = new DateTime('now', new DateTimeZone('Asia/Jakarta'));
        $currentDate = $now->format('Y-m-d');

        // 4. Query untuk mengambil detail jadwal
        //    - Jadwal harus aktif pada hari ini.
        //    - Jam selesai tidak lagi menjadi penghalang, sesuai permintaan.
        $sqlJadwal = "
            SELECT *
            FROM app_absensi_jadwal_kegiatan
            WHERE
                kode_akses = :kode_akses AND
                tanggal = :current_date
            LIMIT 1
        ";

        $stmtJadwal = $db->prepare($sqlJadwal);
        $stmtJadwal->bindParam(':kode_akses', $kodeAkses);
        $stmtJadwal->bindParam(':current_date', $currentDate);
        $stmtJadwal->execute();
        $jadwal = $stmtJadwal->fetch(PDO::FETCH_ASSOC);

        if (!$jadwal) {
            Response::json(false, 404, "Jadwal kegiatan tidak ditemukan atau sudah tidak berlaku untuk hari ini.");
            return;
        }

        // --- LOGIKA BARU: Validasi Waktu Mulai ---
        // Cek apakah waktu saat ini sudah melewati jam mulai pada hari yang sama.
        $startTime = new DateTime($jadwal['tanggal'] . ' ' . $jadwal['jam_mulai'], new DateTimeZone('Asia/Jakarta'));

        // $now sudah didefinisikan di atas
        if ($now < $startTime) {
            Response::json(false, 403, "Absensi untuk kegiatan ini belum dibuka. Silakan coba lagi pada atau setelah pukul " . $startTime->format('H:i') . " WIB.");
            return;
        }

        // 5. Query untuk mengambil daftar OPD yang menjadi target
        $sqlTargetOpd = "SELECT opd FROM app_absensi_data_absensi WHERE kode_akses = :kode_akses AND opd IS NOT NULL AND opd != '' GROUP BY opd ORDER BY opd ASC";
        $stmtTargetOpd = $db->prepare($sqlTargetOpd);
        $stmtTargetOpd->bindParam(':kode_akses', $kodeAkses);
        $stmtTargetOpd->execute();
        $targetOpd = $stmtTargetOpd->fetchAll(PDO::FETCH_COLUMN, 0);

        // 6. Gabungkan data jadwal dengan list target OPD
        $jadwal['target_opd'] = $targetOpd;

        Response::json(true, 200, "Jadwal berhasil ditemukan", $jadwal);
    }
}