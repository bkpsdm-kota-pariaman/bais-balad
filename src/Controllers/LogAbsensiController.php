<?php
// src/Controllers/LogAbsensiController.php

namespace App\Controllers;

use App\Helpers\Response;
use App\Helpers\Database;
use App\Helpers\AdminAuthHelper;
use PDO;

class LogAbsensiController {

    public function listLog() {
        // 1. Validasi hak akses: hanya Super Admin yang diizinkan
        $adminData = AdminAuthHelper::validate();
        $roles = isset($adminData['role']) ? (array) $adminData['role'] : [];
        if (!in_array('super admin', $roles)) {
            Response::json(false, 403, "Akses ditolak. Fitur ini hanya untuk Super Admin.");
            return;
        }

        // 2. Filter wajib: kode_akses
        $kodeAkses = trim($_GET['kode_akses'] ?? '');
        if (empty($kodeAkses)) {
            Response::json(false, 400, "Kode akses kegiatan wajib dipilih.");
            return;
        }

        // 3. Filter opsional
        $searchPegawai = trim($_GET['search_pegawai'] ?? '');
        $jenisAksi = trim($_GET['jenis_aksi'] ?? '');
        $searchPelaku = trim($_GET['search_pelaku'] ?? '');
        $tanggal = trim($_GET['tanggal'] ?? '');

        // 4. Pagination parameter
        $page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
        $limit = isset($_GET['limit']) ? max(1, (int)$_GET['limit']) : 10;
        $offset = ($page - 1) * $limit;

        $db = Database::getConnection();

        // 5. Bangun Query SQL dinamis
        $conditions = ["kode_akses = :kode_akses"];
        $params = [':kode_akses' => $kodeAkses];

        if (!empty($searchPegawai)) {
            $conditions[] = "(nip LIKE :search_pegawai_nip OR nama LIKE :search_pegawai_nama)";
            $params[':search_pegawai_nip'] = '%' . $searchPegawai . '%';
            $params[':search_pegawai_nama'] = '%' . $searchPegawai . '%';
        }

        if (!empty($jenisAksi) && in_array(strtolower($jenisAksi), ['tambah', 'edit', 'hapus'])) {
            $conditions[] = "jenis_aksi = :jenis_aksi";
            $params[':jenis_aksi'] = strtolower($jenisAksi);
        }

        if (!empty($searchPelaku)) {
            $conditions[] = "(nip_pelaku LIKE :search_pelaku_nip OR nama_pelaku LIKE :search_pelaku_nama)";
            $params[':search_pelaku_nip'] = '%' . $searchPelaku . '%';
            $params[':search_pelaku_nama'] = '%' . $searchPelaku . '%';
        }

        if (!empty($tanggal)) {
            $conditions[] = "DATE(waktu_aksi) = :tanggal";
            $params[':tanggal'] = $tanggal;
        }

        $whereSql = implode(' AND ', $conditions);

        // Hitung total baris yang cocok
        $countStmt = $db->prepare("SELECT COUNT(*) FROM app_absensi_log_absensi WHERE {$whereSql}");
        foreach ($params as $key => $val) {
            $countStmt->bindValue($key, $val);
        }
        $countStmt->execute();
        $totalRows = (int)$countStmt->fetchColumn();

        // Ambil data log sesuai pagination
        $sql = "SELECT id_log_absensi, kode_akses, nip, nama, jenis_aksi, nip_pelaku, nama_pelaku, ip_address, user_agent, waktu_aksi, data 
                FROM app_absensi_log_absensi 
                WHERE {$whereSql} 
                ORDER BY waktu_aksi DESC, id_log_absensi DESC 
                LIMIT :limit OFFSET :offset";
        
        $stmt = $db->prepare($sql);
        foreach ($params as $key => $val) {
            $stmt->bindValue($key, $val);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $payload = [
            'data' => $logs,
            'pagination' => [
                'total_rows' => $totalRows,
                'total_pages' => ($limit > 0) ? (int)ceil($totalRows / $limit) : 1,
                'current_page' => $page,
                'limit' => $limit
            ]
        ];

        Response::json(true, 200, "Berhasil mengambil log absensi.", $payload);
    }
}
