<?php
// src/Controllers/AdminJadwalController.php

namespace App\Controllers;

use App\Helpers\Response;
use App\Helpers\Database;
use App\Helpers\AdminAuthHelper;
use PDO;
use DateTime;
use DateTimeZone;
use Firebase\JWT\JWT;

class AdminJadwalController {

    public function getOpdList() {
        AdminAuthHelper::validate();
        $db = Database::getConnection();
        $stmt = $db->query("SELECT nama_opd FROM app_absensi_list_opd ORDER BY nama_opd ASC");
        $opdList = $stmt->fetchAll(PDO::FETCH_COLUMN, 0);
        Response::json(true, 200, "OK", $opdList);
    }

    public function listJadwal() {
        AdminAuthHelper::validate();
        $db = Database::getConnection(); 
        $page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
        $limit = isset($_GET['limit']) ? max(1, (int)$_GET['limit']) : 10;
        $offset = ($page - 1) * $limit;

        $countStmt = $db->query("SELECT COUNT(*) FROM app_absensi_jadwal_kegiatan");
        $totalRows = $countStmt->fetchColumn();

        $stmt = $db->prepare("SELECT *, kv_sync_status FROM app_absensi_jadwal_kegiatan ORDER BY tanggal DESC, jam_mulai DESC LIMIT :limit OFFSET :offset");
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $jadwal = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $payload = [
            'data' => $jadwal,
            'pagination' => [
                'total_rows' => (int)$totalRows,
                'total_pages' => ceil($totalRows / $limit),
                'current_page' => $page,
                'limit' => $limit
            ]
        ];

        Response::json(true, 200, "OK", $payload);
    }

    public function getJadwal($vars) {
        AdminAuthHelper::validate();
        $kodeAkses = $vars['kode_akses'] ?? null;
        $db = Database::getConnection();

        $stmtJadwal = $db->prepare("SELECT * FROM app_absensi_jadwal_kegiatan WHERE kode_akses = :kode_akses");
        $stmtJadwal->execute([':kode_akses' => $kodeAkses]); 
        $jadwal = $stmtJadwal->fetch(PDO::FETCH_ASSOC);

        if (!$jadwal) {
            Response::json(false, 404, "Jadwal tidak ditemukan.");
        }

        $stmtOpd = $db->prepare("SELECT opd FROM app_absensi_data_absensi WHERE kode_akses = :kode_akses AND opd IS NOT NULL AND opd != '' GROUP BY opd ORDER BY opd ASC");
        $stmtOpd->execute([':kode_akses' => $kodeAkses]);
        $jadwal['target_opd'] = $stmtOpd->fetchAll(PDO::FETCH_COLUMN, 0);

        Response::json(true, 200, "OK", $jadwal);
    }

    public function generateJadwalToken($vars) {
        AdminAuthHelper::validate();
        $kodeAkses = $vars['kode_akses'] ?? null;
        if (!$kodeAkses) {
            Response::json(false, 400, "Kode akses tidak disediakan.");
        }
    
        $db = Database::getConnection();
    
        // Get schedule details
        $stmtJadwal = $db->prepare("SELECT * FROM app_absensi_jadwal_kegiatan WHERE kode_akses = :kode_akses");
        $stmtJadwal->execute([':kode_akses' => $kodeAkses]);
        $jadwal = $stmtJadwal->fetch(PDO::FETCH_ASSOC);
    
        if (!$jadwal) {
            Response::json(false, 404, "Jadwal tidak ditemukan.");
        }
    
        // Create JWT
        $config = require APP_PATH . '/config/config.php';
        $secretKey = $config['jwt_secret'];
        $issuedAt = time();
        
        // Set expiration to the end of the event day
        $eventDate = new DateTime($jadwal['tanggal'] . ' 23:59:59', new DateTimeZone('Asia/Jakarta'));
        $expirationTime = $eventDate->getTimestamp();
        
        $payload = [
            'iat' => $issuedAt, 'exp' => $expirationTime,
            'iss' => 'bais-pariaman-apps-jadwal',
            'data' => $jadwal
        ];
        $jwtToken = JWT::encode($payload, $secretKey, 'HS256');
        Response::json(true, 200, "Token jadwal berhasil dibuat", ['token' => $jwtToken]);
    }

