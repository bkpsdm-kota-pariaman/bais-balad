const FOLDER_ID = "1mPos1bPu9g__245mvGBM3WouTGFM5eRk";

function copyAndRenameKeepFormat() {
    // ====== CONFIG ======
    const sheetName = 'data_absensi';
    const linkColumn = 10;       // kolom link foto (H = 8)
    const kodeAksesColumn = 2;  // kolom G
    const nipColumn = 3;        // kolom D
    const statusColumn = 11;    // kolom J untuk status
    const startRow = 2;         // baris pertama data
    const TARGET_FOLDER_ID = '1Z1Kg_El5gnFEdu8d6h-PfRFq5KPMAJoG'; // <-- ganti dengan folder ID Anda
    const MAX_ROWS_PER_RUN = 1000; // batasi per run untuk menghindari timeout
    // ======================

    if (TARGET_FOLDER_ID === 'PASTE_FOLDER_ID_HERE') {
        SpreadsheetApp.getUi().alert('Silakan isi TARGET_FOLDER_ID di skrip sebelum menjalankan.');
        return;
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
        SpreadsheetApp.getUi().alert('Sheet "' + sheetName + '" tidak ditemukan.');
        return;
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < startRow) {
        SpreadsheetApp.getUi().alert('Tidak ada data pada sheet.');
        return;
    }

    const totalRows = lastRow - startRow + 1;
    const rowsToProcess = Math.min(totalRows, MAX_ROWS_PER_RUN);
    const data = sheet.getRange(startRow, 1, rowsToProcess, Math.max(linkColumn, kodeAksesColumn, nipColumn, statusColumn)).getValues();

    let targetFolder;
    try {
        targetFolder = DriveApp.getFolderById(TARGET_FOLDER_ID);
    } catch (e) {
        SpreadsheetApp.getUi().alert('Gagal akses folder target. Periksa FOLDER_ID dan izin Anda.');
        return;
    }

    let nameCounts = {}; // untuk menghindari duplikat nama dalam run ini
    let processed = 0;
    let skipped = 0;
    let errors = [];

    Logger.log('--- Mulai proses: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss') + ' ---');

    for (let i = 0; i < data.length; i++) {
        const rowIndex = startRow + i;
        const row = data[i];
        const statusCell = (row[statusColumn - 1] || '').toString().trim();
        if (statusCell.toUpperCase().startsWith('DONE')) {
            skipped++;
            Logger.log('Row ' + rowIndex + ': SKIPPED (already DONE)');
            continue;
        }

        const url = (row[linkColumn - 1] || '').toString().trim();
        const kode = (row[kodeAksesColumn - 1] || '').toString().trim();
        const nip = (row[nipColumn - 1] || '').toString().trim();

        if (!url) {
            sheet.getRange(rowIndex, statusColumn).setValue('SKIPPED: no link');
            skipped++;
            Logger.log('Row ' + rowIndex + ': SKIPPED (no link)');
            continue;
        }

        const match = url.match(/[-\w]{25,}/);
        if (!match) {
            const msg = 'ERROR: invalid URL';
            sheet.getRange(rowIndex, statusColumn).setValue(msg);
            errors.push('Baris ' + rowIndex + ': ID tidak ditemukan');
            Logger.log('Row ' + rowIndex + ': ' + msg + ' | URL: ' + url);
            continue;
        }
        const fileId = match[0];

        try {
            const file = DriveApp.getFileById(fileId);
            // ambil ekstensi asli dari nama file sumber
            const originalName = file.getName() || '';
            let ext = '';
            const dotPos = originalName.lastIndexOf('.');
            if (dotPos > -1 && dotPos < originalName.length - 1) {
                ext = originalName.substring(dotPos + 1);
            } else {
                // fallback jika tidak ada ekstensi, gunakan mimeType mapping sederhana
                const mime = file.getMimeType();
                if (mime === 'image/png') ext = 'png';
                else if (mime === 'image/jpeg') ext = 'jpg';
                else if (mime === 'image/heic' || mime === 'image/heif') ext = 'heic';
                else ext = 'bin';
            }

            // buat nama file aman tanpa mengubah ekstensi
            let baseName = (kode || 'KODE') + '_' + (nip || 'NIP');
            baseName = baseName.replace(/[^a-zA-Z0-9_\-]/g, '_');

            // hindari duplikat nama di folder target
            if (!nameCounts[baseName]) nameCounts[baseName] = 0;
            nameCounts[baseName]++;
            let finalName = baseName + (nameCounts[baseName] > 1 ? ('_' + nameCounts[baseName]) : '') + (ext ? ('.' + ext) : '');

            // salin file asli dengan nama baru (format tetap sama)
            const copiedFile = file.makeCopy(finalName, targetFolder);

            // tulis status dengan timestamp
            const ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
            sheet.getRange(rowIndex, statusColumn).setValue('DONE — ' + ts);

            // log sukses
            Logger.log('Row ' + rowIndex + ': DONE | NewName: ' + finalName + ' | URL: ' + copiedFile.getUrl() + ' | Time: ' + ts);

            processed++;
        } catch (e) {
            const errMsg = 'ERROR: ' + (e.message || e.toString());
            sheet.getRange(rowIndex, statusColumn).setValue(errMsg);
            errors.push('Baris ' + rowIndex + ': ' + errMsg);
            Logger.log('Row ' + rowIndex + ': ' + errMsg + ' | fileId: ' + fileId);
        }
    }

    const endTs = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    Logger.log('--- Selesai proses: ' + endTs + ' ---');
    Logger.log('Summary: Processed=' + processed + ' | Skipped=' + skipped + ' | Errors=' + errors.length);

    const summary = 'Selesai. Diproses: ' + processed + '. Dilewati: ' + skipped + '. Errors: ' + errors.length + '.\nFolder target: ' + targetFolder.getUrl();
    SpreadsheetApp.getUi().alert(summary);
}

