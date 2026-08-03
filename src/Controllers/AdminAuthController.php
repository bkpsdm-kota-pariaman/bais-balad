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

        // 2. Hubungkan ke Database dan Cari Admin di tabel app_absensi_data_admin
        $db = Database::getConnection();
        
        $stmt = $db->prepare("SELECT username FROM app_absensi_data_admin WHERE username = :username AND password = :password LIMIT 1");
        $stmt->bindParam(':username', $username);
        $stmt->bindParam(':password', $password);
        $stmt->execute();
        
        $admin = $stmt->fetch();

        // 3. Jika data tidak ditemukan / tidak cocok
        if (!$admin) {
            Response::json(false, 401, "Username atau Password salah.", null);
        }

        // 4. Jika Valid, Terbitkan Token JWT untuk Admin
        $config = require APP_PATH . '/config/config.php';
        $secretKey = $config['jwt_secret'];
        
        $issuedAt = time();
        $expirationTime = $issuedAt + (3600 * 8); // Token admin berlaku selama 8 jam
        
        $payload = [
            'iat' => $issuedAt,
            'exp' => $expirationTime,
            'iss' => 'bais-balad-apps-admin',
            'data' => [
                'username' => $admin['username'],
                'role' => 'admin' // Penanda bahwa ini adalah token admin
            ]
        ];

        $jwtToken = JWT::encode($payload, $secretKey, 'HS256');

        // 5. Kembalikan Response Sukses dengan token
        Response::json(true, 200, "Login Admin Berhasil", ['token' => $jwtToken]);
    }
}