    public function createJadwal() {
        AdminAuthHelper::validate();
        $input = json_decode(file_get_contents('php://input'), true);
        $db = Database::getConnection();

        $targetOpd = $input['target_opd'] ?? [];
        
        // Generate kode akses unik
        $kodeAkses = strtoupper(substr(bin2hex(random_bytes(4)), 0, 6));

        // --- LOGIKA BARU: Lakukan sinkronisasi SEBELUM menulis ke DB ---
        $payloadForKv = [
            'kode_akses' => $kodeAkses,
            'judul' => $input['judul'],
            'kategori' => $input['kategori'],
            'tanggal' => $input['tanggal'],
            'jam_mulai' => $input['jam_mulai'],
            'jam_selesai' => $input['jam_selesai'],
            'koordinat' => $input['koordinat'],
            'radius_meter' => $input['radius_meter'],
            'aktifkan_antrian' => $input['aktifkan_antrian'],
            'is_strict_time' => $input['is_strict_time'] ?? 0,
            'is_strict_location' => $input['is_strict_location'] ?? 0,
            'target_opd' => $input['target_opd'] ?? []
        ];
        $syncSuccess = $this->syncJadwalToKv('POST', $payloadForKv, null, true); // Blocking call
        $kv_sync_status = $syncSuccess ? 1 : 0;

        try {
            $db->beginTransaction();

            $sqlJadwal = "INSERT INTO app_absensi_jadwal_kegiatan (kode_akses, judul, kategori, tanggal, jam_mulai, jam_selesai, koordinat, radius_meter, aktifkan_antrian, kv_sync_status, is_strict_time, is_strict_location) VALUES (:ka, :jd, :kat, :tgl, :jm, :js, :koord, :rad, :aa, :kv_sync_status, :ist, :isl)";
            $stmtJadwal = $db->prepare($sqlJadwal);
            $stmtJadwal->execute([
                ':ka' => $kodeAkses,
                ':jd' => $input['judul'],
                ':kat' => $input['kategori'],
                ':tgl' => $input['tanggal'],
                ':jm' => $input['jam_mulai'],
                ':js' => $input['jam_selesai'],
                ':koord' => $input['koordinat'],
                ':rad' => $input['radius_meter'],
                ':aa' => isset($input['aktifkan_antrian']) ? (int)$input['aktifkan_antrian'] : 0,
                ':kv_sync_status' => $kv_sync_status,
                ':ist' => $input['is_strict_time'] ?? 0,
                ':isl' => $input['is_strict_location'] ?? 0
            ]);

            // --- LOGIKA BARU: Pre-seed data absensi dengan status ALPA ---
            $pegawaiToSeed = [];
            if (!empty($targetOpd)) { // Hanya pre-seed jika ada target OPD yang dipilih
                $placeholders = implode(',', array_fill(0, count($targetOpd), '?'));
                $stmtPegawai = $db->prepare("SELECT nip, nama_pegawai, perangkat_daerah, jabatan FROM app_absensi_data_pegawai WHERE perangkat_daerah IN ($placeholders)");
                $stmtPegawai->execute($targetOpd);
                $pegawaiToSeed = $stmtPegawai->fetchAll(PDO::FETCH_ASSOC);
            }

            if (!empty($pegawaiToSeed)) {
                $sqlSeed = "INSERT INTO app_absensi_data_absensi (kode_akses, nip, nama_pegawai, opd, jabatan, kategori, status_verifikasi, status_kehadiran) VALUES ";
                $sqlParams = [];
                $rows = [];
                foreach ($pegawaiToSeed as $p) {
                    $rows[] = "(?, ?, ?, ?, ?, ?, 'ALPA', 'Alpa')";
                    array_push($sqlParams, $kodeAkses, $p['nip'], $p['nama_pegawai'], $p['perangkat_daerah'], $p['jabatan'], $input['kategori']);
                }
                $sqlSeed .= implode(', ', $rows);
                $stmtSeed = $db->prepare($sqlSeed);
                $stmtSeed->execute($sqlParams);
            }
            // --- AKHIR LOGIKA BARU ---

            $db->commit();

            $message = "Jadwal berhasil dibuat.";
            if (!$syncSuccess) { $message .= " Gagal sinkronisasi ke cache."; }
            Response::json(true, 201, $message, ['kode_akses' => $kodeAkses]);

        } catch (\Exception $e) {
            $db->rollBack();
            Response::json(false, 500, "Gagal membuat jadwal: " . $e->getMessage());
        }
    }

