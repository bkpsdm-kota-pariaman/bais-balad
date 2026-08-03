<?php
// app_absensi/src/Helpers/Database.php

namespace App\Helpers;

use PDO;
use PDOException;
use App\Helpers\Response;

class Database {
    private static $connection = null;

    public static function getConnection(): PDO {
        if (self::$connection === null) {
            // Memanggil file config.php yang berada 2 level folder di atasnya
            $config = require __DIR__ . '/../../config/config.php';
            
            $dsn = "mysql:host=" . $config['db_host'] . ";dbname=" . $config['db_name'] . ";charset=utf8mb4";
            $options = [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION, 
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,       
                PDO::ATTR_EMULATE_PREPARES   => false,                  
            ];

            try {
                self::$connection = new PDO($dsn, $config['db_user'], $config['db_pass'], $options);
            } catch (PDOException $e) {
                // Catat error teknis ke dalam log server untuk debugging.
                // Pesan ini tidak akan ditampilkan ke pengguna.
                error_log("PDO Connection Error: " . $e->getMessage());

                // Tampilkan pesan yang aman dan umum ke pengguna.
                Response::json(false, 500, "Koneksi Database Gagal: Periksa konfigurasi di config.php", null);
            }
        }
        return self::$connection;
    }
}