<?php
namespace App\Helpers;

class Response {
    /**
     * Mencetak response JSON kaku dan menghentikan eksekusi script.
     * @param bool $status Status keberhasilan (true/false)
     * @param int $code Kode untuk payload JSON (200, 401, 404, 500, dll)
     * @param string $message Pesan respons
     * @param mixed $data Data payload (array/object), default: null
     * @param int $httpStatus HTTP Status Code asli (default: 200)
     */
    public static function json(bool $status, int $code, string $message, $data = null, int $httpStatus = 200) {
        // Set HTTP Response Code
        http_response_code($httpStatus);
        
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