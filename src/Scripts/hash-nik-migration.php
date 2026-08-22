<?php
// src/Scripts/hash-nik-migration.php
// Script migrasi untuk menghash NIK plaintext ke kolom password sementara

if (php_sapi_name() !== 'cli') {
    die("Skrip ini hanya dapat dijalankan dari command line (CLI).\n");
}

if (!defined('APP_PATH')) {
    define('APP_PATH', dirname(__DIR__, 2) . '/');
}
require_once APP_PATH . 'config/config.php';
require_once APP_PATH . 'src/Helpers/Response.php';
require_once APP_PATH . 'src/Helpers/Database.php';

use App\Helpers\Database;

try {
    $db = Database::getConnection();

    // 1. Buat kolom 'password' jika belum ada
    $checkCol = $db->query("SHOW COLUMNS FROM app_absensi_data_pegawai LIKE 'password'");
    if (!$checkCol->fetch()) {
        $db->exec("ALTER TABLE app_absensi_data_pegawai ADD COLUMN `password` VARCHAR(255) DEFAULT NULL AFTER `nik`");
        echo "Kolom 'password' berhasil dibuat di tabel app_absensi_data_pegawai.\n";
    }

    // 2. Ambil semua pegawai beserta NIK dan password saat ini
    $stmt = $db->query("SELECT nip, nik, password FROM app_absensi_data_pegawai");
    $pegawais = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $countUpdated = 0;
    $countSkipped = 0;

    $updateStmt = $db->prepare("UPDATE app_absensi_data_pegawai SET password = :password WHERE nip = :nip");

    foreach ($pegawais as $p) {
        $nik = trim($p['nik'] ?? '');
        $currentPass = trim($p['password'] ?? '');

        // Jika NIK kosong, lewati
        if ($nik === '') {
            $countSkipped++;
            continue;
        }

        // Cek apakah kolom password sudah berisi hash bcrypt yang valid untuk NIK ini
        if (!empty($currentPass) && strlen($currentPass) === 60 && password_verify($nik, $currentPass)) {
            $countSkipped++;
            continue;
        }

        // Generate bcrypt hash dari NIK
        $hashed = password_hash($nik, PASSWORD_DEFAULT);

        $updateStmt->execute([
            ':password' => $hashed,
            ':nip' => $p['nip']
        ]);
        $countUpdated++;
    }

    echo "Selesai: $countUpdated password pegawai berhasil di-hash dan disimpan ke kolom 'password'.\n";
    echo "Dilewati: $countSkipped data pegawai (sudah ter-hash atau NIK kosong).\n";
    echo "PENTING: Kolom 'nik' asli tetap dipertahankan agar kompatibel dengan aplikasi versi lama.\n";
} catch (\Exception $e) {
    echo "Terjadi kesalahan: " . $e->getMessage() . "\n";
}
