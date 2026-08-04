<?php
// src/Controllers/AdminRekapController.php

namespace App\Controllers;

use App\Helpers\Response;
use App\Helpers\Database;
use App\Helpers\AdminAuthHelper;
use PDO;

class AdminRekapController {
    // This function is now simplified to only get the initial page data
    public function getRekap($vars) {
        AdminAuthHelper::validate();
        $kodeAkses = $vars['kode_akses'] ?? null;
        $db = Database::getConnection();

        // 1. Dapatkan Detail Jadwal
        $stmtJadwal = $db->prepare("SELECT * FROM app_absensi_jadwal_kegiatan WHERE kode_akses = :ka");
        $stmtJadwal->execute([':ka' => $kodeAkses]);
        $jadwal = $stmtJadwal->fetch(PDO::FETCH_ASSOC);
        if (!$jadwal) {
            Response::json(false, 404, "Jadwal kegiatan tidak ditemukan.");
        }

        // 2. Dapatkan Daftar OPD Target (sekarang langsung dari data absensi)
        $stmtOpdFilter = $db->prepare("SELECT DISTINCT opd FROM app_absensi_data_absensi WHERE kode_akses = :ka AND opd IS NOT NULL ORDER BY opd");
        $stmtOpdFilter->execute([':ka' => $kodeAkses]);
        $opdForFilter = $stmtOpdFilter->fetchAll(PDO::FETCH_COLUMN, 0);
        $jadwal['target_opd'] = $opdForFilter;
        $responsePayload = [
            'jadwal' => $jadwal,
            'opd_for_filter' => $opdForFilter
        ];

        Response::json(true, 200, "Data dasar rekap berhasil diambil", $responsePayload);
    }

