<?php
// app_absensi/src/Controllers/ProfilController.php

namespace App\Controllers;

use App\Helpers\Response;
use App\Helpers\Database;
use App\Helpers\AuthHelper;
use Firebase\JWT\JWT;
use PDO;
use App\Helpers\LogHelper;
use DateTime;
use DateTimeZone;

class ProfilController {
    
    public function refresh() {
        $pegawaiData = AuthHelper::validateToken();
        $nip = $pegawaiData['nip'];

        $db = Database::getConnection();
        $sql = "SELECT 
                    p.nama_pegawai, p.nip, p.nik, p.perangkat_daerah, p.jabatan, p.jenis_asn, p.role
                FROM 
                    app_absensi_data_pegawai p
                WHERE p.nip = :nip LIMIT 1";
        $stmt = $db->prepare($sql);
        $stmt->bindParam(':nip', $nip);
        $stmt->execute();
        
        $pegawai = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$pegawai) {
            Response::json(false, 404, "Data pegawai tidak ditemukan di database.", null);
            return;
        }

        // Tentukan role berdasarkan kolom comma-separated
        $rolesStr = isset($pegawai['role']) ? trim($pegawai['role']) : '';
        $roles = $rolesStr !== '' ? array_map('trim', explode(',', $rolesStr)) : ['asn'];

        // Siapkan payload untuk di-cache oleh worker.
        $payloadForCache = [
            'nip' => $pegawai['nip'], 'nik' => $pegawai['nik'],
            'nama_pegawai' => $pegawai['nama_pegawai'], 'perangkat_daerah' => $pegawai['perangkat_daerah'],
            'jabatan' => $pegawai['jabatan'],
            'role' => $roles,
            'jenis_asn' => $pegawai['jenis_asn']
        ];

        $config = require APP_PATH . '/config/config.php';
        $secretKey = $config['jwt_secret'];
        $issuedAt = time();
        // Token berlaku selama 1 bulan (3600 detik * 24 jam * 30 hari)
        $expirationTime = $issuedAt + (3600 * 24 * 30); 
        
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

        $jwtToken = JWT::encode($payload, $secretKey, 'HS256');

        $responseData = [
            'token' => $jwtToken,
            'user' => [
                'nama' => $pegawai['nama_pegawai'],
                'jabatan' => $pegawai['jabatan'],
                'opd' => $pegawai['perangkat_daerah']
            ],
            // Sertakan data lengkap untuk di-cache oleh worker
            'pegawai_to_cache' => $payloadForCache
        ];

