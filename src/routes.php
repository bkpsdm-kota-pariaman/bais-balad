<?php
// src/routes.php

use FastRoute\RouteCollector;

return function(RouteCollector $r) {
    
    // 1. RUTE UJI COBA
    $r->addRoute('GET', '/ping', ['App\Controllers\HomeController', 'ping']);    
    
    // 2. KELOMPOK RUTE OTENTIKASI
    $r->addRoute('POST', '/login-asn', ['App\Controllers\AuthController', 'loginAsn']);
    $r->addRoute('POST', '/token/generate-temporary', ['App\Controllers\AuthController', 'generateTemporaryToken']);

    // Rute internal untuk dipanggil oleh Worker
    $r->addRoute('POST', '/auth/update-last-login', ['App\Controllers\AuthController', 'updateLastLogin']);
    
    // 3. KELOMPOK RUTE ABSENSI & JADWAL
    // API baru untuk mengambil detail jadwal berdasarkan kode akses dari QR Code
    $r->addRoute('GET', '/jadwal/{kode_akses}', ['App\Controllers\JadwalController', 'getJadwal']);
    $r->addRoute('POST', '/absen/submit', ['App\Controllers\AbsenController', 'submit']);
    $r->addRoute('POST', '/absen-cepat/submit', ['App\Controllers\AbsenController', 'submitCepat']);

    // API baru untuk menerima batch data absensi dari worker
    $r->addRoute('POST', '/absen/submit-bulk', ['App\Controllers\AbsenController', 'submitBulk']);

    // 4. KELOMPOK RUTE PROFIL & DATA MASTER
    $r->addRoute('GET', '/profil/refresh', ['App\Controllers\ProfilController', 'refresh']);
    $r->addRoute('POST', '/profil/refresh-token', ['App\Controllers\ProfilController', 'refreshToken']);
    $r->addRoute('PUT', '/profil/update', ['App\Controllers\ProfilController', 'update']); 

    // Rute untuk mengambil data master list OPD
    $r->addRoute('GET', '/opd/list', ['App\Controllers\OpdController', 'getList']);

    // 5. KELOMPOK RUTE ADMIN
    $r->addRoute('POST', '/admin/login', ['App\Controllers\AdminAuthController', 'login']);

    // CRUD untuk Jadwal Kegiatan oleh Admin
    $r->addRoute('GET', '/admin/jadwal', ['App\Controllers\AdminJadwalController', 'listJadwal']);
    $r->addRoute('POST', '/admin/jadwal', ['App\Controllers\AdminJadwalController', 'createJadwal']);
    $r->addRoute('GET', '/admin/jadwal/{kode_akses}', ['App\Controllers\AdminJadwalController', 'getJadwal']);
    $r->addRoute('PUT', '/admin/jadwal/{kode_akses}', ['App\Controllers\AdminJadwalController', 'updateJadwal']);
    $r->addRoute('DELETE', '/admin/jadwal/{kode_akses}', ['App\Controllers\AdminJadwalController', 'deleteJadwal']);
    $r->addRoute('GET', '/admin/jadwal/generate-token/{kode_akses}', ['App\Controllers\AdminJadwalController', 'generateJadwalToken']);
    $r->addRoute('POST', '/admin/jadwal/sync-kv/{kode_akses}', ['App\Controllers\AdminJadwalController', 'syncKvCache']);

    // Rute untuk rekap absensi per kegiatan
    $r->addRoute('GET', '/admin/rekap/{kode_akses}', ['App\Controllers\AdminRekapController', 'getRekap']);

    // API baru untuk ringkasan rekap (lebih ringan)
    $r->addRoute('GET', '/admin/rekap/summary/{kode_akses}', ['App\Controllers\AdminRekapController', 'getRekapSummary']);

    // API baru untuk detail pegawai yang difilter
    $r->addRoute('POST', '/admin/rekap/details/{kode_akses}', ['App\Controllers\AdminRekapController', 'getRekapDetails']);
    $r->addRoute('POST', '/admin/rekap/import-csv', ['App\Controllers\AdminRekapController', 'importCsv']);
    $r->addRoute('POST', '/admin/rekap/keseluruhan', ['App\Controllers\AdminRekapController', 'getRekapKeseluruhan']);
    $r->addRoute('POST', '/admin/statistik', ['App\Controllers\AdminRekapController', 'getStatistikKehadiran']);
    $r->addRoute('POST', '/admin/statistik/detail', ['App\Controllers\AdminRekapController', 'getStatistikDetail']);
    $r->addRoute('GET', '/admin/rekap/opd-list/{kode_akses}', ['App\Controllers\AdminRekapController', 'getRekapOpdList']);
    
    // Rute untuk Log Absensi Audit (Super Admin Only)
    $r->addRoute('GET', '/admin/log-absensi', ['App\Controllers\LogAbsensiController', 'listLog']);

    // Rute untuk CRUD data pegawai
    $r->addRoute('GET', '/admin/pegawai', ['App\Controllers\AdminPegawaiController', 'listPegawai']);
    $r->addRoute('GET', '/admin/pegawai/stats', ['App\Controllers\AdminPegawaiController', 'getPegawaiStats']);
    $r->addRoute('POST', '/admin/pegawai', ['App\Controllers\AdminPegawaiController', 'createPegawai']);
    $r->addRoute('PUT', '/admin/pegawai/{nip}', ['App\Controllers\AdminPegawaiController', 'updatePegawai']);
    $r->addRoute('DELETE', '/admin/pegawai/{nip}', ['App\Controllers\AdminPegawaiController', 'deletePegawai']);
    $r->addRoute('POST', '/admin/pegawai/sync-kv/{nip}', ['App\Controllers\AdminPegawaiController', 'syncKvCache']);

    // Rute untuk CRUD data OPD
    $r->addRoute('GET', '/admin/opd', ['App\Controllers\AdminOpdController', 'list']);
    $r->addRoute('POST', '/admin/opd', ['App\Controllers\AdminOpdController', 'create']);
    $r->addRoute('PUT', '/admin/opd/{id}', ['App\Controllers\AdminOpdController', 'update']);
    $r->addRoute('DELETE', '/admin/opd/{id}', ['App\Controllers\AdminOpdController', 'delete']);
    $r->addRoute('POST', '/admin/opd/sync-kv', ['App\Controllers\AdminOpdController', 'syncToKv']);

    // Rute untuk verifikasi/edit absensi oleh admin
    $r->addRoute('POST', '/admin/verifikasi', ['App\Controllers\AdminRekapController', 'verifikasiAbsen']);
    $r->addRoute('POST', '/admin/verifikasi-masal', ['App\Controllers\AdminRekapController', 'verifikasiAbsenMasal']);

    // Rute statis untuk hapus massal HARUS didefinisikan SEBELUM rute variabel.
    $r->addRoute('POST', '/admin/rekap/entry/bulk-delete', ['App\Controllers\AdminRekapController', 'deleteAbsensiEntryBulk']);

    // Rute untuk menambah peserta baru ke rekap secara manual
    $r->addRoute('POST', '/admin/rekap/entry/{kode_akses}', ['App\Controllers\AdminRekapController', 'addAbsensiEntry']);

    // Rute untuk menambah peserta baru ke rekap secara massal
    $r->addRoute('POST', '/admin/rekap/entry/bulk/{kode_akses}', ['App\Controllers\AdminRekapController', 'addAbsensiEntryBulk']);

    // Rute untuk mendapatkan daftar pegawai yang bisa ditambahkan ke rekap
    $r->addRoute('POST', '/admin/rekap/eligible-pegawai/{kode_akses}', ['App\Controllers\AdminRekapController', 'getEligiblePegawai']);

    // Rute untuk menghapus data absensi pegawai tertentu dari sebuah kegiatan
    $r->addRoute('DELETE', '/admin/rekap/entry/{kode_akses}/{nip}', ['App\Controllers\AdminRekapController', 'deleteAbsensiEntry']);
};