    // New function for summary
    public function getRekapSummary($vars) {
        AdminAuthHelper::validate();
        $kodeAkses = $vars['kode_akses'] ?? null;
        $db = Database::getConnection();

        // 1. Query agregasi data absensi per OPD
        $sql = "
            SELECT 
                opd as opd_name,
                COUNT(*) as target,
                SUM(CASE WHEN waktu IS NOT NULL AND (status_verifikasi IS NULL OR status_verifikasi != 'Ditolak Oleh Admin') THEN 1 ELSE 0 END) as hadir,
                SUM(CASE WHEN waktu IS NOT NULL AND (status_verifikasi IS NULL OR status_verifikasi != 'Ditolak Oleh Admin') AND (status_kehadiran = 'Hadir' OR status_kehadiran IS NULL) THEN 1 ELSE 0 END) as hadir_ideal,
                SUM(CASE WHEN waktu IS NOT NULL AND (status_verifikasi IS NULL OR status_verifikasi != 'Ditolak Oleh Admin') AND status_kehadiran = 'Hadir Terlambat' THEN 1 ELSE 0 END) as terlambat,
                SUM(CASE WHEN waktu IS NOT NULL AND (status_verifikasi IS NULL OR status_verifikasi != 'Ditolak Oleh Admin') AND status_kehadiran = 'Hadir Terlambat Diluar Lokasi' THEN 1 ELSE 0 END) as terlambat_diluar_lokasi,
                SUM(CASE WHEN waktu IS NOT NULL AND (status_verifikasi IS NULL OR status_verifikasi != 'Ditolak Oleh Admin') AND status_kehadiran = 'Hadir Diluar Lokasi' THEN 1 ELSE 0 END) as diluar_lokasi
            FROM app_absensi_data_absensi 
            WHERE kode_akses = ? AND opd IS NOT NULL AND opd != ''
            GROUP BY opd
        ";
        $stmt = $db->prepare($sql);
        $stmt->execute([$kodeAkses]);
        $results = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Jika tidak ada data sama sekali, kembalikan data kosong
        if (empty($results)) {
            $responsePayload = [
                'summary' => [
                    'total_target' => 0, 
                    'total_hadir' => 0, 
                    'total_alpa' => 0, 
                    'percentage_hadir' => 0, 
                    'total_hadir_ideal' => 0, 
                    'total_terlambat' => 0, 
                    'total_diluar_lokasi' => 0,
                    'total_terlambat_diluar_lokasi' => 0
                ],
                'per_opd_summary' => [],
            ];
            Response::json(true, 200, "Ringkasan rekap berhasil diambil", $responsePayload);
            return;
        }

        // 2. Finalisasi format statistik per OPD
        $finalPerOpdStats = [];
        $totalTarget = 0;
        $totalHadir = 0;
        $totalHadirIdeal = 0;
        $totalTerlambat = 0;
        $totalDiluarLokasi = 0;
        $totalTerlambatDiluarLokasi = 0;

        foreach ($results as $stats) {
            // Casting SQL sum values back to int
            $stats['target'] = (int)$stats['target'];
            $stats['hadir'] = (int)$stats['hadir'];
            $stats['hadir_ideal'] = (int)$stats['hadir_ideal'];
            $stats['terlambat'] = (int)$stats['terlambat'];
            $stats['terlambat_diluar_lokasi'] = (int)$stats['terlambat_diluar_lokasi'];
            $stats['diluar_lokasi'] = (int)$stats['diluar_lokasi'];

            if ($stats['target'] > 0) {
                $stats['alpa'] = $stats['target'] - $stats['hadir'];
                $stats['percentage'] = round(($stats['hadir'] / $stats['target']) * 100);
            
                $finalPerOpdStats[] = $stats;

                // Akumulasi untuk total keseluruhan
                $totalTarget += $stats['target'];
                $totalHadir += $stats['hadir'];
                $totalHadirIdeal += $stats['hadir_ideal'];
                $totalTerlambat += $stats['terlambat'];
                $totalDiluarLokasi += $stats['diluar_lokasi'];
                $totalTerlambatDiluarLokasi += $stats['terlambat_diluar_lokasi'];
            }
        }
        
        // Urutkan berdasarkan nama OPD
        usort($finalPerOpdStats, function($a, $b) {
            return strcmp($a['opd_name'], $b['opd_name']);
        });

        // 5. Siapkan payload response
        $responsePayload = [
            'summary' => [
                'total_target' => $totalTarget,
                'total_hadir' => $totalHadir,
                'total_alpa' => $totalTarget - $totalHadir,
                'percentage_hadir' => $totalTarget > 0 ? round(($totalHadir / $totalTarget) * 100) : 0,
                'total_hadir_ideal' => $totalHadirIdeal,
                'total_terlambat' => $totalTerlambat,
                'total_diluar_lokasi' => $totalDiluarLokasi,
                'total_terlambat_diluar_lokasi' => $totalTerlambatDiluarLokasi
            ],
            'per_opd_summary' => $finalPerOpdStats,
        ];

        Response::json(true, 200, "Ringkasan rekap berhasil diambil", $responsePayload);
    }

