<?php
// src/Helpers/LogAbsensi.php

namespace App\Helpers;

use Exception;

class LogAbsensi {
    public static function log($pdo, $kodeAkses, $nip, $nama, $jenisAksi, $nipPelaku, $namaPelaku, $ipAddress, $userAgentOrData, $dataArray = null)
    {
        if (!in_array($jenisAksi, ['tambah','edit','hapus'])) return false;
        
        // Backward compatibility jika parameter ke-9 adalah $dataArray
        if (is_array($userAgentOrData)) {
            $data = $userAgentOrData;
            $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? null;
        } else {
            $userAgent = $userAgentOrData ?: ($_SERVER['HTTP_USER_AGENT'] ?? null);
            $data = $dataArray;
        }

        if ($userAgent && strlen($userAgent) > 255) {
            $userAgent = substr($userAgent, 0, 255);
        }

        try {
            $stmt = $pdo->prepare("INSERT INTO app_absensi_log_absensi 
                (kode_akses, nip, nama, jenis_aksi, nip_pelaku, nama_pelaku, ip_address, user_agent, data) 
             VALUES (?,?,?,?,?,?,?,?,?)");
            return $stmt->execute([
                $kodeAkses,
                $nip,
                $nama ?? '-',
                $jenisAksi,
                $nipPelaku,
                $namaPelaku,
                $ipAddress,
                $userAgent,
                json_encode($data, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)
            ]);
        } catch(Exception $e) {
            // optional: log to file if needed
            return false;
        }
    }
}