        Response::json(true, 200, "Profil berhasil disegarkan dari server.", $responseData);
    }

    public function refreshToken() {
        try {
            // Validasi token yang ada. Jika tidak valid (kedaluwarsa, format salah),
            // AuthHelper akan mengembalikan response error dan menghentikan eksekusi.
            // Ini memastikan hanya token yang valid yang bisa di-refresh.
            $pegawaiData = AuthHelper::validateToken();
            $nip = $pegawaiData['nip'];

            $db = Database::getConnection();
            $sql = "SELECT 
                        p.nama_pegawai, p.nip, p.perangkat_daerah, p.jabatan, p.jenis_asn, p.role
                    FROM 
                        app_absensi_data_pegawai p
                    WHERE p.nip = :nip LIMIT 1";
            $stmt = $db->prepare($sql);
            $stmt->bindParam(':nip', $nip);
            $stmt->execute();
            
            $pegawai = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$pegawai) {
                // Log kegagalan karena pegawai tidak ditemukan
                LogHelper::write('warning', "Refresh token gagal: Pegawai dengan NIP '{$nip}' tidak ditemukan di database.", ['nip' => $nip]);
                Response::json(false, 404, "Data pegawai tidak ditemukan di database.", null);
                return;
            }

            // Tentukan role berdasarkan kolom comma-separated
            $rolesStr = isset($pegawai['role']) ? trim($pegawai['role']) : '';
            $roles = $rolesStr !== '' ? array_map('trim', explode(',', $rolesStr)) : ['asn'];

            $config = require APP_PATH . '/config/config.php';
            $secretKey = $config['jwt_secret'];
            $issuedAt = time();
            // Token berlaku selama 1 bulan
            $expirationTime = $issuedAt + (3600 * 24 * 30); 
            
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
                    'jenis_asn' => $pegawai['jenis_asn'] ?? null
                ]
            ];

            $jwtToken = JWT::encode($payload, $secretKey, 'HS256');

            $responseData = [
                'token' => $jwtToken,
            ];

            Response::json(true, 200, "Token berhasil diperbarui.", $responseData);
        } catch (\Exception $e) {
            // Tangkap semua jenis exception (PDO, dll)
            $nipForLog = isset($pegawaiData['nip']) ? $pegawaiData['nip'] : 'N/A';
            LogHelper::write('error', "Refresh token gagal karena exception: " . $e->getMessage(), [
                'nip' => $nipForLog,
                'exception_trace' => $e->getTraceAsString()
            ]);
            // Beri response error umum ke client
            Response::json(false, 500, "Terjadi kesalahan internal saat mencoba memperbarui token.");
        }
    }

    public function update() {
        $pegawaiData = AuthHelper::validateToken();
        $nip = $pegawaiData['nip'];
        $db = Database::getConnection();

        // --- LOGIKA BARU: Batasi update profil sekali sebulan ---
        $stmtCheck = $db->prepare("SELECT updated_at, nik, nama_pegawai, jenis_asn FROM app_absensi_data_pegawai WHERE nip = :nip");
        $stmtCheck->execute([':nip' => $nip]);
        $pegawaiDbData = $stmtCheck->fetch(PDO::FETCH_ASSOC);
        $lastUpdateString = $pegawaiDbData['updated_at'] ?? null;

        if ($lastUpdateString) {
            try {
                $now = new DateTime('now', new DateTimeZone('Asia/Jakarta'));
                $lastUpdate = new DateTime($lastUpdateString, new DateTimeZone('Asia/Jakarta'));
                
                // Tambahkan 1 bulan ke waktu update terakhir
                $nextAllowedUpdate = $lastUpdate->modify('+1 month');

                if ($now < $nextAllowedUpdate) {
                    Response::json(false, 429, "Anda hanya dapat mengubah profil sekali dalam sebulan. Perubahan berikutnya dapat dilakukan setelah " . $nextAllowedUpdate->format('d F Y') . ". Hubungi BKPSDM Kota Pariaman jika perlu perubahan mendesak.");
                    return;
                }
            } catch (\Exception $e) {
                // Abaikan jika ada error parsing tanggal, biarkan user melanjutkan.
            }
        }
        // --- AKHIR LOGIKA BARU ---

        $inputJSON = file_get_contents('php://input');
        $input = json_decode($inputJSON, true);

        // Menangkap field jabatan dan perangkat daerah dari payload PWA
        $jabatanBaru = isset($input['jabatan']) ? trim($input['jabatan']) : null;
        $opdBaru = isset($input['perangkat_daerah']) ? trim($input['perangkat_daerah']) : null;

        if (!$jabatanBaru && !$opdBaru) {
            Response::json(false, 400, "Tidak ada data yang dikirim untuk diubah.", null);
            return;
        }
        
        // --- BLOK VALIDASI MASTER OPD ---
        if ($opdBaru) {
            $stmtOpd = $db->prepare("SELECT nama_opd FROM app_absensi_list_opd WHERE nama_opd = :opd LIMIT 1");
            $stmtOpd->bindParam(':opd', $opdBaru);
            $stmtOpd->execute();
            
            if (!$stmtOpd->fetch()) {
                // Jika OPD yang dikirim tidak ada di tabel master, tolak request!
                Response::json(false, 400, "Perangkat Daerah tidak valid atau tidak terdaftar di sistem.", null);
                return;
            }
        }
        
        $updates = [];
        $params = [];
        if ($jabatanBaru) {
            $updates[] = "jabatan = :jabatan";
            $params[':jabatan'] = $jabatanBaru;
        }
        if ($opdBaru) {
            $updates[] = "perangkat_daerah = :opd";
            $params[':opd'] = $opdBaru;
        }
        
        // Tambahkan timestamp update profil ke dalam query
        $now = new DateTime('now', new DateTimeZone('Asia/Jakarta'));
        $updates[] = "updated_at = :updated_at";
        // Set awal sebagai belum sinkron
        $updates[] = "kv_sync_status = 0";
        $params[':updated_at'] = $now->format('Y-m-d H:i:s');

        $params[':nip'] = $nip;
        
        $sql = "UPDATE app_absensi_data_pegawai SET " . implode(', ', $updates) . " WHERE nip = :nip";
        $stmt = $db->prepare($sql);
        
        // Eksekusi update.
        $stmt->execute($params);

        // --- LOGIKA BARU: Lakukan sinkronisasi SETELAH menulis ke DB ---
        $payloadForKv = [
            'nip' => $nip,
            'nik' => $pegawaiDbData['nik'],
            'nama_pegawai' => $pegawaiDbData['nama_pegawai'],
            'perangkat_daerah' => $opdBaru ?: $pegawaiData['opd'],
            'jabatan' => $jabatanBaru ?: $pegawaiData['jabatan'],
            'jenis_asn' => $pegawaiDbData['jenis_asn'],
            'role' => $pegawaiData['role'] ?? ['asn']
        ];
        $syncSuccess = $this->syncPegawaiToKv('PUT', $nip, $payloadForKv, true);
        
        if ($syncSuccess) {
            $db->prepare("UPDATE app_absensi_data_pegawai SET kv_sync_status = 1 WHERE nip = :nip")->execute([':nip' => $nip]);
        }

        // --- LOGIKA BARU: Generate token baru secara langsung, tanpa memanggil refresh() ---
        // Ini untuk menghindari sinkronisasi ganda ke KV.
        $config = require APP_PATH . '/config/config.php';
        $secretKey = $config['jwt_secret'];
        $issuedAt = time();
        $expirationTime = $issuedAt + (3600 * 24 * 30);

        // Gunakan data yang sudah di-payload untuk KV karena itu yang paling baru.
        $payloadForToken = [
            'iat' => $issuedAt,
            'exp' => $expirationTime,
            'iss' => 'bais-pariaman-apps',
            'data' => [
                'nip' => $payloadForKv['nip'],
                'nama' => $payloadForKv['nama_pegawai'],
                'opd' => $payloadForKv['perangkat_daerah'],
                'jabatan' => $payloadForKv['jabatan'],
                'role' => $payloadForKv['role'],
                'jenis_asn' => $payloadForKv['jenis_asn']
            ]
        ];

        $jwtToken = JWT::encode($payloadForToken, $secretKey, 'HS256');

        $responseData = [
            'token' => $jwtToken,
            'user' => [
                'nama' => $payloadForKv['nama_pegawai'],
                'jabatan' => $payloadForKv['jabatan'],
                'opd' => $payloadForKv['perangkat_daerah']
            ]
        ];

        $message = "Profil berhasil diperbarui.";
        if (!$syncSuccess) { $message .= " Gagal sinkronisasi ke cache."; }

        Response::json(true, 200, $message, $responseData);
    }

    /**
     * Menjalankan permintaan ke Cloudflare Worker untuk menyinkronkan (PUT/DELETE) cache KV.
     * Dapat berjalan dalam mode fire-and-forget atau blocking.
     *
     * @param string $method Metode HTTP (PUT atau DELETE).
     * @param string $nip NIP pegawai yang cache-nya akan disinkronkan.
     * @param array|null $payload Data yang akan dikirim (untuk PUT).
     * @param bool $waitForResponse Jika true, akan menunggu respons dari worker. Jika false, berjalan di latar belakang.
     * @return bool|void Mengembalikan boolean jika $waitForResponse true, void jika false.
     */
    private function syncPegawaiToKv($method, $nip, $payload = null, $waitForResponse = false) {
        $config = require APP_PATH . '/config/config.php';
        $workerUrl = $config['worker_url'] ?? null;
        $workerSecret = $config['worker_secret'] ?? null;

        if (!$workerUrl || !$workerSecret || !$nip) {
            error_log("[Pegawai KV Sync] Gagal: Konfigurasi Worker URL/secret atau NIP tidak ada untuk NIP: " . $nip);
            return $waitForResponse ? false : null;
        }

        $url = rtrim($workerUrl, '/') . '/api/pegawai/' . $nip;

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'X-Worker-Secret: ' . $workerSecret
        ]);

        if ($waitForResponse) {
            curl_setopt($ch, CURLOPT_TIMEOUT, 5);
        } else {
            curl_setopt($ch, CURLOPT_TIMEOUT_MS, 500);
        }

        if ($payload !== null && $method === 'PUT') {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        }

        $responseBody = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErrorNo = curl_errno($ch);
        $curlErrorMsg = curl_error($ch);
        curl_close($ch);

        if ($waitForResponse) {
            if ($curlErrorNo === 0 && $httpCode >= 200 && $httpCode < 300) {
                return true; // Sukses
            }
            error_log("[Blocking Pegawai KV Sync] Gagal untuk NIP $nip. HTTP Code: $httpCode, cURL Error: $curlErrorMsg");
            return false; // Gagal
        } elseif ($curlErrorNo !== 0 && $curlErrorNo !== CURLE_OPERATION_TIMEDOUT) {
            error_log("[Fire-and-forget Pegawai KV Sync] cURL error untuk NIP $nip: " . $curlErrorMsg);
        }
    }
}