    // New function for filtered details
    public function getRekapDetails($vars) {
        AdminAuthHelper::validate();
        $kodeAkses = $vars['kode_akses'] ?? null;
        $db = Database::getConnection();

        $inputJSON = file_get_contents('php://input');
        $filters = json_decode($inputJSON, true);
        $opdList = $filters['opd_list'] ?? [];
        $statusKehadiranList = $filters['status_kehadiran'] ?? [];
        $searchFilter = $filters['search'] ?? null;
        $statusVerifikasiList = $filters['status_verifikasi'] ?? [];

        $sql = "
            SELECT
                nip, nama_pegawai, opd AS perangkat_daerah, jabatan,
                waktu AS waktu_absen, status_verifikasi, keterangan,
                nama_file_foto, lokasi AS lokasi_absen, status_kehadiran
            FROM
                app_absensi_data_absensi
            WHERE
                kode_akses = ?
        ";
        $params = [$kodeAkses];

        // Tambahkan filter OPD hanya jika ada yang dipilih
        if (!empty($opdList)) {
            $placeholders = implode(',', array_fill(0, count($opdList), '?'));
            $sql .= " AND opd IN ($placeholders)";
            array_push($params, ...$opdList);
        }

        // Tambahkan kondisi pencarian jika ada input dari user
        if (!empty($searchFilter)) {
            $sql .= " AND (nip LIKE ? OR nama_pegawai LIKE ? OR jabatan LIKE ?)";
            $params[] = '%' . $searchFilter . '%';
            $params[] = '%' . $searchFilter . '%';
            $params[] = '%' . $searchFilter . '%';
        }

        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $results = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Proses filter status di sisi PHP berdasarkan status efektif
        $detailPegawai = [];
        foreach ($results as $pegawai) {
            // Tentukan status kehadiran efektif
            $status_kehadiran_efektif = 'alpa';
            if ($pegawai['waktu_absen'] !== null && $pegawai['status_verifikasi'] !== 'Ditolak Oleh Admin') {
                $status_kehadiran_efektif = $pegawai['status_kehadiran'];
            }

            // Tentukan status verifikasi efektif (menangani nilai NULL)
            $status_verifikasi_efektif = $pegawai['status_verifikasi'] ?? 'ALPA';

            // Cek kecocokan dengan filter. Jika array filter kosong, anggap cocok (tampilkan semua).
            $kehadiranMatch = empty($statusKehadiranList) || in_array($status_kehadiran_efektif, $statusKehadiranList);
            $verifikasiMatch = empty($statusVerifikasiList) || in_array($status_verifikasi_efektif, $statusVerifikasiList);

            if ($kehadiranMatch && $verifikasiMatch) {
                $detailPegawai[] = $pegawai;
            }
        }
        
        Response::json(true, 200, "Detail rekap berhasil diambil", $detailPegawai);
    }

    public function getRekapOpdList($vars) {
        AdminAuthHelper::validate();
        $kodeAkses = $vars['kode_akses'] ?? null;
        if (!$kodeAkses) {
            Response::json(false, 400, "Kode akses tidak disediakan.");
        }
        $db = Database::getConnection();

        $stmtOpdFilter = $db->prepare("SELECT DISTINCT opd FROM app_absensi_data_absensi WHERE kode_akses = :ka AND opd IS NOT NULL ORDER BY opd");
        $stmtOpdFilter->execute([':ka' => $kodeAkses]);
        $opdForFilter = $stmtOpdFilter->fetchAll(PDO::FETCH_COLUMN, 0);

        Response::json(true, 200, "Daftar OPD untuk filter berhasil diambil.", $opdForFilter);
    }

