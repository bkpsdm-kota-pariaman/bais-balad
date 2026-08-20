<?php
// src/Controllers/AbsenController.php

namespace App\Controllers;

use App\Helpers\Response;
use App\Helpers\Database;
use App\Helpers\AuthHelper;
use App\Helpers\LogHelper; // Tambahkan LogHelper
use PDO;
use DateTime;
use DateTimeZone;
// Add JWT for decoding
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

class AbsenController {

    private function haversineDistance($lat1, $lon1, $lat2, $lon2) {
        $earthRadius = 6371000;
        $dLat = deg2rad($lat2 - $lat1);
        $dLon = deg2rad($lon2 - $lon1);
        $a = sin($dLat/2) * sin($dLat/2) + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLon/2) * sin($dLon/2);
        $c = 2 * atan2(sqrt($a), sqrt(1-$a));
        return $earthRadius * $c;
    }

    /**
     * Menerima dan menyimpan data absensi dari PWA, termasuk foto selfie.
     */
    public function submit() {
        // 1. Validasi token JWT secara manual untuk menangani dua jenis token:
        //    - Token login lengkap (payload data adalah objek)
        //    - Token QR temporer (payload data adalah array)
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? null;
        $token = $authHeader ? str_replace('Bearer ', '', $authHeader) : null;
        if (!$token) {
            Response::json(false, 401, "Token otorisasi tidak ditemukan.");
            return;
        }

        $config = require APP_PATH . '/config/config.php';
        $secretKey = $config['jwt_secret'];
        $pegawaiData = null;
        try {
            // Gunakan Firebase\JWT\JWT dan Key
            $decoded = JWT::decode($token, new \Firebase\JWT\Key($secretKey, 'HS256'));
            // Validasi masa berlaku (exp) secara manual
            if (isset($decoded->exp) && $decoded->exp < time()) {
                 Response::json(false, 401, "Token telah kedaluwarsa.");
                 return;
            }
            $pegawaiData = (array) $decoded->data;
        } catch (\Exception $e) {
            Response::json(false, 401, "Token tidak valid atau kedaluwarsa: " . $e->getMessage());
            return;
        }

        // 2. Ambil data dari request (tipe multipart/form-data)
        $kodeAkses = $_POST['kode_akses'] ?? null;
        $lat = (isset($_POST['lat']) && $_POST['lat'] !== '') ? $_POST['lat'] : null;
        $lng = (isset($_POST['lng']) && $_POST['lng'] !== '') ? $_POST['lng'] : null;
        $lokasi = (isset($_POST['lokasi']) && $_POST['lokasi'] !== '') ? $_POST['lokasi'] : null;
        $keterangan = $_POST['keterangan'] ?? null;
        $foto = $_FILES['foto'] ?? null;
        $statusKehadiran = $_POST['status_kehadiran'] ?? 'Hadir';
        $statusVerifikasi = $_POST['status_verifikasi'] ?? 'Terverifikasi Sistem';

        // Untuk fallback dari 'Absensi Cepat', foto bersifat opsional.
        // Kita identifikasi ini dengan memeriksa status_verifikasi yang dikirim.
        $is_admin_cepat_fallback = ($statusVerifikasi === 'Terverifikasi Oleh Admin');

        // 3. Validasi input dasar
        $is_izin = (strtolower($statusKehadiran) !== 'hadir');
        $is_lokasi_valid = $is_izin ? true : ($lat !== null && $lng !== null && !empty($lokasi));

        if (empty($kodeAkses) || !$is_lokasi_valid || 
            // Foto hanya wajib jika ini BUKAN fallback dari absensi cepat admin
            (!$is_admin_cepat_fallback && (empty($foto) || $foto['error'] === UPLOAD_ERR_NO_FILE))
        ) {
            Response::json(false, 400, "Data tidak lengkap. Kode, lokasi, dan foto wajib diisi. Pastikan GPS aktif atau Anda memilih 'Lanjutkan' jika GPS gagal.");
            return;
        }

        $db = Database::getConnection();

        $newFileName = 'NO_PHOTO_ADMIN_FAST_INPUT.jpg'; // Default jika tidak ada foto
        $uploadPath = null;

        // 4. Proses unggah foto jika ada
        if ($foto && $foto['error'] === UPLOAD_ERR_OK) {
            $uploadDir = '../uploads/foto_absensi/';

            if (!is_dir($uploadDir) && !mkdir($uploadDir, 0775, true) && !is_dir($uploadDir)) {
                Response::json(false, 500, "Server Error: Gagal membuat direktori upload.");
                return;
            }

            // Get extension
            $ext = 'jpg';
            if ($foto['type'] === 'application/pdf') {
                $ext = 'pdf';
            }
            
            // Buat nama file yang unik dengan string acak
            $timestamp = time();
            $randomStr = bin2hex(random_bytes(4));
            $newFileName = $pegawaiData['nip'] . '_' . $kodeAkses . '_' . $timestamp . '_' . $randomStr . '.' . $ext;
            $uploadPath = $uploadDir . $newFileName;

            if (!move_uploaded_file($foto['tmp_name'], $uploadPath)) {
                Response::json(false, 500, "Gagal menyimpan file foto di server.");
                return;
            }
        } elseif ($foto && $foto['error'] !== UPLOAD_ERR_NO_FILE) {
            // Jika ada file tapi error selain "tidak ada file", laporkan error.
            Response::json(false, 500, "Gagal mengunggah foto. Error code: " . $foto['error']);
            return;
        }

        // 5. Dapatkan detail jadwal untuk disimpan di log absensi
        $stmtJadwal = $db->prepare("SELECT judul, kategori, tanggal, jam_selesai, koordinat, radius_meter, is_strict_time, is_strict_location FROM app_absensi_jadwal_kegiatan WHERE kode_akses = :kode_akses LIMIT 1");
        $stmtJadwal->bindParam(':kode_akses', $kodeAkses);
        $stmtJadwal->execute();
        $jadwal = $stmtJadwal->fetch(PDO::FETCH_ASSOC);

        if (!$jadwal) {
            if ($uploadPath && file_exists($uploadPath)) {
                unlink($uploadPath);
            }
            Response::json(false, 404, "Jadwal kegiatan tidak valid atau sudah berakhir.");
            return;
        }

        $now = new DateTime('now', new DateTimeZone('Asia/Jakarta'));

        // 5b. Pengecekan server-side: tentukan kondisi terlambat & luar lokasi
        // Jika user terlambat atau di luar lokasi, status verifikasi di-override menjadi
        // "Menunggu Verifikasi Admin" agar admin bisa mengecek bukti dukung.
        $isTerlambat = false;
        $isLuarRadius = false;

        // Cek keterlambatan (pakai waktu server Jakarta)
        $endTime = new DateTime($jadwal['tanggal'] . ' ' . $jadwal['jam_selesai'], new DateTimeZone('Asia/Jakarta'));
        if ($now > $endTime) {
            $isTerlambat = true;
        }

        // Cek radius lokasi
        if (!empty($jadwal['koordinat']) && $jadwal['koordinat'] !== '-') {
            $tParts = explode(',', str_replace("'", '', $jadwal['koordinat']));
            if (count($tParts) >= 2) {
                $tLat = (float) trim($tParts[0]);
                $tLng = (float) trim($tParts[1]);
                $pLat = (float) ($lat ?? 0);
                $pLng = (float) ($lng ?? 0);
                $radius = (float) ($jadwal['radius_meter'] ?? 0);
                if ($radius > 0) {
                    $jarak = $this->haversineDistance($pLat, $pLng, $tLat, $tLng);
                    if ($jarak > $radius) {
                        $isLuarRadius = true;
                    }
                }
            }
        }

        // 5c. Validasi Server-side Strict Mode
        if (strtolower($statusKehadiran) === 'hadir') {
            if ($isTerlambat && !empty($jadwal['is_strict_time']) && $jadwal['is_strict_time'] == 1) {
                if ($uploadPath && file_exists($uploadPath)) {
                    unlink($uploadPath);
                }
                Response::json(false, 403, "Gagal: Waktu Berakhir. Anda melanggar Aturan Waktu Berlaku.");
                return;
            }
            if ($isLuarRadius && !empty($jadwal['is_strict_location']) && $jadwal['is_strict_location'] == 1) {
                if ($uploadPath && file_exists($uploadPath)) {
                    unlink($uploadPath);
                }
                Response::json(false, 403, "Gagal: Di Luar Lokasi. Anda melanggar Aturan Wajib Sesuai Lokasi.");
                return;
            }
        }

        // Override status verifikasi jika terlambat, luar lokasi, atau tidak hadir (izin/sakit/dll)
        if (strtolower($statusKehadiran) !== 'hadir' || $isTerlambat || $isLuarRadius) {
            if ($statusVerifikasi !== 'Terverifikasi Oleh Admin') {
                $statusVerifikasi = 'Menunggu Verifikasi Admin';
            }
        }

        // 6. UPDATE atau INSERT data absensi di database
        $waktu = $now->format('Y-m-d H:i:s');

        $nip = null; $nama = null; $opd = null; $jabatan = null;
        
        // Payload data dari token sekarang selalu dalam format objek
        $nip = $pegawaiData['nip'] ?? null;
        $nama = $pegawaiData['nama'] ?? null;
        $opd = $pegawaiData['opd'] ?? null;
        $jabatan = $pegawaiData['jabatan'] ?? null;

        if (!$nip || !$nama) {
            Response::json(false, 400, "Data NIP atau Nama tidak ditemukan di dalam token otorisasi.");
            return;
        }

        $sql = "INSERT INTO app_absensi_data_absensi 
                    (kode_akses, nip, nama_pegawai, opd, jabatan, kategori, waktu, lokasi, lat, lng, nama_file_foto, keterangan, status_verifikasi, status_kehadiran) 
                VALUES 
                    (:kode_akses, :nip, :nama_pegawai, :opd, :jabatan, :kategori, :waktu, :lokasi, :lat, :lng, :nama_file_foto, :keterangan, :status_verifikasi, :status_kehadiran)
                ON DUPLICATE KEY UPDATE
                    waktu = VALUES(waktu),
                    lokasi = VALUES(lokasi),
                    lat = VALUES(lat),
                    lng = VALUES(lng),
                    nama_file_foto = VALUES(nama_file_foto),
                    kategori = VALUES(kategori),
                    keterangan = VALUES(keterangan),
                    status_verifikasi = VALUES(status_verifikasi),
                    status_kehadiran = VALUES(status_kehadiran),
                    nama_pegawai = VALUES(nama_pegawai),
                    opd = VALUES(opd),
                    jabatan = VALUES(jabatan)";

        $stmt = $db->prepare($sql);
        $isSuccess = $stmt->execute([
            ':kode_akses' => $kodeAkses,
            ':nip' => $nip,
            ':nama_pegawai' => $nama,
            ':opd' => $opd,
            ':jabatan' => $jabatan,
            ':kategori' => $jadwal['kategori'],
            ':waktu' => $waktu, // Waktu dari server
            ':lokasi' => $lokasi ?? '-', // Lokasi sudah diformat oleh PWA, default '-' jika null
            ':lat' => $lat ?? 0,
            ':lng' => $lng ?? 0,
            ':nama_file_foto' => $newFileName,
            ':keterangan' => $keterangan,
            ':status_verifikasi' => $statusVerifikasi,
            ':status_kehadiran' => $statusKehadiran
        ]);

        // PERBAIKAN: Cek return value dari execute() untuk memastikan query berhasil.
        if ($isSuccess) {
            $pesanSukses = ($statusVerifikasi === 'Menunggu Verifikasi Admin') 
                ? "Absen sudah terkirim. BKPSDM Kota Pariaman akan melakukan verifikasi bukti absen Anda." 
                : "Absen sudah terkirim.";
            Response::json(true, 200, $pesanSukses, ['waktu' => $waktu]);
        } else {
            if ($uploadPath && file_exists($uploadPath)) {
                unlink($uploadPath); // Hapus foto yang sudah terunggah jika DB gagal
            }
            Response::json(false, 500, "Gagal menyimpan absensi ke database.", ['db_error' => $stmt->errorInfo()]);
        }
    }

    /**
     * Menerima dan menyimpan data absensi dari alur "Absensi Cepat" oleh Admin.
     * Ini adalah fallback jika Worker gagal.
     */
    public function submitCepat() {
        // 1. Validasi token Admin dari header untuk otorisasi
        $adminData = AuthHelper::validateToken();

        // Otorisasi: Pastikan pengguna yang melakukan request memiliki peran 'admin'
        if (!isset($adminData['role']) || !in_array('admin', $adminData['role'])) {
            Response::json(false, 403, "Akses ditolak. Hanya admin yang dapat menggunakan fitur ini.");
            return;
        }

        // 2. Ambil token pegawai dari body request (bukan dari header)
        $userToken = $_POST['user_token'] ?? null;
        if (!$userToken) {
            Response::json(false, 401, "Token pegawai yang diabsenkan tidak ditemukan.");
            return;
        }

        // 3. Validasi token pegawai yang di-scan
        $config = require APP_PATH . '/config/config.php';
        $secretKey = $config['jwt_secret'];
        $pegawaiData = null;
        try {
            $decoded = JWT::decode($userToken, new \Firebase\JWT\Key($secretKey, 'HS256'));
            if (isset($decoded->exp) && $decoded->exp < time()) {
                 Response::json(false, 401, "Token pegawai yang di-scan telah kedaluwarsa.");
                 return;
            }
            $pegawaiData = (array) $decoded->data;
        } catch (\Exception $e) {
            Response::json(false, 401, "Token pegawai yang di-scan tidak valid: " . $e->getMessage());
            return;
        }

        // 4. Ambil sisa data dari request
        $kodeAkses = $_POST['kode_akses'] ?? null;
        $lat = $_POST['lat'] ?? null;
        $lng = $_POST['lng'] ?? null;
        $lokasi = $_POST['lokasi'] ?? null;
        $keterangan = $_POST['keterangan'] ?? null;
        $statusKehadiran = $_POST['status_kehadiran'] ?? 'Hadir';
        $statusVerifikasi = $_POST['status_verifikasi'] ?? 'Terverifikasi Oleh Admin';

        // 5. Validasi input dasar
        if (empty($kodeAkses) || $lat === null || $lng === null || empty($lokasi)) {
            Response::json(false, 400, "Data tidak lengkap untuk Absensi Cepat.");
            return;
        }

        $db = Database::getConnection();
        $newFileName = 'NO_PHOTO_ADMIN_FAST_INPUT.jpg'; // Default untuk absen cepat

        // 6. Dapatkan detail jadwal
        $stmtJadwal = $db->prepare("SELECT judul, kategori FROM app_absensi_jadwal_kegiatan WHERE kode_akses = :kode_akses LIMIT 1");
        $stmtJadwal->execute([':kode_akses' => $kodeAkses]);
        $jadwal = $stmtJadwal->fetch(PDO::FETCH_ASSOC);
        if (!$jadwal) {
            Response::json(false, 404, "Jadwal kegiatan tidak valid atau sudah berakhir.");
            return;
        }

        // 7. UPDATE atau INSERT data absensi
        $now = new DateTime('now', new DateTimeZone('Asia/Jakarta'));
        $waktu = $now->format('Y-m-d H:i:s');

        $nip = $pegawaiData['nip'] ?? null;
        $nama = $pegawaiData['nama'] ?? null;
        $opd = $pegawaiData['opd'] ?? null;
        $jabatan = $pegawaiData['jabatan'] ?? null;

        if (!$nip || !$nama) {
            Response::json(false, 400, "Data NIP atau Nama tidak ditemukan di dalam token pegawai.");
            return;
        }

        $sql = "INSERT INTO app_absensi_data_absensi 
                    (kode_akses, nip, nama_pegawai, opd, jabatan, kategori, waktu, lokasi, lat, lng, nama_file_foto, keterangan, status_verifikasi, status_kehadiran) 
                VALUES 
                    (:kode_akses, :nip, :nama_pegawai, :opd, :jabatan, :kategori, :waktu, :lokasi, :lat, :lng, :nama_file_foto, :keterangan, :status_verifikasi, :status_kehadiran)
                ON DUPLICATE KEY UPDATE
                    waktu = VALUES(waktu), lokasi = VALUES(lokasi), lat = VALUES(lat), lng = VALUES(lng), nama_file_foto = VALUES(nama_file_foto), kategori = VALUES(kategori), keterangan = VALUES(keterangan), status_verifikasi = VALUES(status_verifikasi), status_kehadiran = VALUES(status_kehadiran), nama_pegawai = VALUES(nama_pegawai), opd = VALUES(opd), jabatan = VALUES(jabatan)";

        $stmt = $db->prepare($sql);
        $isSuccess = $stmt->execute([
            ':kode_akses' => $kodeAkses,
            ':nip' => $nip,
            ':nama_pegawai' => $nama,
            ':opd' => $opd,
            ':jabatan' => $jabatan,
            ':kategori' => $jadwal['kategori'],
            ':waktu' => $waktu,
            ':lokasi' => $lokasi,
            ':lat' => $lat,
            ':lng' => $lng,
            ':nama_file_foto' => $newFileName,
            ':keterangan' => $keterangan,
            ':status_verifikasi' => $statusVerifikasi,
            ':status_kehadiran' => $statusKehadiran
        ]);

        if ($isSuccess) {
            Response::json(true, 200, "Absensi Cepat berhasil direkam.", ['waktu' => $waktu]);
        } else {
            Response::json(false, 500, "Gagal menyimpan Absensi Cepat ke database.", ['db_error' => $stmt->errorInfo()]);
        }
    }

    /**
     * Menerima dan menyimpan BATCH data absensi dari Cloudflare Worker.
     */
    public function submitBulk() {
        // 1. Validasi request dari Worker (asumsi secret ada di config)
        $config = require APP_PATH . '/config/config.php';
        $workerSecret = $config['worker_secret'] ?? null;
        $requestSecret = $_SERVER['HTTP_X_WORKER_SECRET'] ?? null;

        if (!$workerSecret || !$requestSecret || $requestSecret !== $workerSecret) {
            Response::json(false, 403, "Akses ditolak. Invalid secret.");
            return;
        }

        // 2. Ambil data JSON dari body request
        $inputJSON = file_get_contents('php://input');
        $absensiBatch = json_decode($inputJSON, true);

        if (empty($absensiBatch) || !is_array($absensiBatch)) {
            Response::json(false, 400, "Data batch tidak valid atau kosong.");
            return;
        }

        $db = Database::getConnection();
        $jwtSecretKey = $config['jwt_secret'];
        $uploadDir = '../uploads/foto_absensi/';

        // Pastikan direktori upload ada
        if (!is_dir($uploadDir) && !mkdir($uploadDir, 0775, true) && !is_dir($uploadDir)) {
            Response::json(false, 500, "Server Error: Gagal membuat direktori upload.");
            return;
        }

        $successCount = 0;
        $failureCount = 0;
        $errorMessages = [];

        try {
            // Siapkan statement di luar loop untuk efisiensi.
            // Logika ON DUPLICATE KEY UPDATE sudah benar untuk menangani data yang di-pre-seed.
            $sql = "INSERT INTO app_absensi_data_absensi 
                        (kode_akses, nip, nama_pegawai, opd, jabatan, kategori, waktu, lokasi, lat, lng, nama_file_foto, keterangan, status_verifikasi, status_kehadiran) 
                    VALUES 
                        (:kode_akses, :nip, :nama_pegawai, :opd, :jabatan, :kategori, :waktu, :lokasi, :lat, :lng, :nama_file_foto, :keterangan, :status_verifikasi, :status_kehadiran)
                    ON DUPLICATE KEY UPDATE
                        waktu = IF(status_kehadiran = 'Alpa', VALUES(waktu), waktu),
                        lokasi = IF(status_kehadiran = 'Alpa', VALUES(lokasi), lokasi),
                        lat = IF(status_kehadiran = 'Alpa', VALUES(lat), lat),
                        lng = IF(status_kehadiran = 'Alpa', VALUES(lng), lng),
                        nama_file_foto = IF(status_kehadiran = 'Alpa', VALUES(nama_file_foto), nama_file_foto),
                        keterangan = IF(status_kehadiran = 'Alpa', VALUES(keterangan), keterangan),
                        status_verifikasi = IF(status_kehadiran = 'Alpa', VALUES(status_verifikasi), status_verifikasi),
                        status_kehadiran = IF(status_kehadiran = 'Alpa', VALUES(status_kehadiran), status_kehadiran),
                        nama_pegawai = VALUES(nama_pegawai),
                        opd = VALUES(opd),
                        jabatan = VALUES(jabatan),
                        kategori = VALUES(kategori)";
            $stmt = $db->prepare($sql);

            foreach ($absensiBatch as $item) {
                $uploadPath = null; // Reset untuk setiap item
                try {
                    // PERBAIKAN: Mulai transaksi untuk setiap item.
                    // Ini memastikan setiap data yang berhasil akan di-commit secara eksplisit, mengatasi masalah jika autocommit nonaktif.
                    $db->beginTransaction();

                    // PERBAIKAN: Hasilkan timestamp baru untuk setiap item di dalam loop.
                    // Ini memastikan setiap catatan absensi mendapatkan waktu yang akurat saat diproses.
                    $waktu = (new DateTime('now', new DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');

                    $payload = $item['body'] ?? null;
                    if (!$payload) {
                        throw new \Exception("Payload kosong.");
                    }

                    // Dapatkan data pegawai dari JWT
                    $decoded = JWT::decode($payload['jwt_token'], new Key($jwtSecretKey, 'HS256'));
                    $pegawaiData = (array) $decoded->data;
                    
                    $nip = null; $nama = null; $opd = null; $jabatan = null;
                    // Payload data dari token sekarang selalu dalam format objek
                    $nip = $pegawaiData['nip'] ?? null;
                    $nama = $pegawaiData['nama'] ?? null;
                    $opd = $pegawaiData['opd'] ?? null;
                    $jabatan = $pegawaiData['jabatan'] ?? null;

                    // Validasi data penting dari payload
                    $kodeAkses = $payload['kode_akses'] ?? null;
                    $kategori = $payload['kategori'] ?? null; // Ambil kategori dari payload

                    if (empty($kodeAkses) || empty($kategori) || empty($nip) || empty($nama)) {
                        throw new \Exception("Data esensial (kode, kategori, nip, nama) tidak lengkap dalam payload.");
                    }

                    // Proses foto base64
                    $fotoBase64 = $payload['foto_base64'] ?? null;
                    $newFileName = 'NO_PHOTO_ADMIN_FAST_INPUT.jpg'; // Default filename
                    $uploadPath = null; // Tidak ada file yang di-upload secara default

                    if (empty($fotoBase64)) {
                        // Jika foto kosong (seperti dari alur admin cepat), gunakan nama file default dan lanjutkan
                    } else {
                        // Jika ada foto, proses seperti biasa
                        $timestamp = time();
                        $ext = 'jpg';
                        if (strpos($data[0] ?? '', 'application/pdf') !== false) {
                            $ext = 'pdf';
                        }
                        $randomStr = bin2hex(random_bytes(4));
                        $newFileName = $nip . '_' . $kodeAkses . '_' . $timestamp . '_' . $randomStr . '.' . $ext;
                        $uploadPath = $uploadDir . $newFileName;
                        $data = explode(',', $fotoBase64);
                        $fotoData = base64_decode($data[1] ?? '');
                        if ($fotoData === false || !file_put_contents($uploadPath, $fotoData)) {
                            throw new \Exception("Gagal menyimpan file foto untuk NIP: " . $nip);
                        }
                    }
                    $statusVerifikasi = $payload['status_verifikasi'] ?? 'Terverifikasi Sistem';
                    $statusKehadiran = $payload['status_kehadiran'] ?? 'Hadir';

                    // Eksekusi query yang sudah di-prepare
                    $isSuccess = $stmt->execute([
                        ':kode_akses' => $kodeAkses,
                        ':nip' => $nip,
                        ':nama_pegawai' => $nama,
                        ':opd' => $opd,
                        ':jabatan' => $jabatan,
                        ':kategori' => $kategori, // Gunakan kategori dari payload
                        ':waktu' => $waktu,
                        ':lokasi' => $payload['lokasi'] ?? 'Lokasi tidak terdeteksi',
                        ':lat' => $payload['lat'] ?? null, // PERBAIKAN: Tangani jika lat tidak ada
                        ':lng' => $payload['lng'] ?? null, // PERBAIKAN: Tangani jika lng tidak ada
                        ':nama_file_foto' => $newFileName,
                        ':keterangan' => $payload['keterangan'] ?? '-',
                        ':status_verifikasi' => $statusVerifikasi,
                        ':status_kehadiran' => $statusKehadiran
                    ]);

                    // PERBAIKAN: Cek return value dari execute().
                    // `execute()` mengembalikan `false` jika query gagal, tapi mungkin tidak melempar Exception
                    // tergantung pada mode error PDO. Pengecekan eksplisit ini akan menangkap error tersebut.
                    if (!$isSuccess) {
                        throw new \Exception("Eksekusi database gagal: " . ($stmt->errorInfo()[2] ?? "Unknown error"));
                    }

                    // Commit transaksi jika eksekusi berhasil.
                    $db->commit();
                    $successCount++;

                } catch (\Exception $e) {
                    // Jika terjadi error, rollback transaksi untuk item ini.
                    if ($db->inTransaction()) {
                        $db->rollBack();
                    }

                    $failureCount++;
                    $errorMessages[] = "Item ID " . ($item['id'] ?? 'unknown') . ": " . $e->getMessage();
                    LogHelper::write('error', "Bulk Absen Error: " . $e->getMessage(), ['item' => $item]);
                    // Hapus file yang mungkin sudah dibuat untuk item yang gagal ini
                    if ($uploadPath && file_exists($uploadPath)) {
                        unlink($uploadPath);
                    }
                }
            }

            // Selalu kembalikan response sukses ke Worker agar batch tidak di-retry.
            $message = "$successCount data berhasil diproses.";
            if ($failureCount > 0) $message .= " $failureCount data gagal.";

            // Gunakan 207 Multi-Status jika ada kegagalan, agar lebih semantik.
            $statusCode = ($failureCount > 0) ? 207 : 200;
            Response::json(true, $statusCode, $message, ['errors' => $errorMessages]);
        } catch (\Exception $e) {
            // Ini adalah catch untuk error yang tidak terduga di luar loop (misal: koneksi DB putus total)
            // Log seluruh batch data yang gagal diproses untuk memastikan tidak ada data yang hilang.
            LogHelper::write('critical', "Bulk Absen FATAL Error: " . $e->getMessage(), ['failed_batch' => $absensiBatch]);
            Response::json(false, 500, "Terjadi error fatal saat memproses batch: " . $e->getMessage());
        }
    }
}