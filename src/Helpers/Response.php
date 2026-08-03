<?php
namespace App\Helpers;

class Response {
    /**
     * Mencetak response JSON kaku dan menghentikan eksekusi script.
     * * @param bool $status Status keberhasilan (true/false)
     * @param int $code HTTP Status Code (200, 401, 404, 500, dll)
     * @param string $message Pesan respons
     * @param mixed $data Data payload (array/object), default: null
     */
    public static function json(bool $status, int $code, string $message, $data = null) {
        // Set HTTP Response Code
        http_response_code($code);
        
        // Set Header
        header('Content-Type: application/json; charset=utf-8');
        header('Access-Control-Allow-Origin: *'); // Sesuaikan CORS jika perlu
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization');

        // Bentuk Payload Kaku
        $payload = [
            'status'  => $status,
            'code'    => $code,
            'message' => $message,
            'data'    => $data
        ];

        // Cetak dan matikan proses (exit)
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
}