    public function verifikasiAbsen() {
        AdminAuthHelper::validate();
        $db = Database::getConnection();
        // Tambahkan untuk mendapatkan zona waktu
        $now = new \DateTime('now', new \DateTimeZone('Asia/Jakarta'));
        
        $inputJSON = file_get_contents('php://input');
        $input = json_decode($inputJSON, true);

        $kodeAkses = $input['kode_akses'] ?? null;
        $nip = $input['nip'] ?? null;
        $statusVerifikasi = $input['status_verifikasi'] ?? null;
        $keteranganAdmin = $input['keterangan'] ?? null;
        $opd = $input['opd'] ?? null;
        $jabatan = $input['jabatan'] ?? null;

        if (!$kodeAkses || !$nip || !$statusVerifikasi) {
            Response::json(false, 400, "Data tidak lengkap: kode_akses, nip, dan status_verifikasi wajib diisi.");
        }

        // Fetch current status to make informed decisions
        $stmtCurrent = $db->prepare("SELECT waktu, status_kehadiran FROM app_absensi_data_absensi WHERE kode_akses = :ka AND nip = :nip");
        $stmtCurrent->execute([':ka' => $kodeAkses, ':nip' => $nip]);
        $currentAbsenData = $stmtCurrent->fetch(PDO::FETCH_ASSOC);

        if (!$currentAbsenData) {
            Response::json(false, 404, "Data absensi tidak ditemukan untuk NIP ini pada kegiatan ini.");
            return;
        }

        // --- LOGIKA BARU: Tangani perubahan status secara komprehensif ---
        if ($statusVerifikasi === 'Terverifikasi Oleh Admin') {
            // Jika admin mensahkan kehadiran (mengubah dari Alpa menjadi Hadir).
            // Gunakan COALESCE untuk mengisi waktu hanya jika sebelumnya NULL.
            $sql = "UPDATE app_absensi_data_absensi 
                    SET 
                        status_verifikasi = :sv, 
                        keterangan = :ket,
                        opd = :opd,
                        jabatan = :jabatan,
                        waktu = :waktu_new,
                        status_kehadiran = :status_kehadiran_new
                    WHERE kode_akses = :ka AND nip = :nip";

            $updateWaktu = $currentAbsenData['waktu'];
            $updateStatusKehadiran = $currentAbsenData['status_kehadiran'];

            // Jika waktu absensi saat ini kosong (NULL, string kosong, atau tanggal default MySQL)
            if ($currentAbsenData['waktu'] === null || $currentAbsenData['waktu'] === '' || $currentAbsenData['waktu'] === '0000-00-00 00:00:00') {
                $updateWaktu = $now->format('Y-m-d H:i:s');
                $updateStatusKehadiran = 'Hadir Terlambat Diluar Lokasi';
            }

            $stmt = $db->prepare($sql);
            $stmt->execute([
                ':sv' => $statusVerifikasi,
                ':ket' => $keteranganAdmin,
                ':opd' => $opd,
                ':jabatan' => $jabatan,
                ':waktu_new' => $updateWaktu,
                ':status_kehadiran_new' => $updateStatusKehadiran,
                ':ka' => $kodeAkses,
                ':nip' => $nip
            ]);
        } else if ($statusVerifikasi === 'Ditolak Oleh Admin') {
            // Jika admin menolak kehadiran, hanya update status verifikasi dan keterangan.
            // Status kehadiran dan waktu absen asli tetap dipertahankan.
            $sql = "UPDATE app_absensi_data_absensi 
                    SET 
                        status_verifikasi = :sv, 
                        keterangan = :ket,
                        opd = :opd,
                        jabatan = :jabatan
                    WHERE kode_akses = :ka AND nip = :nip";
            $stmt = $db->prepare($sql);
            $stmt->execute([':sv' => $statusVerifikasi, ':ket' => $keteranganAdmin, ':opd' => $opd, ':jabatan' => $jabatan, ':ka' => $kodeAkses, ':nip' => $nip]);
        } else {
            // Fallback jika ada status lain, hanya update status dan keterangan.
            $sql = "UPDATE app_absensi_data_absensi SET status_verifikasi = :sv, keterangan = :ket, opd = :opd, jabatan = :jabatan WHERE kode_akses = :ka AND nip = :nip";
            $stmt = $db->prepare($sql);
            $stmt->execute([':sv' => $statusVerifikasi, ':ket' => $keteranganAdmin, ':opd' => $opd, ':jabatan' => $jabatan, ':ka' => $kodeAkses, ':nip' => $nip]);
        }
        Response::json(true, 200, "Status absensi berhasil diperbarui.");
    }