    public function updateJadwal($vars) {
        AdminAuthHelper::validate();
        $kodeAkses = $vars['kode_akses'] ?? null;
        $input = json_decode(file_get_contents('php://input'), true);
        $db = Database::getConnection();

        $targetOpd = $input['target_opd'] ?? [];

        $payloadForKv = [
            'kode_akses' => $kodeAkses,
            'judul' => $input['judul'],
            'kategori' => $input['kategori'],
            'tanggal' => $input['tanggal'],
            'jam_mulai' => $input['jam_mulai'],
            'jam_selesai' => $input['jam_selesai'],
            'koordinat' => $input['koordinat'],
            'radius_meter' => $input['radius_meter'],
            'aktifkan_antrian' => $input['aktifkan_antrian'],
            'is_strict_time' => $input['is_strict_time'] ?? 0,
            'is_strict_location' => $input['is_strict_location'] ?? 0,
            'target_opd' => $input['target_opd'] ?? []
        ];
        $syncSuccess = $this->syncJadwalToKv('PUT', $payloadForKv, $kodeAkses, true); // Blocking call
        $kv_sync_status = $syncSuccess ? 1 : 0;

        try {
            $db->beginTransaction();

            // 1. Update tabel jadwal utama
            $sqlJadwal = "UPDATE app_absensi_jadwal_kegiatan SET judul=:jd, kategori=:kat, tanggal=:tgl, jam_mulai=:jm, jam_selesai=:js, koordinat=:koord, radius_meter=:rad, aktifkan_antrian=:aa, is_strict_time=:ist, is_strict_location=:isl, kv_sync_status = :kv_sync_status WHERE kode_akses = :ka";
            $stmtJadwal = $db->prepare($sqlJadwal);
            $stmtJadwal->execute([
                ':jd' => $input['judul'],
                ':kat' => $input['kategori'],
                ':tgl' => $input['tanggal'],
                ':jm' => $input['jam_mulai'],
                ':js' => $input['jam_selesai'],
                ':koord' => $input['koordinat'],
                ':rad' => $input['radius_meter'],
                ':aa' => isset($input['aktifkan_antrian']) ? (int)$input['aktifkan_antrian'] : 0,
                ':ist' => $input['is_strict_time'] ?? 0,
                ':isl' => $input['is_strict_location'] ?? 0,
                ':kv_sync_status' => $kv_sync_status,
                ':ka' => $kodeAkses
            ]);

            // 2. Hapus pre-seed data (waktu IS NULL) untuk OPD yang dihapus dari daftar target
            $selectedOpds = $input['target_opd'] ?? [];
            if (empty($selectedOpds)) {
                $stmtDel = $db->prepare("DELETE FROM app_absensi_data_absensi WHERE kode_akses = :ka AND waktu IS NULL");
                $stmtDel->execute([':ka' => $kodeAkses]);
            } else {
                $placeholders = implode(',', array_fill(0, count($selectedOpds), '?'));
                $sqlDel = "DELETE FROM app_absensi_data_absensi WHERE kode_akses = ? AND waktu IS NULL AND opd NOT IN ($placeholders)";
                $params = array_merge([$kodeAkses], $selectedOpds);
                $stmtDel = $db->prepare($sqlDel);
                $stmtDel->execute($params);
            }

            // a. Dapatkan daftar NIP yang sudah ada di rekap untuk jadwal ini.
            $stmtExistingNips = $db->prepare("SELECT nip FROM app_absensi_data_absensi WHERE kode_akses = :ka");
            $stmtExistingNips->execute([':ka' => $kodeAkses]);
            $existingNips = $stmtExistingNips->fetchAll(PDO::FETCH_COLUMN, 0);
            $existingNipsSet = array_flip($existingNips); // Gunakan array_flip untuk pencarian yang lebih cepat.

            // b. Dapatkan daftar pegawai dari target OPD yang baru dipilih.
            $pegawaiToSeed = [];
            if (!empty($input['target_opd'])) {
                $placeholdersSnap = implode(',', array_fill(0, count($input['target_opd']), '?'));
                $stmtPegawai = $db->prepare("SELECT nip, nama_pegawai, perangkat_daerah, jabatan FROM app_absensi_data_pegawai WHERE perangkat_daerah IN ($placeholdersSnap)");
                $stmtPegawai->execute($input['target_opd']);
                $pegawaiToSeed = $stmtPegawai->fetchAll(PDO::FETCH_ASSOC);
            }

            // c. Filter untuk mendapatkan hanya pegawai yang belum ada di rekap.
            $newPegawaiToSeed = [];
            foreach ($pegawaiToSeed as $p) {
                if (!isset($existingNipsSet[$p['nip']])) {
                    $newPegawaiToSeed[] = $p;
                }
            }

            // d. Jika ada pegawai baru, pre-seed mereka ke dalam tabel absensi.
            if (!empty($newPegawaiToSeed)) {
                $sqlSeed = "INSERT INTO app_absensi_data_absensi (kode_akses, nip, nama_pegawai, opd, jabatan, kategori, status_verifikasi, status_kehadiran) VALUES ";
                $sqlParams = [];
                $rows = [];
                foreach ($newPegawaiToSeed as $p) {
                    $rows[] = "(?, ?, ?, ?, ?, ?, 'ALPA', 'Alpa')";
                    array_push($sqlParams, $kodeAkses, $p['nip'], $p['nama_pegawai'], $p['perangkat_daerah'], $p['jabatan'], $input['kategori']);
                }
                $sqlSeed .= implode(', ', $rows);
                $stmtSeed = $db->prepare($sqlSeed);
                $stmtSeed->execute($sqlParams);
            }

            $db->commit();

            $message = "Jadwal berhasil diperbarui.";
            if (!$syncSuccess) { $message .= " Gagal sinkronisasi ulang ke cache."; }
            Response::json(true, 200, $message);

        } catch (\Exception $e) {
            $db->rollBack();
            Response::json(false, 500, "Gagal memperbarui jadwal: " . $e->getMessage());
        }
    }

