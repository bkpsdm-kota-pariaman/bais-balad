<?php
// src/Scripts/bulk-sync-hashed-nik-to-kv.php

/**
 * Skrip CLI untuk sinkronisasi massal data pegawai ke Cloudflare Workers KV.
 * Mengirim nilai kolom `password` (hash NIK) ke properti `nik` di KV.
 * Kolom `password` sendiri tidak dimasukkan ke payload.
 *
 * CARA PENGGUNAAN:
 * Jalankan dari terminal: `php src/Scripts/bulk-sync-hashed-nik-to-kv.php`
 */

if (php_sapi_name() !== 'cli') {
    die("Skrip ini hanya dapat dijalankan dari command line (CLI).\n");
}

if (!defined('APP_PATH')) {
    define('APP_PATH', dirname(__DIR__, 2) . '/');
}

// --- PENGATURAN LOGGING ---
$logDir = APP_PATH . 'logs';
if (!is_dir($logDir)) {
    mkdir($logDir, 0775, true);
}
$logFile = $logDir . '/sync-hashed-pegawai-' . date('Y-m-d') . '.log';

function log_message($message, $is_error = false) {
    global $logFile;
    $timestamp = date('Y-m-d H:i:s');
    $logEntry = "[$timestamp] " . $message . "\n";
    
    file_put_contents($logFile, $logEntry, FILE_APPEND);
    
    if ($is_error) {
        fwrite(STDERR, $message . "\n");
    } else {
        echo $message . "\n";
    }
}
// --- AKHIR PENGATURAN LOGGING ---

// Bootstrap aplikasi
if (file_exists(APP_PATH . 'vendor/autoload.php')) {
    require_once APP_PATH . 'vendor/autoload.php';
}
require_once APP_PATH . 'config/config.php';
require_once APP_PATH . 'src/Helpers/Response.php';
require_once APP_PATH . 'src/Helpers/Database.php';

use App\Helpers\Database;
use PDO;

log_message("===== Memulai Proses Sinkronisasi Massal Hashed NIK ke Cloudflare KV =====");

try {
    $db = Database::getConnection();

    // 1. Ambil data pegawai yang belum sinkron (kv_sync_status = 0 atau NULL)
    log_message("1. Mengambil data pegawai yang belum sinkron dari database...");
    $sql = "SELECT p.nip, p.nik, p.password, p.nama_pegawai, p.perangkat_daerah, p.jabatan, p.jenis_asn, p.role 
            FROM app_absensi_data_pegawai p
            WHERE p.kv_sync_status = 0 OR p.kv_sync_status IS NULL
            ORDER BY p.last_login DESC
            LIMIT 950";
    $stmt = $db->query($sql);
    $allPegawai = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($allPegawai)) {
        log_message("Tidak ada data pegawai yang perlu disinkronkan. Selesai.");
        exit;
    }
    $totalPegawai = count($allPegawai);
    log_message("   Ditemukan " . $totalPegawai . " data pegawai untuk disinkronkan.");

    // 2. Konfigurasi Worker
    $config = require APP_PATH . 'config/config.php';
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
        echo "   $progress Mengirim data NIP: $nip... ";

        // Gunakan hash dari kolom password sebagai NIK di KV, fallback ke NIK asli jika kolom password kosong
        $nikValue = !empty($pegawai['password']) ? $pegawai['password'] : $pegawai['nik'];

        // Siapkan payload untuk satu pegawai
        $rolesStr = isset($pegawai['role']) ? trim($pegawai['role']) : '';
        $roles = $rolesStr !== '' ? array_map('trim', explode(',', $rolesStr)) : ['asn'];

        $payload = [
            'nip' => $pegawai['nip'],
            'nik' => $nikValue, // Hash NIK dimasukkan ke field 'nik'
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
            echo "OK (HTTP 200)\n";
            log_message("   -> SUKSES: NIP $nip berhasil disinkronkan ke KV.");
            $successCount++;
        } else {
            $failCount++;
            echo "GAGAL (HTTP $httpCode)\n";
            
            $errorMessage = "GAGAL mengirim data NIP: $nip. HTTP Code: $httpCode. Response: $responseBody. cURL Error: $curlError";
            log_message("   -> ERROR: " . $errorMessage, true);

            throw new \Exception(
                "Proses dihentikan karena terjadi kegagalan pada NIP $nip. Silakan periksa file log untuk detail."
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