    public function deleteAbsensiEntry($vars) {
        AdminAuthHelper::validate();
        $db = Database::getConnection();
        
        $kodeAkses = $vars['kode_akses'] ?? null;
        $nip = $vars['nip'] ?? null;

        if (!$kodeAkses || !$nip) {
            Response::json(false, 400, "Data tidak lengkap: kode_akses dan nip wajib diisi.");
            return;
        }

        $sql = "DELETE FROM app_absensi_data_absensi WHERE kode_akses = :ka AND nip = :nip";
        $stmt = $db->prepare($sql);
        $stmt->execute([
            ':ka' => $kodeAkses,
            ':nip' => $nip
        ]);

        if ($stmt->rowCount() > 0) {
            Response::json(true, 200, "Data absensi pegawai berhasil dihapus dari rekap.");
        } else {
            Response::json(false, 404, "Data absensi tidak ditemukan untuk dihapus.");
        }
    }

    public function getEligiblePegawai($vars) {
        AdminAuthHelper::validate();
        $kodeAkses = $vars['kode_akses'] ?? null;
        $db = Database::getConnection();

        if (!$kodeAkses) {
            Response::json(false, 400, "Kode akses kegiatan tidak disediakan.");
        }

        // Ambil filter dari body request POST
        $inputJSON = file_get_contents('php://input');
        $filters = json_decode($inputJSON, true);
        $opdList = $filters['opd_list'] ?? [];
        $searchFilter = $filters['search'] ?? null;

        // Query untuk mendapatkan semua NIP yang sudah ada di rekap kegiatan ini
        $subQuery = "SELECT nip FROM app_absensi_data_absensi WHERE kode_akses = ?";

        // Query utama untuk mendapatkan semua pegawai yang NIP-nya TIDAK ADA di subquery
        $sql = "SELECT nip, nama_pegawai, jabatan, perangkat_daerah FROM app_absensi_data_pegawai WHERE nip NOT IN ($subQuery)";
        
        $params = [$kodeAkses];

        // Tambahkan filter pencarian
        if (!empty($searchFilter)) {
            $sql .= " AND (nip LIKE ? OR nama_pegawai LIKE ? OR jabatan LIKE ?)";
            $params[] = '%' . $searchFilter . '%';
            $params[] = '%' . $searchFilter . '%';
            $params[] = '%' . $searchFilter . '%';
        }

        // Tambahkan filter OPD
        if (!empty($opdList)) {
            $placeholders = implode(',', array_fill(0, count($opdList), '?'));
            $sql .= " AND perangkat_daerah IN ($placeholders)";
            array_push($params, ...$opdList);
        }

        $sql .= " ORDER BY nama_pegawai ASC";
        
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $eligiblePegawai = $stmt->fetchAll(PDO::FETCH_ASSOC);

        Response::json(true, 200, "Daftar pegawai yang dapat ditambahkan berhasil diambil.", $eligiblePegawai);
    }