// Fungsi untuk menangani permintaan (request) metode GET dari frontend
// ---------------------------------------------------------------
// MODE HYBRID:
//   - Jika ada ?action=getOpd  → kembalikan JSON daftar OPD (API)
//   - Jika tidak ada action    → sajikan halaman HTML absensi cadangan
//     sebagai LAST RESORT saat server PHP / Worker down.
//
// Syarat: file 'index.html' harus ada di dalam project GAS ini
// (upload/copy isi index.html ke editor Apps Script sebagai file .html)
// ---------------------------------------------------------------
function doGet(e) {
    // Endpoint API: ambil daftar OPD
    if (e.parameter && e.parameter.action === 'getOpd') {
        const opdList = getOpdList();
        return ContentService.createTextOutput(JSON.stringify({ status: true, data: opdList }))
            .setMimeType(ContentService.MimeType.JSON);
    }

    // Default: sajikan halaman HTML absensi cadangan
    // HtmlService secara otomatis meng-escape <?= ?> dan tag script
    try {
        return HtmlService.createHtmlOutputFromFile('index')
            .setTitle('BAIS Pariaman \u2014 Absensi Cadangan')
            .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
            .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, minimal-ui');
    } catch (htmlErr) {
        // Fallback teks jika file index.html belum ada di project GAS
        return ContentService.createTextOutput(
            'BAIS Pariaman Server Cadangan Aktif.\n' +
            'Upload file index.html ke project GAS ini agar halaman absensi tampil.\n' +
            'Error: ' + htmlErr.toString()
        );
    }
}

// Fungsi bantu untuk frontend mendapatkan URL script secara dinamis
function getScriptUrl() {
    return ScriptApp.getService().getUrl();
}

