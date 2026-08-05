/**
 * BAIS PARIAMAN - ABSENSI CADANGAN V2
 * 
 * Script ini digunakan untuk menginisialisasi (generate) struktur database 
 * di Google Spreadsheet agar sesuai dengan struktur tabel SQL utama.
 * 
 * Cara Penggunaan:
 * 1. Buka file Google Spreadsheet baru.
 * 2. Masuk ke Extensions > Apps Script.
 * 3. Paste kode ini.
 * 4. Jalankan fungsi `setupDatabase()`.
 * 5. Berikan izin otorisasi yang diminta.
 */

function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Definisi struktur tabel berdasarkan database/structure.sql
  const schema = {
    "app_absensi_data_absensi": [
      "id", "waktu", "kode_akses", "nip", "nama_pegawai", 
      "jabatan", "opd", "lokasi", "lat", "lng", 
      "nama_file_foto", "kategori", "keterangan", 
      "status_verifikasi", "status_kehadiran"
    ],
    "app_absensi_data_admin": [
      "username", "password"
    ],
    "app_absensi_data_pegawai": [
      "nama_pegawai", "nip", "perangkat_daerah", "jabatan", 
      "nik", "jenis_asn", "last_login", "kv_sync_status", "updated_at"
    ],
    "app_absensi_jadwal_kegiatan": [
      "timestamp", "kode_akses", "judul", "kategori", 
      "tanggal", "jam_mulai", "jam_selesai", "koordinat", 
      "radius_meter", "aktifkan_antrian", "kv_sync_status"
    ],
    "app_absensi_kegiatan_target_opd": [
      "kode_akses", "nama_opd"
    ]
  };

  // Iterasi melalui schema untuk membuat/menyesuaikan sheet
  for (const tableName in schema) {
    const columns = schema[tableName];
    let sheet = ss.getSheetByName(tableName);
    
    // Jika sheet belum ada, buat baru
    if (!sheet) {
      sheet = ss.insertSheet(tableName);
      Logger.log(`[CREATED] Sheet: ${tableName}`);
    } else {
      Logger.log(`[EXISTS] Sheet: ${tableName} sudah ada. Menyesuaikan kolom...`);
    }

    // Set Header di baris pertama
    const headerRange = sheet.getRange(1, 1, 1, columns.length);
    headerRange.setValues([columns]);
    
    // Format Header (Bold & Background Color)
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#f3f4f6");
    
    // Freeze baris pertama agar header selalu terlihat saat di-scroll
    sheet.setFrozenRows(1);
    
    // Sesuaikan lebar kolom agar lebih mudah dibaca
    for (let i = 1; i <= columns.length; i++) {
      sheet.autoResizeColumn(i);
    }
  }

  // Menghapus sheet default "Sheet1" jika masih ada (opsional)
  const defaultSheet = ss.getSheetByName("Sheet1");
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
    Logger.log("[DELETED] Sheet bawaan 'Sheet1' dihapus.");
  }

  // Tampilkan notifikasi ke pengguna
  SpreadsheetApp.getUi().alert("Setup Selesai!", "Struktur database (5 tabel) berhasil digenerate di Spreadsheet ini.", SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * FUNGSI HELPER: Insert Data dengan Auto-Increment ID
 * 
 * Karena Google Sheets tidak memiliki fitur AUTO_INCREMENT bawaan seperti SQL,
 * kita perlu membacanya secara manual. Untuk mencegah data bertabrakan 
 * jika ada 2 orang absen di detik yang sama, kita gunakan LockService.
 * 
 * @param {string} sheetName - Nama sheet tujuan (contoh: "app_absensi_data_absensi")
 * @param {Array} rowData - Array data mulai dari kolom KEDUA (tanpa ID)
 * @returns {number|null} - ID yang baru saja dibuat, atau null jika gagal
 */
function insertDataWithAutoId(sheetName, rowData) {
  const lock = LockService.getScriptLock();
  
  // Tunggu maksimal 10 detik jika ada proses lain yang sedang menulis data
  if (!lock.tryLock(10000)) {
    Logger.log("Sistem sibuk, gagal mendapatkan lock.");
    return null; 
  }

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sheet) throw new Error("Sheet tidak ditemukan: " + sheetName);

    const lastRow = sheet.getLastRow();
    let newId = 1;

    // Jika sudah ada data (baris > 1 karena baris 1 adalah header)
    if (lastRow > 1) {
      // Ambil nilai ID dari baris terakhir (kolom A / ke-1)
      const lastId = parseInt(sheet.getRange(lastRow, 1).getValue(), 10);
      if (!isNaN(lastId)) {
        newId = lastId + 1;
      }
    }

    // Gabungkan newId ke posisi paling awal (index 0) di rowData
    const finalData = [newId, ...rowData];
    
    // Tulis ke baris baru
    sheet.appendRow(finalData);
    
    return newId;
  } catch (error) {
    Logger.log("Error insert data: " + error.message);
    return null;
  } finally {
    // Selalu lepaskan kunci (lock) setelah selesai agar antrian lain bisa masuk
    lock.releaseLock();
  }
}