    public function addAbsensiEntry($vars) {
        AdminAuthHelper::validate();
        $kodeAkses = $vars['kode_akses'] ?? null;
        $db = Database::getConnection();

        $inputJSON = file_get_contents('php://input');
        $input = json_decode($inputJSON, true);

        $nip = $input['nip'] ?? null;
        $statusKehadiran = $input['status_kehadiran'] ?? null;
        $statusVerifikasi = $input['status_verifikasi'] ?? null;
        $keterangan = $input['keterangan'] ?? null;

        if (!$kodeAkses || !$nip || !$statusKehadiran || !$statusVerifikasi || !$keterangan) {
            Response::json(false, 400, "Data tidak lengkap. Semua field wajib diisi.");
        }

        // 1. Cek apakah pegawai sudah ada di rekap ini
        $stmtCheck = $db->prepare("SELECT COUNT(*) FROM app_absensi_data_absensi WHERE kode_akses = :ka AND nip = :nip");
        $stmtCheck->execute([':ka' => $kodeAkses, ':nip' => $nip]);
        if ($stmtCheck->fetchColumn() > 0) {
            Response::json(false, 409, "Pegawai ini sudah ada dalam daftar absensi kegiatan ini.");
        }

        // 2. Ambil detail pegawai dari tabel master
        $stmtPegawai = $db->prepare("SELECT nama_pegawai, perangkat_daerah, jabatan FROM app_absensi_data_pegawai WHERE nip = :nip");
        $stmtPegawai->execute([':nip' => $nip]);
        $pegawai = $stmtPegawai->fetch(PDO::FETCH_ASSOC);
        if (!$pegawai) {
            Response::json(false, 404, "Data master untuk NIP yang dipilih tidak ditemukan.");
        }

        // 3. Ambil kategori dari jadwal
        $stmtJadwal = $db->prepare("SELECT kategori FROM app_absensi_jadwal_kegiatan WHERE kode_akses = :ka");
        $stmtJadwal->execute([':ka' => $kodeAkses]);
        $jadwal = $stmtJadwal->fetch(PDO::FETCH_ASSOC);
        if (!$jadwal) {
            Response::json(false, 404, "Jadwal kegiatan tidak ditemukan.");
        }

        // 4. Tentukan waktu berdasarkan status kehadiran
        $waktu = null;
        if ($statusKehadiran !== 'Alpa') {
            $now = new \DateTime('now', new \DateTimeZone('Asia/Jakarta'));
            $waktu = $now->format('Y-m-d H:i:s');
        }

        // 5. Insert data baru ke tabel absensi
        $sql = "INSERT INTO app_absensi_data_absensi 
                    (kode_akses, nip, nama_pegawai, opd, jabatan, kategori, status_verifikasi, status_kehadiran, keterangan, waktu, nama_file_foto, lokasi) 
                VALUES 
                    (:ka, :nip, :nama, :opd, :jabatan, :kategori, :sv, :sk, :ket, :waktu, 'MANUAL_INPUT.jpg', 'MANUAL_INPUT_ADMIN')";
        
        $stmtInsert = $db->prepare($sql);
        $stmtInsert->execute([
            ':ka' => $kodeAkses,
            ':nip' => $nip,
            ':nama' => $pegawai['nama_pegawai'],
            ':opd' => $pegawai['perangkat_daerah'],
            ':jabatan' => $pegawai['jabatan'],
            ':kategori' => $jadwal['kategori'],
            ':sv' => $statusVerifikasi,
            ':sk' => $statusKehadiran,
            ':ket' => $keterangan,
            ':waktu' => $waktu
        ]);

        if ($stmtInsert->rowCount() > 0) {
            Response::json(true, 201, "Peserta berhasil ditambahkan ke dalam rekap.");
        } else {
            Response::json(false, 500, "Gagal menambahkan peserta ke dalam rekap.");
        }
    }

