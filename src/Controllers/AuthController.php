<?php
// app_absensi/src/Controllers/AuthController.php

namespace App\Controllers;

use App\Helpers\Response;
use App\Helpers\Database;
use App\Helpers\AuthHelper;
use Firebase\JWT\JWT;
use PDO;

class AuthController {
    
    public function loginAsn() {
        // 1. Tangkap Payload JSON dari PWA
        $inputJSON = file_get_contents('php://input');
        $input = json_decode($inputJSON, true);

        // Validasi input kosong
        if (!isset($input['nip']) || !isset($input['nik'])) {
            Response::json(false, 400, "NIP dan NIK wajib diisi", null);
        }

        $nip = trim($input['nip']);
        $nik = trim($input['nik']);

        // 2. Hubungkan ke Database dan Cari Pegawai
        $db = Database::getConnection();
        
        $sql = "SELECT 
                    p.nama_pegawai, p.nip, p.nik, p.perangkat_daerah, p.jabatan, p.jenis_asn, p.role
                FROM 
                    app_absensi_data_pegawai p
                WHERE p.nip = :nip LIMIT 1";
        $stmt = $db->prepare($sql);
        $stmt->bindParam(':nip', $nip);
        $stmt->execute();
        
        $pegawai = $stmt->fetch();

        // 3. Jika data tidak ditemukan atau password tidak cocok
        $isPasswordMatch = false;
        if ($pegawai) {
            if (password_verify($nik, $pegawai['nik']) || $pegawai['nik'] === $nik) {
                $isPasswordMatch = true;
            }
        }

        if (!$pegawai || !$isPasswordMatch) {
            Response::json(false, 401, "NIP tidak ditemukan atau Password salah", null);
        }

        // Jika login berhasil, perbarui waktu login terakhir
        try {
            $now = new \DateTime('now', new \DateTimeZone('Asia/Jakarta'));
            $waktuSekarang = $now->format('Y-m-d H:i:s');
            
            $updateStmt = $db->prepare("UPDATE app_absensi_data_pegawai SET last_login = :last_login WHERE nip = :nip");
            $updateStmt->execute([
                ':last_login' => $waktuSekarang,
                ':nip' => $pegawai['nip']
            ]);
        } catch (\Exception $e) {
            // Gagal update last_login, biarkan proses login tetap berjalan.
            // Catat error ke log server untuk debugging di kemudian hari.
            error_log("Gagal update last_login untuk NIP " . ($pegawai['nip'] ?? 'N/A') . ": " . $e->getMessage());
        }

        // 4. Jika Valid, Terbitkan Token JWT
        $config = require APP_PATH . '/config/config.php';
        $secretKey = $config['jwt_secret'];
        
        $issuedAt = time();
        // Token berlaku selama 1 bulan (3600 detik * 24 jam * 30 hari)
        $expirationTime = $issuedAt + (3600 * 24 * 30); 
        
        // Tentukan role berdasarkan kolom comma-separated
        $rolesStr = isset($pegawai['role']) ? trim($pegawai['role']) : '';
        $roles = $rolesStr !== '' ? array_map('trim', explode(',', $rolesStr)) : ['asn'];

        // Payload tanpa ID UUID, murni menggunakan data flat hasil import
        $payload = [
            'iat' => $issuedAt,
            'exp' => $expirationTime,
            'iss' => 'bais-pariaman-apps',
            'data' => [
                'nip' => $pegawai['nip'],
                'nama' => $pegawai['nama_pegawai'],
                'opd' => $pegawai['perangkat_daerah'],
                'jabatan' => $pegawai['jabatan'],
                'role' => $roles,
                'jenis_asn' => $pegawai['jenis_asn']
            ]
        ];

        // Generate Token menggunakan Firebase JWT v5.5 (Kompatibel PHP 7.2)
        $jwtToken = JWT::encode($payload, $secretKey, 'HS256');

        // 5. Kembalikan Response Sukses ke PWA dengan format kaku
        $responseData = [
            'token' => $jwtToken,
            'user' => [
                'nama' => $pegawai['nama_pegawai'],
                'jabatan' => $pegawai['jabatan'],
                'opd' => $pegawai['perangkat_daerah']
            ],
            // Data ini akan ditangkap oleh Worker dan disimpan di KV
            'pegawai_to_cache' => [
                'nip' => $pegawai['nip'],
                'nik' => $pegawai['nik'], // NIK sangat penting untuk validasi di cache
                'nama_pegawai' => $pegawai['nama_pegawai'],
                'perangkat_daerah' => $pegawai['perangkat_daerah'],
                'jabatan' => $pegawai['jabatan'], // Jabatan diperlukan untuk cache
                'role' => $roles,
                'jenis_asn' => $pegawai['jenis_asn']
            ]
        ];

        Response::json(true, 200, "Login Berhasil", $responseData);
    }

    public function generateTemporaryToken() {
        // 1. Validasi token pengguna saat ini untuk mendapatkan datanya
        $pegawaiData = AuthHelper::validateToken();

        // 2. Buat JWT baru dengan masa berlaku singkat
        $config = require APP_PATH . '/config/config.php';
        $secretKey = $config['jwt_secret'];
        $issuedAt = time();
        $expirationTime = $issuedAt + 180; // Berlaku 3 menit (180 detik)

        $payload = [
            'exp' => $expirationTime,
            // Format Objek Lengkap, sama seperti token login
            'data' => [
                'nip' => $pegawaiData['nip'],
                'nama' => $pegawaiData['nama'],
                'opd' => $pegawaiData['opd'],
                'jabatan' => $pegawaiData['jabatan'],
                'role' => $pegawaiData['role'] ?? ['asn'], // Sertakan role, dengan fallback
                'jenis_asn' => $pegawaiData['jenis_asn'] ?? null
            ]
        ];

        $jwtToken = JWT::encode($payload, $secretKey, 'HS256');

        Response::json(true, 200, "Token sementara berhasil dibuat", ['token' => "BB:" . $jwtToken]);
    }

    /**
     * Endpoint internal yang dipanggil oleh Worker untuk mengupdate 'last_login'.
     * Endpoint ini harus dilindungi dengan secret.
     */
    public function updateLastLogin() {
        // 1. Validasi request dari Worker menggunakan shared secret
        $config = require APP_PATH . '/config/config.php';
        $workerSecret = $config['worker_secret'] ?? null;
        $requestSecret = $_SERVER['HTTP_X_WORKER_SECRET'] ?? null;

        if (!$workerSecret || !$requestSecret || $requestSecret !== $workerSecret) {
            Response::json(false, 403, "Akses ditolak. Invalid secret.");
            return;
        }

        // 2. Ambil NIP dari body request
        $inputJSON = file_get_contents('php://input');
        $input = json_decode($inputJSON, true);
        $nip = $input['nip'] ?? null;

        if (!$nip) {
            Response::json(false, 400, "NIP wajib diisi.");
            return;
        }

        // 3. Update 'last_login' di database
        try {
            $db = Database::getConnection();
            $now = new \DateTime('now', new \DateTimeZone('Asia/Jakarta'));
            $updateStmt = $db->prepare("UPDATE app_absensi_data_pegawai SET last_login = :last_login, kv_sync_status = 1 WHERE nip = :nip");
            $updateStmt->execute([':last_login' => $now->format('Y-m-d H:i:s'), ':nip' => $nip]);
            Response::json(true, 200, "Last login berhasil diperbarui.");
        } catch (\Exception $e) {
            Response::json(false, 500, "Gagal memperbarui last_login: " . $e->getMessage());
        }
    }
}