    public function deleteJadwal($vars) {
        AdminAuthHelper::validate();
        $kodeAkses = $vars['kode_akses'] ?? null;

        $db = Database::getConnection();
        try {
            $db->beginTransaction();

            // Hapus daftar target OPD (Tabel app_absensi_kegiatan_target_opd tidak lagi digunakan)

            // Hapus dari tabel jadwal utama
            $stmtJadwal = $db->prepare("DELETE FROM app_absensi_jadwal_kegiatan WHERE kode_akses = :ka");
            $stmtJadwal->execute([':ka' => $kodeAkses]);

            // Hapus juga data absensi terkait? (Opsional, untuk sekarang tidak)
            $stmtAbsen = $db->prepare("DELETE FROM app_absensi_data_absensi WHERE kode_akses = :ka");
            $stmtAbsen->execute([':ka' => $kodeAkses]);

            $db->commit();

            // Lakukan sinkronisasi blocking untuk memastikan cache dihapus.
            $syncSuccess = $this->syncJadwalToKv('DELETE', null, $kodeAkses, true);

            $message = "Jadwal berhasil dihapus dari database.";
            if (!$syncSuccess) { $message .= " Namun, gagal menghapus dari cache."; }
            Response::json(true, 200, $message);

        } catch (\Exception $e) {
            $db->rollBack();
            Response::json(false, 500, "Gagal menghapus jadwal: " . $e->getMessage());
        }
    }

