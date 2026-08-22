<?php
// src/Controllers/AdminAuthController.php

namespace App\Controllers;

use App\Helpers\Response;
use App\Helpers\Database;
use Firebase\JWT\JWT;
use PDO;

class AdminAuthController {
    
    public function login() {
        // 1. Tangkap Payload JSON dari request
        $inputJSON = file_get_contents('php://input');
        $input = json_decode($inputJSON, true);

        // Validasi input kosong
        if (!isset($input['username']) || !isset($input['password'])) {
            Response::json(false, 400, "Username dan Password wajib diisi.", null);
        }

        $username = trim($input['username']);
        $password = trim($input['password']);

        // 2. Hubungkan ke Database dan Cari Pegawai
        $db = Database::getConnection();
        
        $stmt = $db->prepare("SELECT nip, nama_pegawai, nik, role FROM app_absensi_data_pegawai WHERE nip = :username LIMIT 1");
        $stmt->bindParam(':username', $username);
        $stmt->execute();
        
        $admin = $stmt->fetch();

        // 3. Jika data tidak ditemukan / tidak cocok
        $isPasswordMatch = false;
        if ($admin) {
            if (password_verify($password, $admin['nik']) || $admin['nik'] === $password) {
                $isPasswordMatch = true;
            }
        }

        if (!$admin || !$isPasswordMatch) {
            Response::json(false, 401, "Username atau Password salah.", null);
        }

        // Cek Role
        $rolesStr = isset($admin['role']) ? trim($admin['role']) : '';
        $roles = $rolesStr !== '' ? array_map('trim', explode(',', $rolesStr)) : ['asn'];

        if (!in_array('admin', $roles) && !in_array('super admin', $roles)) {
            Response::json(false, 403, "Akses ditolak. Anda bukan admin.", null);
        }

        // 4. Jika Valid, Terbitkan Token JWT untuk Admin
        $config = require APP_PATH . '/config/config.php';
        $secretKey = $config['jwt_secret'];
        
        $issuedAt = time();
        $expirationTime = $issuedAt + (3600 * 8); // Token admin berlaku selama 8 jam
        
        $payload = [
            'iat' => $issuedAt,
            'exp' => $expirationTime,
            'iss' => 'bais-pariaman-apps-admin',
            'data' => [
                'username' => $admin['nip'], // di admin JS token decode mengharapkan 'username' (atau nip)
                'nama' => $admin['nama_pegawai'],
                'role' => $roles // Array role yang sudah diverifikasi
            ]
        ];

        $jwtToken = JWT::encode($payload, $secretKey, 'HS256');

        // 5. Kembalikan Response Sukses dengan token
        Response::json(true, 200, "Login Admin Berhasil", ['token' => $jwtToken]);
    }
}