<?php
// src/Controllers/AdminOpdController.php

namespace App\Controllers;

use App\Helpers\Response;
use App\Helpers\Database;
use App\Helpers\AdminAuthHelper;
use PDO;

class AdminOpdController {

    public function list() {
        AdminAuthHelper::validate();
        $db = Database::getConnection();
        // Mengambil nama_opd dan mengaliaskannya sebagai 'id' agar sesuai dengan ekspektasi frontend
        $stmt = $db->query("SELECT nama_opd, nama_opd as id FROM app_absensi_list_opd ORDER BY nama_opd ASC");
        $opdList = $stmt->fetchAll(PDO::FETCH_ASSOC);
        Response::json(true, 200, "OK", $opdList);
    }

    public function create() {
        AdminAuthHelper::validate();
        $input = json_decode(file_get_contents('php://input'), true);
        $namaOpd = $input['nama_opd'] ?? null;

        if (empty($namaOpd)) {
            Response::json(false, 400, "Nama OPD wajib diisi.");
            return;
        }

        $db = Database::getConnection();
        
        // Cek duplikat
        $stmtCheck = $db->prepare("SELECT COUNT(*) FROM app_absensi_list_opd WHERE nama_opd = ?");
        $stmtCheck->execute([$namaOpd]);
        if ($stmtCheck->fetchColumn() > 0) {
            Response::json(false, 409, "Nama OPD sudah ada.");
            return;
        }

        $stmt = $db->prepare("INSERT INTO app_absensi_list_opd (nama_opd) VALUES (?)");
        if ($stmt->execute([$namaOpd])) {
            Response::json(true, 201, "OPD berhasil ditambahkan.");
        } else {
            Response::json(false, 500, "Gagal menambahkan OPD ke database.");
        }
    }

    public function update($vars) {
        AdminAuthHelper::validate();
        $oldNamaOpd = $vars['id'] ?? null;
        $input = json_decode(file_get_contents('php://input'), true);
        $newNamaOpd = $input['nama_opd'] ?? null;

        if (empty($oldNamaOpd) || empty($newNamaOpd)) {
            Response::json(false, 400, "Nama OPD lama dan baru wajib diisi.");
            return;
        }

        $db = Database::getConnection();
        $stmt = $db->prepare("UPDATE app_absensi_list_opd SET nama_opd = ? WHERE nama_opd = ?");
        if ($stmt->execute([$newNamaOpd, $oldNamaOpd])) {
            Response::json(true, 200, "OPD berhasil diperbarui.");
        } else {
            Response::json(false, 500, "Gagal memperbarui OPD.");
        }
    }

    public function delete($vars) {
        AdminAuthHelper::validate();
        $namaOpd = $vars['id'] ?? null;
        if (empty($namaOpd)) {
            Response::json(false, 400, "Nama OPD wajib diisi.");
            return;
        }

        $db = Database::getConnection();
        $stmt = $db->prepare("DELETE FROM app_absensi_list_opd WHERE nama_opd = ?");
        if ($stmt->execute([$namaOpd])) {
            Response::json(true, 200, "OPD berhasil dihapus.");
        } else {
            Response::json(false, 500, "Gagal menghapus OPD.");
        }
    }
    
    public function syncToKv() {
        AdminAuthHelper::validate();
        $db = Database::getConnection();

        $stmt = $db->query("SELECT nama_opd FROM app_absensi_list_opd ORDER BY nama_opd ASC");
        $opdList = $stmt->fetchAll(PDO::FETCH_COLUMN, 0);

        if ($opdList === false) {
            Response::json(false, 500, "Gagal mengambil daftar OPD dari database.");
            return;
        }

        $syncSuccess = $this->syncOpdListToKv('PUT', $opdList, true);

        if ($syncSuccess) {
            Response::json(true, 200, "Daftar OPD berhasil disinkronkan ke cache (KV).");
        } else {
            Response::json(false, 503, "Gagal menyinkronkan cache. Worker mungkin sibuk atau tidak dapat dijangkau.");
        }
    }

    private function syncOpdListToKv($method, $payload = null, $waitForResponse = false) {
        $config = require APP_PATH . '/config/config.php';
        $workerUrl = $config['worker_url'] ?? null;
        $workerSecret = $config['worker_secret'] ?? null;

        if (!$workerUrl || !$workerSecret) {
            error_log("[OPD List KV Sync] Gagal: Konfigurasi Worker URL/secret tidak ada.");
            return $waitForResponse ? false : null;
        }

        $url = rtrim($workerUrl, '/') . '/api/opd-list/sync';

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json', 'X-Worker-Secret: ' . $workerSecret]);

        if ($waitForResponse) {
            curl_setopt($ch, CURLOPT_TIMEOUT, 5);
        } else {
            curl_setopt($ch, CURLOPT_TIMEOUT_MS, 500);
        }

        if ($payload !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        }

        curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErrorNo = curl_errno($ch);
        curl_close($ch);

        return $curlErrorNo === 0 && $httpCode >= 200 && $httpCode < 300;
    }
}