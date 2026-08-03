<?php
// src/Controllers/HomeController.php

namespace App\Controllers;

use App\Helpers\Response;

class HomeController {
    public function ping() {
        $dataUjiCoba = [
            'app_name' => 'API Absensi Stateless PHP 7.2',
            'server_time' => date('Y-m-d H:i:s'),
            'php_version' => PHP_VERSION
        ];
        
        // Mengembalikan format JSON kaku yang Anda minta dengan status sukses (true)
        Response::json(true, 200, "API Engine is running perfectly", $dataUjiCoba);
    }
}