// Fungsi untuk menangani pengiriman form absensi (POST request)
function doPost(e) {
    try {
        const data = JSON.parse(e.postData.contents);

        // -------------------------------------------------------
        // ROUTING: Tentukan action berdasarkan field 'action'
        // Jika tidak ada action, anggap sebagai submit absen (legacy)
        // -------------------------------------------------------
        if (data.action === 'loginAsn') {
            const result = loginAsn(data);
            return ContentService.createTextOutput(JSON.stringify(result))
                .setMimeType(ContentService.MimeType.JSON);
        }

        // Default: proses absensi cadangan
        const result = prosesAbsen(data);
        return ContentService.createTextOutput(JSON.stringify(result))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
        return ContentService.createTextOutput(JSON.stringify({ status: false, message: 'Gagal memproses data: ' + error.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

// ============================================================
// LOGIN PEGAWAI (FALLBACK DARI AuthController::loginAsn)
// Output format HARUS sama persis dengan PHP:
//   { status, message, data: { token, user, pegawai_to_cache } }
// Autentikasi: NIP + NIK dicek ke sheet 'data_pegawai'
// ============================================================

/**
 * Memproses login pegawai ASN.
 * Setara dengan AuthController::loginAsn() di PHP.
 *
 * @param {Object} data - Payload JSON: { nip, nik }
 * @returns {Object} Response dengan format sama persis seperti PHP
 */
function loginAsn(data) {
    try {
        // 1. Validasi input
        const nip = (data.nip || '').toString().trim();
        const nik = (data.nik || '').toString().trim();

        if (!nip || !nik) {
            return { status: false, code: 400, message: 'NIP dan NIK wajib diisi', data: null };
        }

        // 2. Cari pegawai di sheet 'data_pegawai'
        //    Urutan kolom sheet (baris 1 = header):
        //    A(1)=nama_pegawai, B(2)=nip, C(3)=perangkat_daerah, D(4)=jabatan, E(5)=nik, F(6)=jenis_asn
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const sheetPegawai = ss.getSheetByName('data_pegawai');

        if (!sheetPegawai) {
            return { status: false, code: 500, message: 'Sheet data_pegawai tidak ditemukan. Hubungi admin.', data: null };
        }

        const lastRow = sheetPegawai.getLastRow();
        if (lastRow < 2) {
            return { status: false, code: 401, message: 'NIP atau NIK tidak ditemukan atau tidak cocok', data: null };
        }

        // Ambil semua data sekaligus untuk efisiensi (6 kolom A-F)
        const dataPegawai = sheetPegawai.getRange(2, 1, lastRow - 1, 6).getValues();

        let pegawaiDitemukan = null;
        for (let i = 0; i < dataPegawai.length; i++) {
            const rowNip = (dataPegawai[i][1] || '').toString().trim(); // kolom B
            const rowNik = (dataPegawai[i][4] || '').toString().trim(); // kolom E

            if (rowNip === nip && rowNik === nik) {
                pegawaiDitemukan = {
                    nip:              rowNip,
                    nik:              rowNik,
                    nama_pegawai:     (dataPegawai[i][0] || '').toString().trim(), // kolom A
                    perangkat_daerah: (dataPegawai[i][2] || '').toString().trim(), // kolom C
                    jabatan:          (dataPegawai[i][3] || '').toString().trim(), // kolom D
                    jenis_asn:        (dataPegawai[i][5] || '').toString().trim()  // kolom F
                };
                break;
            }
        }

        // 3. Jika tidak ditemukan
        if (!pegawaiDitemukan) {
            return { status: false, code: 401, message: 'NIP atau NIK tidak ditemukan atau tidak cocok', data: null };
        }

        // 4. Tentukan role — GAS tidak bisa akses tabel admin,
        //    default role adalah ['asn']. Admin harus login via Worker/PHP.
        const roles = ['asn'];

        // 5. Buat JWT token (HS256) dengan payload sama persis seperti PHP
        //    Berlaku 30 hari (sesuai PHP: 3600 * 24 * 30 detik)
        const issuedAt   = Math.floor(Date.now() / 1000);           // epoch detik
        const expiration = issuedAt + (3600 * 24 * 30);             // +30 hari

        const jwtPayload = {
            iat: issuedAt,
            exp: expiration,
            iss: 'bais-pariaman-apps',
            data: {
                nip:       pegawaiDitemukan.nip,
                nama:      pegawaiDitemukan.nama_pegawai,
                opd:       pegawaiDitemukan.perangkat_daerah,
                jabatan:   pegawaiDitemukan.jabatan,
                role:      roles,
                jenis_asn: pegawaiDitemukan.jenis_asn
            }
        };

        const jwtToken = signJwt(jwtPayload, JWT_SECRET_KEY);

        // 6. Susun response IDENTIK dengan output PHP AuthController::loginAsn()
        const responseData = {
            token: jwtToken,
            user: {
                nama:    pegawaiDitemukan.nama_pegawai,
                jabatan: pegawaiDitemukan.jabatan,
                opd:     pegawaiDitemukan.perangkat_daerah
            },
            // Diterima oleh Worker untuk disimpan ke KV (jika ada sinkronisasi)
            pegawai_to_cache: {
                nip:              pegawaiDitemukan.nip,
                nik:              pegawaiDitemukan.nik,
                nama_pegawai:     pegawaiDitemukan.nama_pegawai,
                perangkat_daerah: pegawaiDitemukan.perangkat_daerah,
                jabatan:          pegawaiDitemukan.jabatan,
                role:             roles,
                jenis_asn:        pegawaiDitemukan.jenis_asn
            }
        };

        return { status: true, code: 200, message: 'Login Berhasil', data: responseData };

    } catch (error) {
        Logger.log('loginAsn Error: ' + error.toString());
        return { status: false, code: 500, message: 'Terjadi kesalahan pada server cadangan: ' + error.toString(), data: null };
    }
}

// ============================================================
// JWT HELPER — HS256 signing tanpa library eksternal
// GAS tidak memiliki library JWT bawaan, sehingga implementasi
// ini dilakukan manual menggunakan Utilities.computeHmacSha256Signature
// ============================================================

/**
 * PENTING: Isi JWT_SECRET_KEY dengan nilai yang SAMA PERSIS
 * dengan 'jwt_secret' di file config.php pada server PHP.
 * Kerahasiaan kunci ini WAJIB dijaga — jangan commit ke publik.
 */
const JWT_SECRET_KEY = ''; // <-- WAJIB DIISI

/**
 * Membuat JWT token dengan algoritma HS256.
 * Kompatibel dengan Firebase JWT PHP library (format Base64URL).
 *
 * @param {Object} payload - Data claim JWT
 * @param {string} secret  - Secret key (harus sama dengan jwt_secret di PHP)
 * @returns {string} JWT token dalam format header.payload.signature
 */
function signJwt(payload, secret) {
    const header = { alg: 'HS256', typ: 'JWT' };

    const base64UrlEncode = (obj) => {
        const json = JSON.stringify(obj);
        // Encode ke Base64 menggunakan Utilities GAS, lalu ubah ke Base64URL
        return Utilities.base64EncodeWebSafe(json)
                         .replace(/=+$/, ''); // Hapus padding '='
    };

    const encodedHeader  = base64UrlEncode(header);
    const encodedPayload = base64UrlEncode(payload);
    const signingInput   = encodedHeader + '.' + encodedPayload;

    // HMAC-SHA256 signing
    const signatureBytes = Utilities.computeHmacSha256Signature(signingInput, secret);
    const signature = Utilities.base64EncodeWebSafe(signatureBytes).replace(/=+$/, '');

    return signingInput + '.' + signature;
}


function prosesAbsen(data) {
    try {
        // ==========================================
        // 0. MITIGASI KEAMANAN (ANTI TEMBAK API)
        // ==========================================
        const clientTs = data._ts;
        const clientToken = data._token;

        // 1. Tolak jika tidak ada token sama sekali
        if (!clientTs || !clientToken) {
            return { status: false, message: 'Akses ditolak: Permintaan tidak sah (Gunakan Form Resmi). Debug Action: ' + data.action + ' | Payload: ' + JSON.stringify(data) };
        }

        // 2. Verifikasi kesesuaian Token dengan format Secret Key dari Frontend
        // Harus sinkron dengan kata kunci di frontend "_BAIS_PARIAMAN_SECRET_KEY_2026"
        const expectedToken = Utilities.base64Encode(clientTs + "_BAIS_PARIAMAN_SECRET_KEY_2026");
        if (clientToken !== expectedToken) {
            return { status: false, message: 'Akses ditolak: Token keamanan tidak valid.' };
        }

        // 3. Verifikasi Kadaluarsa Waktu (Maksimal 5 Menit dari waktu buka aplikasi)
        const nowMs = new Date().getTime();
        const timeDiffMs = nowMs - parseInt(clientTs);

        // 300000 ms = 5 Menit
        if (timeDiffMs > 300000 || timeDiffMs < -60000) {
            return { status: false, message: 'Akses ditolak: Sesi permintaan Anda kedaluwarsa. Silakan muat ulang (refresh) halaman aplikasi.' };
        }
        // ==========================================

        // 1. Dekode dan simpan gambar ke Google Drive
        const imageString = data.fotoData.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
        const imageBlob = Utilities.base64Decode(imageString);

        // Format nama file: NIP_Nama_Tanggal_Jam.jpg
        const timestamp = Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd_HHmmss");
        const fileName = `${data.nip}_${data.nama}_${timestamp}.jpg`;

        const blob = Utilities.newBlob(imageBlob, 'image/jpeg', fileName);
        const folder = DriveApp.getFolderById(FOLDER_ID);
        const file = folder.createFile(blob);
        const fileUrl = file.getUrl();

        // 2. Simpan data ke Google Spreadsheet aktif
        const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

        let sheet = spreadsheet.getSheetByName("data_absensi");
        if (!sheet) {
            throw new Error("Sheet 'data_absensi' tidak ditemukan di Spreadsheet.");
        }

        // Format waktu Asia/Jakarta: 2026-12-01 10:30:60
        const waktu = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd HH:mm:ss");

        // Susunan Kolom disesuaikan dengan struktur Spreadsheet
        sheet.appendRow([
            waktu,
            data.kode,
            data.nip,
            data.nama,
            data.jabatan,
            data.opd,
            data.lokasi,
            data.lat,
            data.lng,
            fileUrl,
            data.keterangan
        ]);

        return { 
            status: true, 
            message: 'Data Absensi Cadangan berhasil dikirim!',
            data: {
                waktu: waktu,
                nip: data.nip,
                nama: data.nama,
                fileUrl: fileUrl
            }
        };

    } catch (error) {
        return { status: false, message: error.toString() };
    }
}

function getOpdList() {
    try {
        const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
        const sheet = spreadsheet.getSheetByName("list_opd");

        if (!sheet) return [];

        const lastRow = sheet.getLastRow();
        if (lastRow < 2) return [];

        const data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        const opdList = data.map(row => row[0]).filter(val => val.toString().trim() !== "");

        return opdList;
    } catch (error) {
        return [];
    }
}