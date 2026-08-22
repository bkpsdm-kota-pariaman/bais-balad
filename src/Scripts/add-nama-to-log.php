<?php
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../Helpers/Database.php';

use App\Helpers\Database;

try {
    $db = Database::getConnection();
    // check if column already exists
    $stmt = $db->query("SHOW COLUMNS FROM `app_absensi_log_absensi` LIKE 'nama'");
    if (!$stmt->fetch()) {
        $db->exec("ALTER TABLE `app_absensi_log_absensi` ADD COLUMN `nama` VARCHAR(255) NOT NULL DEFAULT '-' AFTER `nip`");
        echo "Column 'nama' added successfully.\n";
    } else {
        echo "Column 'nama' already exists.\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