    public function addAbsensiEntryBulk($vars) {
        AdminAuthHelper::validate();
        $kodeAkses = $vars['kode_akses'] ?? null;
        $db = Database::getConnection();

        $inputJSON = file_get_contents('php://input');
        $pesertaBatch = json_decode($inputJSON, true);

        if (empty($pesertaBatch) || !is_array($pesertaBatch)) {
            Response::json(false, 400, "Data batch tidak valid atau kosong.");
        }

        // Ambil detail jadwal sekali saja
        $stmtJadwal = $db->prepare("SELECT kategori FROM app_absensi_jadwal_kegiatan WHERE kode_akses = :ka");
        $stmtJadwal->execute([':ka' => $kodeAkses]);
        $jadwal = $stmtJadwal->fetch(PDO::FETCH_ASSOC);
        if (!$jadwal) {
            Response::json(false, 404, "Jadwal kegiatan tidak ditemukan.");
        }

        $berhasil = 0;
        $gagal = 0;
        $dilewati = 0;

        $db->beginTransaction();
        try {
            // Siapkan statement di luar loop
            $stmtCheck = $db->prepare("SELECT COUNT(*) FROM app_absensi_data_absensi WHERE kode_akses = :ka AND nip = :nip");
            $stmtPegawai = $db->prepare("SELECT nama_pegawai, perangkat_daerah, jabatan FROM app_absensi_data_pegawai WHERE nip = :nip");
            $stmtInsert = $db->prepare("INSERT INTO app_absensi_data_absensi (kode_akses, nip, nama_pegawai, opd, jabatan, kategori, status_verifikasi, status_kehadiran, keterangan, waktu, nama_file_foto, lokasi) VALUES (:ka, :nip, :nama, :opd, :jabatan, :kategori, :sv, :sk, :ket, NULL, NULL, NULL)");

            foreach ($pesertaBatch as $peserta) {
                $nip = $peserta['nip'] ?? null;
                if (!$nip) {
                    $gagal++;
                    continue;
                }

                // 1. Cek duplikat
                $stmtCheck->execute([':ka' => $kodeAkses, ':nip' => $nip]);
                if ($stmtCheck->fetchColumn() > 0) {
                    $dilewati++;
                    continue;
                }

                // 2. Ambil detail pegawai
                $stmtPegawai->execute([':nip' => $nip]);
                $pegawai = $stmtPegawai->fetch(PDO::FETCH_ASSOC);
                if (!$pegawai) {
                    $gagal++;
                    continue;
                }

                // 3. Insert with 'ALPA' status, allowing them to check in later
                $stmtInsert->execute([
                    ':ka' => $kodeAkses,
                    ':nip' => $nip,
                    ':nama' => $pegawai['nama_pegawai'],
                    ':opd' => $pegawai['perangkat_daerah'],
                    ':jabatan' => $pegawai['jabatan'],
                    ':kategori' => $jadwal['kategori'],
                    ':sv' => 'ALPA',
                    ':sk' => 'Alpa',
                    ':ket' => 'Ditambahkan ke daftar peserta oleh admin.'
                ]);

                if ($stmtInsert->rowCount() > 0) $berhasil++;
                else $gagal++;
            }

            $db->commit();

            $message = "$berhasil peserta berhasil ditambahkan ke daftar hadir.";
            if ($dilewati > 0) $message .= " $dilewati peserta dilewati karena sudah ada.";
            if ($gagal > 0) $message .= " $gagal peserta gagal ditambahkan.";
            
            Response::json(true, 201, $message);

        } catch (\Exception $e) {
            $db->rollBack();
            Response::json(false, 500, "Terjadi kesalahan server saat proses bulk insert: " . $e->getMessage());
        }
    }

    public function deleteAbsensiEntryBulk() {
        AdminAuthHelper::validate();
        $db = Database::getConnection();
        
        $inputJSON = file_get_contents('php://input');
        $input = json_decode($inputJSON, true);

        $kodeAkses = $input['kode_akses'] ?? null;
        $nips = $input['nips'] ?? [];

        if (empty($kodeAkses) || empty($nips) || !is_array($nips)) {
            Response::json(false, 400, "Data tidak lengkap: kode_akses dan daftar NIP wajib diisi.");
            return;
        }

        // Sanitize NIPs to be safe
        $sanitizedNips = array_filter($nips, function($nip) {
            return !empty($nip) && is_string($nip);
        });

        if (empty($sanitizedNips)) {
            Response::json(false, 400, "Daftar NIP yang valid tidak ditemukan.");
            return;
        }

        $placeholders = implode(',', array_fill(0, count($sanitizedNips), '?'));
        $sql = "DELETE FROM app_absensi_data_absensi WHERE kode_akses = ? AND nip IN ($placeholders)";
        
        $params = array_merge([$kodeAkses], $sanitizedNips);
        
        $stmt = $db->prepare($sql);
        $stmt->execute($params);

        $deletedCount = $stmt->rowCount();

        if ($deletedCount > 0) {
            Response::json(true, 200, "$deletedCount data absensi berhasil dihapus dari rekap.");
        } else {
            Response::json(false, 404, "Tidak ada data absensi yang cocok untuk dihapus.");
        }
    }
}