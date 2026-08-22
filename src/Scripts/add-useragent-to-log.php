<?php
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../Helpers/Database.php';

use App\Helpers\Database;

try {
    $db = Database::getConnection();
    // check if column already exists
    $stmt = $db->query("SHOW COLUMNS FROM `app_absensi_log_absensi` LIKE 'user_agent'");
    if (!$stmt->fetch()) {
        $db->exec("ALTER TABLE `app_absensi_log_absensi` ADD COLUMN `user_agent` VARCHAR(255) DEFAULT NULL AFTER `ip_address`");
        echo "Column 'user_agent' added successfully.\n";
    } else {
        echo "Column 'user_agent' already exists.\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
