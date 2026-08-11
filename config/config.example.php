<?php
// app_absensi/config/config.php

/**
 * =================================================================
 * PENGATURAN LINGKUNGAN APLIKASI
 * =================================================================
 * Ubah nilai di bawah ini untuk beralih antara konfigurasi.
 * Pilihan yang tersedia: 'production' atau 'beta'.
 */
$active_env = 'production';

$configurations = [
    // --- KONFIGURASI UNTUK SERVER PRODUKSI (LIVE) ---
    'production' => [
        'db_host' => 'localhost',
        'db_name' => 'db_bais',
        'db_user' => 'user_bais',
        'db_pass' => 'password_bais',
        'worker_url' => 'url_worker_production', // Ganti dengan URL worker produksi
        'jwt_secret' => 'jwt_secret_production', // Ganti dengan secret JWT produksi
        'worker_secret' => 'worker_secret_production', // Ganti dengan secret worker produksi
    ],

    // --- KONFIGURASI UNTUK SERVER BETA / PENGEMBANGAN ---
    'beta' => [
        'db_host' => 'localhost',
        'db_name' => 'db_bais',
        'db_user' => 'user_bais',
        'db_pass' => 'password_bais',
        'worker_url' => 'https://absensi-kegiatan-asn-worker-dev.bidpp-bkpsdm.workers.dev', // URL worker beta
        'jwt_secret' => 'jwt_secret_beta', // Ganti dengan secret JWT beta
        'worker_secret' => 'worker_secret_beta', // Ganti dengan secret worker beta
    ],
];

// Mengembalikan konfigurasi yang aktif berdasarkan variabel $active_env
return $configurations[$active_env];