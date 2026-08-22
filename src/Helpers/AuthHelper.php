<?php
// app_absensi/src/Helpers/AuthHelper.php

namespace App\Helpers;

use App\Helpers\Response;
use Firebase\JWT\JWT;
use Exception;

class AuthHelper {
    
    /**
     * Menangkap Header secara Universal dan Memvalidasi Token JWT
     * Mengembalikan array data pegawai jika valid, atau langsung memotong eksekusi (exit) jika gagal.
     */
    public static function validateToken() {
        $authHeader = null;

        // 1. Tangkap Header Universal (Support Apache, Nginx, Litespeed, FPM)
        if (isset($_SERVER['Authorization'])) {
            $authHeader = trim($_SERVER['Authorization']);
        } elseif (isset($_SERVER['HTTP_AUTHORIZATION'])) {
            $authHeader = trim($_SERVER['HTTP_AUTHORIZATION']);
        } elseif (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
            $authHeader = trim($_SERVER['REDIRECT_HTTP_AUTHORIZATION']);
        } elseif (function_exists('apache_request_headers')) {
            $requestHeaders = apache_request_headers();
            $requestHeaders = array_combine(array_map('ucwords', array_keys($requestHeaders)), array_values($requestHeaders));
            if (isset($requestHeaders['Authorization'])) {
                $authHeader = trim($requestHeaders['Authorization']);
            }
        }
        
        // 2. Validasi Ketersediaan Token
        if (!$authHeader || !preg_match('/Bearer\s(\S+)/', $authHeader, $matches)) {
            Response::json(false, 401, "Akses ditolak. Token JWT tidak ditemukan atau format salah.", null);
        }
        
        $jwtToken = $matches[1];
        $config = require __DIR__ . '/../../config/config.php';
        $secretKey = $config['jwt_secret'];
        
        // 3. Decode & Verifikasi Token
        try {
            $decoded = JWT::decode($jwtToken, new \Firebase\JWT\Key($secretKey, 'HS256'));
            return (array) $decoded->data;
        } catch (Exception $e) {
            Response::json(false, 401, "Token tidak valid atau sudah kedaluwarsa. Silakan login ulang.", null);
            exit;
        }
    }
}