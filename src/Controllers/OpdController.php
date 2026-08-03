<?php
// app_absensi/src/Controllers/OpdController.php

namespace App\Controllers;

use App\Helpers\Response;
use App\Helpers\Database;
use App\Helpers\AuthHelper;
use PDO;

class OpdController {
    
    /**
     * Mengambil seluruh list OPD dari tabel master.
     * Endpoint ini dilindungi dan memerlukan token JWT.
     */
    public function getList() {
        // Memvalidasi token, hanya user yang sudah login yang bisa mengakses
        AuthHelper::validateToken();

        $db = Database::getConnection();
        
        // Query untuk mengambil semua nama_opd dari tabel master, diurutkan berdasarkan abjad
        $stmt = $db->prepare("SELECT nama_opd FROM app_absensi_list_opd ORDER BY nama_opd ASC");
        $stmt->execute();
        
        $listOpd = $stmt->fetchAll(PDO::FETCH_COLUMN, 0);

        // Kembalikan response sukses dengan data list OPD dalam bentuk array
        Response::json(true, 200, "List OPD berhasil diambil", $listOpd);
    }
}