// =========================================================================
// SISTEM AUTENTIKASI: JSON Web Token (JWT)
// Karena GAS tidak memiliki library JWT bawaan, kita membuatnya secara manual
// menggunakan HMAC SHA256.
// =========================================================================

// PENTING: Ganti secret ini dengan kunci yang panjang dan rumit di server produksi
const JWT_SECRET = "BAIS_BALAD_SUPER_SECRET_KEY_V2_2026_!@#";

/**
 * Membuat (Generate) JWT Token
 * 
 * @param {Object} payload - Data yang ingin dimasukkan (misal: { nip: "123", role: "ASN" })
 * @param {number} expiresInSec - Masa berlaku token dalam detik (default: 86400 detik = 24 jam)
 * @returns {string} - String JWT Token lengkap (Header.Payload.Signature)
 */
function signJWT(payload, expiresInSec = 86400) {
  const header = {
    alg: "HS256",
    typ: "JWT"
  };

  // Tambahkan timestamp Issued At (iat) dan Expiration (exp)
  const now = Math.floor(Date.now() / 1000);
  payload.iat = now;
  payload.exp = now + expiresInSec;

  // Encode Header & Payload menggunakan Base64WebSafe (tanpa tanda sama dengan "=" di akhir)
  const encodedHeader = Utilities.base64EncodeWebSafe(JSON.stringify(header)).replace(/=+$/, '');
  const encodedPayload = Utilities.base64EncodeWebSafe(JSON.stringify(payload)).replace(/=+$/, '');
  
  // Buat Signature
  const toSign = encodedHeader + "." + encodedPayload;
  const signatureBytes = Utilities.computeHmacSha256Signature(toSign, JWT_SECRET);
  const encodedSignature = Utilities.base64EncodeWebSafe(signatureBytes).replace(/=+$/, '');
  
  // Gabungkan ketiganya
  return toSign + "." + encodedSignature;
}

/**
 * Memverifikasi JWT Token
 * 
 * @param {string} token - Token JWT (biasanya dari header Authorization: Bearer <token>)
 * @returns {Object|null} - Mengembalikan Object payload jika valid, atau null jika tidak valid/expired
 */
function verifyJWT(token) {
  try {
    if (!token) return null;
    
    // Hapus kata "Bearer " jika disertakan
    if (token.toLowerCase().startsWith("bearer ")) {
      token = token.substring(7);
    }
    
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const encodedHeader = parts[0];
    const encodedPayload = parts[1];
    const signature = parts[2];
    
    // 1. Verifikasi Keaslian Signature (Apakah token dipalsukan?)
    const toSign = encodedHeader + "." + encodedPayload;
    const expectedSignatureBytes = Utilities.computeHmacSha256Signature(toSign, JWT_SECRET);
    const encodedExpectedSignature = Utilities.base64EncodeWebSafe(expectedSignatureBytes).replace(/=+$/, '');
    
    if (signature !== encodedExpectedSignature) {
      return null; // Signature tidak cocok (Token telah dimanipulasi!)
    }
    
    // 2. Decode Payload
    const decodedBytes = Utilities.base64DecodeWebSafe(encodedPayload);
    const payloadString = Utilities.newBlob(decodedBytes).getDataAsString();
    const decodedPayload = JSON.parse(payloadString);
    
    // 3. Verifikasi Kedaluwarsa (Expiration)
    const now = Math.floor(Date.now() / 1000);
    if (decodedPayload.exp && decodedPayload.exp < now) {
      return null; // Token sudah kedaluwarsa
    }
    
    return decodedPayload; // Token Valid, kembalikan isinya
  } catch (error) {
    Logger.log("Error verify JWT: " + error.message);
    return null; // Kesalahan format parsing
  }
}