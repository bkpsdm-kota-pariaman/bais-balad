<?php
// src/Helpers/LogHelper.php

namespace App\Helpers;

use DateTime;
use DateTimeZone;

class LogHelper {

    /**
     * Menulis pesan log ke file kustom di dalam direktori proyek.
     *
     * @param string $level Level log (e.g., 'ERROR', 'INFO', 'DEBUG').
     * @param string $message Pesan log utama.
     * @param array $context Data tambahan untuk disertakan dalam log (akan di-encode ke JSON).
     */
    public static function write($level, $message, $context = []) {
        try {
            // Tentukan path ke direktori log, satu level di atas 'src'
            $logDir = APP_PATH . '/../logs';
            $logFile = $logDir . '/app.log';

            // Buat direktori jika belum ada
            if (!is_dir($logDir)) {
                mkdir($logDir, 0775, true);
                // Tambahkan file .htaccess untuk keamanan
                file_put_contents($logDir . '/.htaccess', "Deny from all\n");
            }

            $now = new DateTime('now', new DateTimeZone('Asia/Jakarta'));
            $timestamp = $now->format('Y-m-d H:i:s');
            $level = strtoupper($level);

            $logEntry = "[$timestamp] [$level] $message";
            if (!empty($context)) {
                $logEntry .= " | Data: " . json_encode($context, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
            }
            $logEntry .= PHP_EOL; // Tambahkan baris baru

            // Tulis ke file dengan mode append
            file_put_contents($logFile, $logEntry, FILE_APPEND);

        } catch (\Exception $e) {
            // Fallback ke error_log() jika penulisan file kustom gagal
            error_log("FATAL: Gagal menulis ke file log kustom: " . $e->getMessage());
            error_log("Original Log Message: [$level] $message");
        }
    }
}