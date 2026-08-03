<?php
// public_html/absensi-kegiatan-asn/index.php

// ==============================================================================
// 1. SAKLAR ENVIRONMENT ('development' atau 'production')
// ==============================================================================
define('ENVIRONMENT', 'development'); // Ubah ke 'production' jika sudah rilis

if (ENVIRONMENT === 'development') {
    error_reporting(E_ALL);
    ini_set('display_errors', '1');
} else {
    error_reporting(0);
    ini_set('display_errors', '0');
}

// Setel zona waktu default untuk semua fungsi tanggal/waktu di PHP
date_default_timezone_set('Asia/Jakarta');

// ==============================================================================
// 2. LOAD COMPOSER AUTOLOADER
// ==============================================================================
// Definisikan path root aplikasi sebagai konstanta agar bisa diakses secara global
define('APP_PATH', realpath(__DIR__ . '../'));
$autoloadPath = APP_PATH.'/vendor/autoload.php';

if (!file_exists($autoloadPath)) {
    // Jika file tidak\ ditemukan, langsung cetak error agar Anda tahu path-nya salah
    http_response_code(500);
    die("FATAL ERROR: Autoloader tidak ditemukan. Path yang dicari: " . $autoloadPath);
}
require $autoloadPath;

use App\Helpers\Response;
use FastRoute\Dispatcher;

// ==============================================================================
// 3. KONFIGURASI CORS & HEADER
// ==============================================================================
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ==============================================================================
// 4. ROUTING LOGIC
// ==============================================================================
$httpMethod = $_SERVER['REQUEST_METHOD'];
$uri = $_SERVER['REQUEST_URI'];

if (false !== $pos = strpos($uri, '?')) {
    $uri = substr($uri, 0, $pos);
}
$uri = rawurldecode($uri);

$scriptName = dirname($_SERVER['SCRIPT_NAME']);
if ($scriptName !== '/' && strpos($uri, $scriptName) === 0) {
    $uri = substr($uri, strlen($scriptName));
}

// Pastikan file routes.php juga bisa ditemukan
$routesPath = APP_PATH.'/src/routes.php';
if (!file_exists($routesPath)) {
    http_response_code(500);
    die("FATAL ERROR: File routes.php tidak ditemukan di path: " . $routesPath);
}

$dispatcher = FastRoute\simpleDispatcher(require $routesPath);
$routeInfo = $dispatcher->dispatch($httpMethod, $uri);

switch ($routeInfo[0]) {
    case Dispatcher::NOT_FOUND:
        Response::json(false, 404, "Endpoint API tidak ditemukan", null);
        break;
    case Dispatcher::METHOD_NOT_ALLOWED:
        Response::json(false, 405, "Method HTTP tidak diizinkan untuk endpoint ini", null);
        break;
    case Dispatcher::FOUND:
        $handler = $routeInfo[1];
        $vars = $routeInfo[2];
        
        list($class, $method) = $handler;
        
        if (class_exists($class)) {
            $controller = new $class();
            if (method_exists($controller, $method)) {
                $controller->$method($vars);
            } else {
                Response::json(false, 500, "Method {$method} tidak ditemukan pada Controller", null);
            }
        } else {
            Response::json(false, 500, "Controller Class {$class} tidak ditemukan", null);
        }
        break;
}