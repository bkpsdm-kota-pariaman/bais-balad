<?php
// scripts/bulk-sync-to-kv.php

/**
 * Skrip CLI untuk sinkronisasi massal data pegawai dari database ke Cloudflare Workers KV.
 *
 * CARA PENGGUNAAN:
 * 1. Pastikan Anda berada di direktori root proyek (`v3/app_php/`).
 * 2. Jalankan skrip dari terminal dengan perintah: `php src/Scripts/bulk-sync-to-kv.php`
 *
 * Skrip ini akan:
 * - Mengambil data pegawai dari `app_absensi_data_pegawai` yang statusnya `kv_sync_status = 0` (atau NULL).
 * - Mengambil maksimal 950 data per eksekusi untuk menghindari limitasi rate dari Cloudflare.
 * - Mengirim data satu per satu ke endpoint `PUT /api/pegawai/:nip` di Worker.
 * - Memperbarui `kv_sync_status` menjadi 1 di database untuk setiap pegawai yang berhasil disinkronkan.
 * - Berhenti jika terjadi error saat mengirim ke Worker, sehingga bisa dilanjutkan lagi nanti.
 */

if (php_sapi_name() !== 'cli') {
    die("Skrip ini hanya dapat dijalankan dari command line (CLI).\n");
}


// Definisikan path root aplikasi dengan benar.
// __DIR__ adalah .../src/Scripts
// dirname(__DIR__) adalah .../src
// dirname(dirname(__DIR__)) adalah .../ (root aplikasi)
define('APP_PATH', '/home/apiesdmpariamank/bais_balad/');

// --- PENGATURAN LOGGING ---
$logDir = APP_PATH . '/logs';
if (!is_dir($logDir)) {
    mkdir($logDir, 0775, true);
}
$logFile = $logDir . '/sync-pegawai-' . date('Y-m-d') . '.log';

function log_message($message, $is_error = false) {
    global $logFile;
    $timestamp = date('Y-m-d H:i:s');
    $logEntry = "[$timestamp] " . $message . "\n";
    
    // Tulis ke file log
    file_put_contents($logFile, $logEntry, FILE_APPEND);
    
    // Tampilkan ke konsol
    if ($is_error) {
        fwrite(STDERR, $message . "\n");
    } else {
        echo $message . "\n";
    }
}
// --- AKHIR PENGATURAN LOGGING ---

// Bootstrap aplikasi
require APP_PATH . '/vendor/autoload.php';

use App\Helpers\Database;
use PDO;

log_message("===== Memulai Proses Sinkronisasi Massal ke Cloudflare KV =====");

try {
    $db = Database::getConnection();

    // 1. Ambil data pegawai yang belum sinkron (kv_sync_status = 0 atau NULL)
    log_message("1. Mengambil data pegawai yang belum sinkron dari database...");
    $sql = "SELECT p.nip, p.nik, p.nama_pegawai, p.perangkat_daerah, p.jabatan, p.jenis_asn, a.username AS admin_username 
            FROM app_absensi_data_pegawai p
            LEFT JOIN app_absensi_data_admin a ON p.nip = a.username
            WHERE p.kv_sync_status = 0 OR p.kv_sync_status IS NULL
            ORDER BY p.last_login DESC
            LIMIT 800"; // Batasi 800 untuk sekali jalan, di bawah batas 1000 write/day
    $stmt = $db->query($sql);
    $allPegawai = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($allPegawai)) {
        log_message("Tidak ada data pegawai baru untuk disinkronkan. Selesai.");
        exit;
    }
    $totalPegawai = count($allPegawai);
    log_message("   Ditemukan " . $totalPegawai . " data pegawai untuk disinkronkan.");

    // 2. Konfigurasi Worker
    $config = require APP_PATH . '/config/config.php';
    $workerUrl = $config['worker_url'] ?? null;
    $workerSecret = $config['worker_secret'] ?? null;

    if (!$workerUrl || !$workerSecret) {
        throw new \Exception("Konfigurasi Worker URL/secret tidak ditemukan di config.php.");
    }

    $baseUrl = rtrim($workerUrl, '/');
    $successCount = 0;
    $failCount = 0;

    // 3. Loop dan kirim data satu per satu
    log_message("3. Memulai proses sinkronisasi per baris...");
    foreach ($allPegawai as $index => $pegawai) {
        $nip = $pegawai['nip'];
        $progress = "[" . ($index + 1) . "/" . $totalPegawai . "]";
        echo "   $progress Mengirim data NIP: $nip... "; // Tampilkan di konsol tanpa newline

        // Siapkan payload untuk satu pegawai
        $roles = ['asn'];
        if (!empty($pegawai['admin_username'])) {
            $roles[] = 'admin';
        }
        $payload = [
            'nip' => $pegawai['nip'],
            'nik' => $pegawai['nik'],
            'nama_pegawai' => $pegawai['nama_pegawai'],
            'perangkat_daerah' => $pegawai['perangkat_daerah'],
            'jabatan' => $pegawai['jabatan'],
            'jenis_asn' => $pegawai['jenis_asn'],
            'role' => $roles
        ];

        // Kirim request PUT ke worker
        $ch = curl_init($baseUrl . '/api/pegawai/' . $nip);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, "PUT");
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'X-Worker-Secret: ' . $workerSecret
        ]);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);

        $responseBody = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        // 4. Perbarui status di database jika berhasil
        if ($httpCode === 200) {
            $updateStmt = $db->prepare("UPDATE app_absensi_data_pegawai SET kv_sync_status = 1 WHERE nip = ?");
            $updateStmt->execute([$nip]);
            echo "OK (HTTP 200)\n"; // Lanjutkan baris di konsol
            log_message("   -> SUKSES: NIP $nip berhasil disinkronkan.");
            $successCount++;
        } else {
            $failCount++;
            echo "GAGAL (HTTP $httpCode)\n"; // Lanjutkan baris di konsol
            
            $errorMessage = "GAGAL mengirim data NIP: $nip. HTTP Code: $httpCode. Response: $responseBody. cURL Error: $curlError";
            log_message("   -> ERROR: " . $errorMessage, true);

            // Hentikan proses jika ada error dari worker (misal: rate limit)
            throw new \Exception(
                "Proses dihentikan karena terjadi kegagalan. Silakan periksa file log untuk detail."
            );
        }
    }

    log_message("\n----------------------------------------");
    log_message("Proses sinkronisasi selesai.");
    log_message("Berhasil: $successCount");
    log_message("Gagal: $failCount");
    log_message("----------------------------------------");

} catch (\Exception $e) {
    log_message("\n!!! ERROR FATAL: Terjadi kesalahan saat proses sinkronisasi. !!!", true);
    log_message("Pesan: " . $e->getMessage(), true);
    exit(1);
}