    public function syncKvCache($vars) {
        AdminAuthHelper::validate();
        $db = Database::getConnection();
        $kodeAkses = $vars['kode_akses'] ?? null;

        if (!$kodeAkses) {
            Response::json(false, 400, "Kode akses wajib diisi.");
            return;
        }

        // 1. Ambil data jadwal terbaru dari DB untuk memastikan data di KV adalah yang paling mutakhir.
        $stmtJadwal = $db->prepare("SELECT kode_akses, judul, kategori, tanggal, jam_mulai, jam_selesai, koordinat, radius_meter, aktifkan_antrian, is_strict_time, is_strict_location FROM app_absensi_jadwal_kegiatan WHERE kode_akses = :kode_akses");
        $stmtJadwal->bindParam(':kode_akses', $kodeAkses);
        $stmtJadwal->execute();
        $jadwal = $stmtJadwal->fetch(PDO::FETCH_ASSOC);

        if (!$jadwal) {
            Response::json(false, 404, "Jadwal dengan kode akses $kodeAkses tidak ditemukan di database.");
            return;
        }

        // Ambil target OPD
        $stmtOpd = $db->prepare("SELECT opd FROM app_absensi_data_absensi WHERE kode_akses = :kode_akses AND opd IS NOT NULL AND opd != '' GROUP BY opd ORDER BY opd ASC");
        $stmtOpd->execute([':kode_akses' => $kodeAkses]);
        $jadwal['target_opd'] = $stmtOpd->fetchAll(PDO::FETCH_COLUMN, 0);

        // 2. Siapkan payload untuk dikirim ke worker.
        $payloadForKv = $jadwal;

        // 3. Trigger a BLOCKING sync process and wait for the result.
        $syncSuccess = $this->syncJadwalToKv('PUT', $payloadForKv, $kodeAkses, true);

        if ($syncSuccess) {
            try {
                $stmt = $db->prepare("UPDATE app_absensi_jadwal_kegiatan SET kv_sync_status = 1 WHERE kode_akses = :kode_akses");
                $stmt->execute([':kode_akses' => $kodeAkses]);
                Response::json(true, 200, "Cache berhasil disinkronkan dengan Cloudflare KV.");
            } catch (\Exception $e) {
                // This is an edge case where the sync worked but the DB update failed.
                Response::json(false, 500, "Sinkronisasi berhasil, tetapi gagal mengupdate status di database: " . $e->getMessage());
            }
        } else {
            Response::json(false, 503, "Gagal menyinkronkan cache. Cloudflare KV mungkin sedang sibuk atau tidak dapat dijangkau. Coba lagi nanti.");
        }
    }

    /**
     * Menjalankan permintaan ke Cloudflare Worker untuk menyinkronkan data jadwal.
     * Berjalan dalam mode "fire-and-forget".
     *
     * @param string $method Metode HTTP (POST, PUT, DELETE).
     * @param array|null $payload Data yang akan dikirim (untuk POST/PUT).
     * @param string|null $kodeAkses Kode akses untuk URL (untuk PUT/DELETE).
     */
    private function syncJadwalToKv($method, $payload = null, $kodeAkses = null, $waitForResponse = false) {
        $config = require APP_PATH . '/config/config.php';
        $workerUrl = $config['worker_url'] ?? null;
        $workerSecret = $config['worker_secret'] ?? null;

        if (!$workerUrl || !$workerSecret) {
            error_log("[Jadwal KV Sync] Gagal: Konfigurasi Worker URL/secret tidak ada.");
            return;
        } 

        $url = rtrim($workerUrl, '/') . '/api/jadwal';
        if (($method === 'PUT' || $method === 'DELETE') && $kodeAkses) {
            $url .= '/' . $kodeAkses;
        }

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'X-Worker-Secret: ' . $workerSecret
        ]);

        if ($waitForResponse) {
            curl_setopt($ch, CURLOPT_TIMEOUT, 5); // Tunggu hingga 5 detik
        } else {
            // Mode fire-and-forget: timeout sangat singkat.
            curl_setopt($ch, CURLOPT_TIMEOUT_MS, 500);
        }

        if ($payload !== null && ($method === 'POST' || $method === 'PUT')) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        }

        $responseBody = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErrorNo = curl_errno($ch);
        $curlErrorMsg = curl_error($ch);
        curl_close($ch);

        if ($waitForResponse) {
            if ($curlErrorNo === 0 && $httpCode >= 200 && $httpCode < 300) {
                return true; // Sukses
            }
            error_log("[Blocking Jadwal KV Sync] Gagal untuk kode akses $kodeAkses. HTTP Code: $httpCode, cURL Error: $curlErrorMsg");
            return false; // Gagal
        } elseif ($curlErrorNo !== 0 && $curlErrorNo !== CURLE_OPERATION_TIMEDOUT) {
            error_log("[Fire-and-forget Jadwal KV Sync] cURL error untuk kode akses $kodeAkses: " . $curlErrorMsg);
        }
    }
}