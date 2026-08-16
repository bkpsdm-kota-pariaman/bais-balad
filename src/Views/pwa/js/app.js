// js/app.js

const ORIGIN_SERVER_URL = "https://api-esdm.pariamankota.go.id/beta-bais-pariaman";
const API_BASE_URL = `${ORIGIN_SERVER_URL}/api`;
const APP_VERSION = 'v6.1.74'; // <-- EDIT VERSI APLIKASI SECARA MANUAL DI SINI

/**
 * =================================================================
 * PENGATURAN LINGKUNGAN APLIKASI (PWA)
 * =================================================================
 * Ubah ke 'beta' untuk aplikasi versi pengembangan/salinan.
 */
const APP_ENV = 'beta'; // 'production' atau 'beta'

const WORKER_URL = APP_ENV === 'production' 
    ? "https://absensi-kegiatan-asn-worker.bidpp-bkpsdm.workers.dev" 
    : "https://absensi-kegiatan-asn-worker-dev.bidpp-bkpsdm.workers.dev";

let html5QrCode = null;
let currentJadwal = null;
let videoStream = null;
let isLuarRadius = false;
let isTerlambat = false;
let deferredPrompt = null;

/**
 * Memigrasikan data dari localStorage (sistem lama) ke localForage (sistem baru).
 * Fungsi ini hanya berjalan sekali jika data lama ditemukan dan data baru belum ada.
 */
async function migrateStorage() {
    // Jika token sudah ada di localForage, tidak perlu migrasi.
    if (await localforage.getItem("asn_jwt_token")) {
        return;
    }

    // Cek apakah ada token di localStorage lama.
    const oldToken = localStorage.getItem("asn_jwt_token");
    if (oldToken) {
        console.log("Token lama ditemukan di localStorage, memigrasikan ke localForage...");
        try {
            // Pindahkan token
            await localforage.setItem("asn_jwt_token", oldToken);

            // Pindahkan data lain jika ada
            const keysToMigrate = ['riwayat_absen', 'list_opd', 'opd_cache_version'];
            for (const key of keysToMigrate) {
                const oldData = localStorage.getItem(key);
                if (oldData) {
                    try {
                        // Coba parse sebagai JSON, jika gagal, simpan sebagai string biasa (untuk opd_cache_version)
                        await localforage.setItem(key, JSON.parse(oldData));
                    } catch (e) {
                        await localforage.setItem(key, oldData);
                    }
                }
            }

            // Hapus semua data lama dari localStorage
            ['asn_jwt_token', 'riwayat_absen', 'list_opd', 'opd_cache_version'].forEach(k => localStorage.removeItem(k));
            console.log("Migrasi selesai, data lama dari localStorage telah dihapus.");
        } catch (e) {
            console.error("Gagal memigrasikan token:", e);
        }
    }
}

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
});
let userQrCodeInstance = null; // Untuk QR Code di modal
let qrCountdownInterval = null; // Untuk timer countdown QR
// State untuk alur absensi cepat admin
let adminCepatState = {
    jadwal: null,
    scanner: null
    // Properti untuk menyimpan parameter dari UI Absen Cepat
    // status_kehadiran: null,
    // status_verifikasi: null,
    // keterangan: null
};
let isAbsenCepatMode = false;
let isProcessingScan = false;

/**
 * =================================================================
 * Menampilkan dialog konfirmasi kepada pengguna untuk mengaktifkan service worker baru.
 * @param {ServiceWorker} newWorker - Objek service worker yang baru.
 */
function showUpdatePrompt(newWorker) {
    // Sembunyikan notifikasi toast "mengunduh" jika masih ada.
    if (window.updateToast) {
        window.updateToast.close();
        window.updateToast = null;
    }

    Swal.fire({
        title: 'Pembaruan Tersedia!',
        html: "Versi baru aplikasi telah siap. <br><strong>Muat ulang untuk mengaktifkan pembaruan.</strong>",
        icon: 'success',
        confirmButtonColor: '#b91c1c', // Menyesuaikan dengan tema merah
        confirmButtonText: 'Update Sekarang',
        allowOutsideClick: false,
        allowEscapeKey: false
    }).then((result) => {
        if (result.isConfirmed) {
            batalAbsen();
            showLoading(true, "Mengupdate aplikasi...");
            // Kirim pesan ke service worker baru untuk mengambil alih.
            newWorker.postMessage({ type: 'SKIP_WAITING' });
        }
    });
}

function batalScan() {
    // Langsung panggil history.back() untuk meniru perilaku tombol kembali browser.
    // Event listener 'popstate' akan menangani pembersihan dan penghentian scanner.
    history.back();
}
/**
 * Memeriksa status otentikasi pengguna berdasarkan token di localForage.
 * Fungsi ini harus dijalankan SETELAH proses migrasi.
 */
async function checkAuthStatus() {
    const token = await localforage.getItem("asn_jwt_token");

    if (token) {
        // Validasi token, termasuk masa berlakunya (parameter kedua true)
        const user = parseJwt(token, true);
        if (user) {
            // Token valid, lanjutkan ke dashboard
            // Cek dan perbarui token jika akan kedaluwarsa.
            silentlyRefreshTokenIfNeeded();
            renderProfil();
            renderRiwayatLokal();

            const cachedOpdVersion = await localforage.getItem('opd_cache_version');
            const listOpdExists = await localforage.getItem('list_opd');
            if (cachedOpdVersion !== APP_VERSION || !listOpdExists) {
                // PERBAIKAN: Teruskan token yang sudah ada untuk konsistensi
                await fetchAndCacheOpdList(token);
            }

            getAppVersion();
            switchView('view-dashboard');
        } else {
            // Token tidak valid atau kedaluwarsa, paksa logout
            console.log("Token ditemukan tapi tidak valid atau kedaluwarsa, memaksa logout.");
            await forceLogout();
        }
    } else {
        // Tidak ada token sama sekali, tampilkan halaman login
        switchView('view-login');
        getAppVersion();
    }
}

// ==========================================
// 1. REGISTRASI & PROTEKSI PWA
// ==========================================
if ('serviceWorker' in navigator) {
    // Cek apakah aplikasi berjalan dalam mode PWA (standalone).
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

    const isReloadingForUpdate = sessionStorage.getItem('sw_update_reloading');
    if (isReloadingForUpdate) {
        sessionStorage.removeItem('sw_update_reloading');
    }

    // Definisikan di scope window agar bisa diakses dari mana saja
    window.updateToast = null;

    navigator.serviceWorker.register(`./sw.min.js?v=${APP_VERSION}`).then(reg => {
        console.log('Service Worker terdaftar.', reg);

        // **FIX PENTING: Mencegah update loop.**
        // Jika halaman ini dimuat sebagai hasil dari proses update (ditandai oleh sessionStorage),
        // jangan langsung cek `reg.waiting`. Ini mencegah race condition di mana `reg.waiting`
        // mungkin masih ada sesaat setelah reload, yang akan memicu prompt update kedua.
        if (isReloadingForUpdate) {
            return;
        }

        // **FIX 1: Cek apakah service worker baru sudah menunggu.**
        // Ini menangani kasus jika pengguna mengabaikan prompt update sebelumnya.
        if (reg.waiting) {
            // Hanya tampilkan prompt jika dalam mode PWA.
            if (isStandalone) {
                console.log("Pembaruan ditemukan, service worker baru sedang menunggu.");
                showUpdatePrompt(reg.waiting);
            } else {
                console.log("Pembaruan ditemukan, tetapi tidak dalam mode PWA. Prompt tidak ditampilkan.");
            }
            return;
        }

        // **FIX 2: Dengarkan event 'updatefound' untuk mendeteksi pembaruan baru.**
        reg.onupdatefound = () => {
            const newWorker = reg.installing;
            console.log("Service worker baru ditemukan, status:", newWorker.state);

            // Tampilkan notifikasi toast "mengunduh" hanya jika dalam mode PWA.
            if (isStandalone && navigator.serviceWorker.controller && !isReloadingForUpdate) {
                window.updateToast = Swal.fire({
                    toast: true,
                    position: 'bottom-end',
                    icon: 'info',
                    title: 'Pembaruan baru sedang diunduh...',
                    showConfirmButton: false,
                    timer: 8000, // Waktu tunggu lebih lama
                    timerProgressBar: true
                });
            }

            newWorker.onstatechange = () => {
                console.log("Status service worker baru berubah:", newWorker.state);
                if (newWorker.state === 'installed') {
                    // Jika ada controller aktif, berarti ini adalah pembaruan, bukan instalasi pertama.
                    if (navigator.serviceWorker.controller) {
                        // Hanya tampilkan prompt jika dalam mode PWA.
                        if (isStandalone) {
                            console.log("Service worker baru telah di-install, menampilkan prompt.");
                            showUpdatePrompt(newWorker);
                        } else {
                            console.log("Service worker baru telah di-install, tetapi tidak dalam mode PWA. Prompt tidak ditampilkan.");
                        }
                    }
                }
            };
        };
    }).catch(error => {
        console.error('Registrasi Service Worker gagal:', error);
    });

    // Cek apakah sudah ada service worker yang mengontrol halaman saat dimuat.
    // Ini untuk membedakan antara instalasi pertama dan proses update.
    const hadController = navigator.serviceWorker.controller !== null;
    let refreshing;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        // Hanya reload jika ini adalah proses update (sudah ada controller sebelumnya),
        // bukan saat service worker pertama kali mengambil alih. Ini mencegah layar putih.
        if (refreshing || !hadController) return;
        sessionStorage.setItem('sw_update_reloading', 'true');
        refreshing = true;
        window.location.reload();
    });
}

window.addEventListener('popstate', function (event) {
    // Handler untuk tombol kembali browser.
    // Cek view mana yang sedang aktif dan panggil fungsi cleanup yang sesuai.
    if (!document.getElementById('view-scanner').classList.contains('hidden-view')) {
        tutupScanner(true); // true menandakan dipanggil dari popstate
    } else if (!document.getElementById('view-form').classList.contains('hidden-view')) {
        batalAbsen(true); // true menandakan dipanggil dari popstate
    } else if (!document.getElementById('view-admin-cepat').classList.contains('hidden-view')) {
        batalAdminCepat(true); // true menandakan dipanggil dari popstate
    }
});

// Aksi tombol install utama
document.getElementById('btnInstallApp')?.addEventListener('click', async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        deferredPrompt = null;
    } else {
        // Fallback jika browser menolak prompt otomatis atau tidak mendukung
        Swal.fire({
            title: 'Konfirmasi Instalasi',
            html: "Apakah jendela/pesan untuk meng-install aplikasi <b>muncul di layar Anda?</b>",
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#16a34a',
            cancelButtonColor: '#b91c1c',
            confirmButtonText: 'Ya, Muncul',
            cancelButtonText: 'Tidak, Bantu Saya',
            reverseButtons: true
        }).then((result) => {
            if (result.isConfirmed) {
                Swal.fire('Bagus!', 'Silakan ikuti petunjuk instalasi dari perangkat Anda untuk menyelesaikan.', 'info');
            } else if (result.dismiss === Swal.DismissReason.cancel) {
                tampilkanTutorialManual();
            }
        });
    }
});

/**
 * Memeriksa apakah perangkat adalah smartphone berdasarkan User Agent.
 * @returns {boolean} True jika terdeteksi sebagai perangkat mobile.
 */
function isMobileDevice() {
    // Cek sederhana untuk 'Mobi' di user agent string, yang umum untuk perangkat mobile.
    return /Mobi/i.test(navigator.userAgent);
}

window.onload = async () => {
    try {
        // Konfigurasi localForage. Nama database sekarang dinamis berdasarkan APP_ENV.
        // Ini akan membuat database terpisah untuk versi produksi dan beta.
        localforage.config({
            name: `EabsenPariamanDB_${APP_ENV}`, // Contoh: EabsenPariamanDB_production atau EabsenPariamanDB_beta
            storeName: 'app_storage',
            description: 'Penyimpanan persisten untuk aplikasi BAIS Pariaman.',
        });

        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

        // --- LOGIKA BARU: Cek apakah perangkat adalah mobile ---
        if (!isMobileDevice()) {
            // Jika bukan perangkat mobile, tampilkan view "tidak didukung" dan hentikan eksekusi.
            switchView('view-desktop-unsupported');
            showLoading(false); // Sembunyikan overlay loading untuk menampilkan pesan
            return; // Berhenti di sini
        }

        if (!isStandalone) {
            // Paksa halaman instalasi jika diakses lewat browser biasa
            switchView('view-install');
        } else {
            await migrateStorage(); // Jalankan migrasi sebelum cek status
            await checkAuthStatus();
        }
    } catch (error) {
        console.error("Fatal error during app startup:", error);
        // Tampilkan pesan error yang jelas kepada pengguna jika terjadi kesalahan fatal.
        // Ini mencegah layar putih kosong (white screen of death).
        const body = document.querySelector('body');
        if (body) {
            body.innerHTML = `<div style="padding: 20px; text-align: center; font-family: sans-serif; color: #333;">
                <h1 style="color: #d9534f;">Aplikasi Gagal Dimuat</h1>
                <p>Terjadi kesalahan kritis saat memulai aplikasi. Hal ini bisa terjadi karena data korup setelah pembaruan.</p>
                <p><strong>Solusi:</strong> Coba bersihkan data aplikasi dari pengaturan browser Anda, lalu buka kembali aplikasi.</p>
                <hr>
                <p style="font-size: 0.8em; color: #777;">Detail Error: ${error.message}</p>
            </div>`;
        }
    } finally {
        // Apapun yang terjadi, sembunyikan overlay loading untuk menampilkan konten atau pesan error.
        showLoading(false);
    }
}


document.addEventListener('visibilitychange', () => {
    // Handler untuk saat pengguna mengganti tab atau meminimalkan browser.
    // Ini penting untuk menghemat resource dan mematikan kamera.
    if (document.visibilityState === 'hidden') {
        // Cek apakah scanner QR sedang berjalan di view-scanner
        const scannerView = document.getElementById('view-scanner');
        if (html5QrCode && html5QrCode.isScanning && !scannerView.classList.contains('hidden-view')) {
            console.log("Halaman tidak terlihat, menghentikan QR scanner untuk hemat resource.");
            tutupScanner(true);
        }

        // Cek apakah kamera selfie (di view-form) sedang berjalan
        const formView = document.getElementById('view-form');
        if (videoStream && !formView.classList.contains('hidden-view')) {
            console.log("Halaman tidak terlihat, membatalkan form absensi dan mematikan kamera selfie.");
            batalAbsen(true);
        }
    }
});

function switchView(viewId) {
    // Sembunyikan semua elemen view
    document.querySelectorAll('[id^="view-"]').forEach(el => {
        el.classList.add('hidden-view');
    });
    const viewToShow = document.getElementById(viewId);
    if (viewToShow) {
        viewToShow.classList.remove('hidden-view'); // Tampilkan view yang diminta
    }
    window.scrollTo({ top: 0 });

    // CLEANUP KAMERA: Cegah memory leak!
    // Matikan scanner QR jika bukan di view-scanner atau view-admin-cepat
    if (viewId !== 'view-scanner' && viewId !== 'view-admin-cepat') {
        if (typeof html5QrCode !== 'undefined' && html5QrCode && html5QrCode.isScanning) {
            html5QrCode.stop().catch(e => console.warn("Scanner stop error", e));
        }
    }

    // Matikan selfie kamera jika bukan di view-form
    if (viewId !== 'view-form') {
        if (typeof videoStream !== 'undefined' && videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
            videoStream = null;
        }
        window._isHadirStarted = false;
    }

    // Tampilkan footer hanya di halaman login dan dashboard
    const appFooter = document.getElementById('app-footer');
    if (appFooter) {
        if (viewId === 'view-login' || viewId === 'view-dashboard') {
            appFooter.classList.remove('hidden-view');
        } else {
            appFooter.classList.add('hidden-view');
        }
    }
}

function tampilkanTutorialManual() {
    document.getElementById('boxTutorialManual').classList.remove('hidden-view');
    setTimeout(() => {
        document.getElementById('boxTutorialManual').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

function sembunyikanTutorialManual() {
    document.getElementById('boxTutorialManual').classList.add('hidden-view');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showLoading(show, text = "") {
    const overlay = document.getElementById('loadingOverlay');
    if (show) {
        document.getElementById('loadingText').innerText = text;
        overlay.classList.remove('hidden');
        overlay.classList.add('flex');
    } else {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
    }
}

/**
 * Helper untuk memformat tanggal dari format 'YYYY-MM-DD HH:mm:ss' ke format Indonesia.
 * @param {string} tanggalString - String tanggal dari server.
 * @returns {string} - Tanggal yang sudah diformat.
 */
function formatTanggalWaktuIndonesia(tanggalString) {
    if (!tanggalString || typeof tanggalString !== 'string') return tanggalString;

    try {
        // PERBAIKAN: Selalu gunakan new Date() untuk parsing agar timezone (baik dari string ISO 'Z' atau string lokal) ditangani dengan benar.
        // Hapus parsing manual dengan regex yang mengabaikan informasi timezone.
        const d = new Date(tanggalString);

        // Cek jika tanggal tidak valid setelah parsing
        if (isNaN(d.getTime())) {
            return tanggalString; // Kembalikan string asli jika tidak bisa di-parse
        }

        // Gunakan toLocaleString yang akan mengkonversi ke zona waktu lokal browser pengguna.
        // Format 'id-ID' akan menghasilkan format seperti "16 Jul 2026 14.00.00"
        // .replace() digunakan untuk mengubah titik menjadi titik dua agar sesuai format jam.
        return d.toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/\./g, ':');
    } catch (e) {
        console.error("Gagal memformat tanggal:", tanggalString, e);
        return tanggalString; // Fallback jika ada error
    }
}

/**
 * Membersihkan string untuk dimasukkan dengan aman ke dalam HTML.
 * @param {string} unsafe String yang mungkin mengandung karakter HTML.
 * @returns {string} String yang sudah di-escape.
 */
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Menampilkan versi aplikasi yang didefinisikan secara manual di variabel APP_VERSION.
 */
function getAppVersion() {
    const appVersionSpan = document.getElementById('appVersion');
    if (appVersionSpan) {
        appVersionSpan.textContent = APP_VERSION;
    }
}

/**
 * Mengembalikan objek Date yang sudah disesuaikan dengan waktu server (estimasi).
 */
function getCurrentServerTime() { return new Date(); }
// ==========================================
// 2. PARSING JWT & PROFIL LOKAL
// ==========================================
function parseJwt(token, validateExp = false) { // Add a flag
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        const payload = JSON.parse(jsonPayload); // Get the full payload

        if (validateExp) {
            // exp claim is in seconds, Date.now() is in milliseconds
            const nowInSeconds = Math.floor(Date.now() / 1000);
            // Tambahkan leeway (kelonggaran) 5 detik untuk mengatasi clock skew antara server dan client.
            // Token dianggap expired jika waktu kedaluwarsanya sudah lewat lebih dari 5 detik yang lalu.
            const leeway = 5;
            if (payload.exp < (nowInSeconds - leeway)) {
                console.error(`Token JWT sudah kedaluwarsa (dengan leeway ${leeway} detik).`);
                return null; // Token expired
            }
        }

        return payload.data; // Return only the data part if valid
    } catch (e) {
        console.error("Gagal mem-parsing JWT:", e);
        return null;
    }
}

async function renderProfil() {
    const token = await localforage.getItem("asn_jwt_token");
    if (!token) return;
    const user = parseJwt(token);
    if (user) {
        document.getElementById('dashNama').innerText = user.nama || "-";
        document.getElementById('dashNip').innerText = user.nip || "-";
        document.getElementById('dashPerangkatDaerah').innerText = user.opd || "-";
        document.getElementById('dashJabatan').innerText = user.jabatan || "-";
        document.getElementById('dashJenisAsn').innerText = user.jenis_asn || "-";

        // Tampilkan menu admin jika user memiliki role 'admin'
        const adminScanButton = document.getElementById('btnAdminAbsenkanLain');
        if (user.role && user.role.includes('admin')) {
            adminScanButton.classList.remove('hidden-view');
        } else {
            adminScanButton.classList.add('hidden-view');
        }
    }
}

// ==========================================
// 3. RIWAYAT ABSEN LOKAL
// ==========================================
async function simpanRiwayatLokal(judul, sesi, waktu, kodeAkses, nip) {
    if (!nip) return; // Jangan simpan jika tidak ada NIP
    let history = await localforage.getItem('riwayat_absen') || [];
    // Tambahkan NIP ke objek riwayat
    history.unshift({ judul: judul, sesi: sesi, waktu: waktu, kode: kodeAkses, nip: nip });
    // Batasi hingga 50 riwayat
    if (history.length > 50) history.splice(50);
    await localforage.setItem('riwayat_absen', history);
    renderRiwayatLokal(); // Render akan memfilter berdasarkan user yang login
}

async function renderRiwayatLokal() {
    const container = document.getElementById('listRiwayatLokal');
    if (!container) return;

    // Dapatkan NIP pengguna yang sedang login
    const token = await localforage.getItem("asn_jwt_token");
    if (!token) {
        // Jika tidak ada token (user belum login), tampilkan pesan kosong.
        container.innerHTML = '<div class="text-center text-gray-400 text-sm py-4">Login untuk melihat riwayat.</div>';
        return;
    }
    const user = parseJwt(token);
    if (!user || !user.nip) {
        container.innerHTML = '<div class="text-center text-gray-400 text-sm py-4">Gagal memuat profil.</div>';
        return;
    }
    const currentUserNip = user.nip;

    // Ambil semua riwayat dari localStorage
    let allHistory = await localforage.getItem('riwayat_absen') || [];

    // Filter riwayat untuk pengguna yang sedang login
    const userHistory = allHistory.filter(h => h.nip === currentUserNip && h.waktu);

    if (userHistory.length === 0) {
        return container.innerHTML = '<div class="text-center text-gray-400 text-sm py-4">Belum ada riwayat absensi untuk Anda di perangkat ini.</div>';
    }

    let html = '';
    userHistory.forEach(h => {
        html += `
        <div class="bg-gray-50 border border-gray-100 rounded-xl p-3 mb-2 flex justify-between items-center">
            <div>
                <strong class="block text-gray-800 text-sm">${escapeHtml(h.judul)}</strong>
                <span class="text-xs text-green-600 font-semibold bg-green-100 px-2 py-0.5 rounded mt-1 inline-block">${h.sesi}</span>
                <div class="text-xs text-gray-500 mt-1">${formatTanggalWaktuIndonesia(h.waktu)}</div>
            </div>
            <i class="bi bi-check-circle-fill text-green-500 text-xl"></i>
        </div>`;
    });
    container.innerHTML = html;
}

async function hapusRiwayatLokal() {
    const token = await localforage.getItem("asn_jwt_token");
    if (!token) return; // Tidak melakukan apa-apa jika tidak login
    const user = parseJwt(token);
    if (!user || !user.nip) return;
    const currentUserNip = user.nip;

    Swal.fire({
        title: 'Hapus Riwayat Lokal?',
        html: "Anda akan menghapus semua riwayat absensi <strong>Anda</strong> di perangkat ini. Riwayat pengguna lain tidak akan terpengaruh.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Ya, Hapus!',
        cancelButtonText: 'Batal'
    }).then(async (result) => {
        if (result.isConfirmed) {
            let allHistory = await localforage.getItem('riwayat_absen') || [];
            const remainingHistory = allHistory.filter(h => h.nip !== currentUserNip);
            await localforage.setItem('riwayat_absen', remainingHistory);
            // Render ulang untuk menampilkan daftar yang sudah kosong
            renderRiwayatLokal();
            Swal.fire({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2000, icon: 'success', title: 'Riwayat Anda telah dibersihkan.' });
        }
    });
}

// ==========================================
// 4. API & AUTENTIKASI
// ==========================================

/**
 * Menangani logika setelah login berhasil, baik dari worker maupun server utama.
 * @param {string} token - Token JWT yang diterima.
 */
async function handleSuccessfulLogin(token) {
    await localforage.setItem("asn_jwt_token", token);
    renderProfil();
    renderRiwayatLokal();

    // Cek versi cache OPD, sama seperti di checkAuthStatus
    const cachedOpdVersion = await localforage.getItem('opd_cache_version');
    const listOpdExists = await localforage.getItem('list_opd');
    if (cachedOpdVersion !== APP_VERSION || !listOpdExists) {
        console.log("Cache OPD tidak valid atau tidak ada setelah login, mengambil data baru...");
        await fetchAndCacheOpdList(token);
    }

    switchView('view-dashboard');
}

async function prosesLogin(e) {
    if (e) e.preventDefault();
    const nip = document.getElementById('logNip').value.trim();
    const nik = document.getElementById('logNik').value.trim();
    if (!nip || !nik) return;

    showLoading(true, "Memverifikasi...");
    const payload = { nip: nip, nik: nik };

    let response;
    try {
        try {
            // 1. Coba login via Worker
            console.log("Mencoba login via Worker...");
            response = await fetch(`${WORKER_URL}/api/login-asn?cb=${Date.now()}`, {
                method: "POST",
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) throw new Error(`Worker merespon dengan status ${response.status}`);
        } catch (workerError) {
            // 2. Jika worker gagal (error jaringan, timeout, atau status error), fallback ke server PHP.
            console.warn("Login via Worker gagal, fallback ke server utama.", workerError.message);
            response = await fetch(`${API_BASE_URL}/login-asn?cb=${Date.now()}`, {
                method: "POST",
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        const res = await response.json();

        if (response.ok && res.status && res.data.token) {
            await handleSuccessfulLogin(res.data.token);
        } else {
            Swal.fire('Gagal', res.message || 'Terjadi kesalahan saat login.', 'error');
        }
    } catch (error) {
        console.error("Login gagal:", error);
        Swal.fire("Login Gagal", "Tidak dapat terhubung ke server. Periksa koneksi internet Anda.", "error");
    } finally {
        showLoading(false);
    }
}

async function logout() {
    Swal.fire({
        title: 'Ganti akun?', text: "Apakah Anda yakin mau ganti akun?", icon: 'warning',
        showCancelButton: true, confirmButtonColor: '#16a34a', confirmButtonText: 'Ya, Ganti Akun'
    }).then(async (result) => {
        if (result.isConfirmed) {
            // Hapus hanya token login pengguna saat ini.
            // Data lain seperti riwayat pengguna lain, daftar OPD, dll, akan tetap tersimpan.
            await localforage.removeItem("asn_jwt_token");

            batalAbsen(); // Pastikan state aktif seperti kamera atau form dibersihkan sebelum logout
            switchView('view-login');
        }
    });
}

async function forceLogout() { // Dipanggil saat token expired
    // Hapus hanya token yang sudah kedaluwarsa.
    await localforage.removeItem("asn_jwt_token");

    batalAbsen(); // Pastikan state aktif seperti kamera atau form dibersihkan
    switchView('view-login');
    Swal.fire('Sesi Habis', 'Sesi login Anda sudah habis. Silakan login kembali.', 'warning');
}

/**
 * Wrapper untuk fetch yang menyertakan token otorisasi
 * dan menangani error 401 (Unauthorized) secara otomatis.
 * @param {string} url - URL API endpoint.
 * @param {object} options - Opsi untuk fetch (method, body, dll). Opsi `token` bisa digunakan untuk override.
 * @returns {Promise<Response>} - Promise yang resolve dengan objek Response.
 */
async function fetchWithAuth(url, options = {}) {
    // Ambil token dari opsi jika disediakan, jika tidak, ambil dari localForage.
    const token = options.token || await localforage.getItem("asn_jwt_token");

    if (!token) {
        // Jika tidak ada token sama sekali, paksa logout.
        // Ini adalah tindakan pengamanan jika fungsi ini dipanggil
        // dari konteks di mana seharusnya ada token.
        forceLogout();
        throw new Error("Sesi tidak ditemukan. Harap login kembali.");
    }

    const fetchOptions = { ...options, headers: { 'Authorization': `Bearer ${token}`, ...(!(options.body instanceof FormData) && { 'Content-Type': 'application/json' }), ...options.headers, }, };

    const urlObj = new URL(url);
    urlObj.searchParams.append('cb', Date.now());
    const response = await fetch(urlObj.toString(), fetchOptions);

    if (response.status === 401) {
        // Jika server mengembalikan 401 (Unauthorized), berarti token
        // tidak valid atau sesinya telah berakhir di server. Paksa logout.
        forceLogout();
        throw new Error("Sesi habis.");
    }

    return response;
}

// Fungsi untuk mengambil list OPD dari API dan menyimpannya di localStorage
async function fetchAndCacheOpdList(tokenOverride) {
    // Gunakan token yang diberikan jika ada, jika tidak, ambil dari penyimpanan.
    const tokenToUse = tokenOverride || (await localforage.getItem('asn_jwt_token'));
    if (!tokenToUse) return;

    const saveOpdList = async (list) => {
        await localforage.setItem('list_opd', list);
        await localforage.setItem('opd_cache_version', APP_VERSION);
        console.log(`List OPD berhasil diunduh dan disimpan untuk versi ${APP_VERSION}.`);
    };

    try {
        // 1. Coba ambil dari Worker terlebih dahulu
        console.log('Mencoba mengambil daftar OPD dari Worker Cache...');
        const workerResponse = await fetch(`${WORKER_URL}/api/opd/list?cb=${Date.now()}`);
        if (workerResponse.ok) {
            const workerData = await workerResponse.json();
            if (workerData.status && Array.isArray(workerData.data)) {
                console.log('Berhasil mendapatkan daftar OPD dari Worker.');
                await saveOpdList(workerData.data);
                return; // Selesai
            }
        }
        // Jika worker response tidak ok atau data tidak valid, akan jatuh ke blok catch.
        throw new Error('Cache miss atau data worker tidak valid.');
    } catch (workerError) {
        // 2. Jika Worker gagal (cache miss, network error), fallback ke server utama
        console.warn('Gagal mengambil OPD dari worker, fallback ke server utama:', workerError.message);
        try {
            const originResponse = await fetchWithAuth(`${API_BASE_URL}/opd/list`, { token: tokenToUse });
            const originData = await originResponse.json();
            if (originData.status && Array.isArray(originData.data)) {
                await saveOpdList(originData.data);
            }
        } catch (originError) {
            console.error('Gagal mengambil list OPD dari server utama:', originError);
        }
    }
}

// ==========================================
// 5. FUNGSI KHUSUS ADMIN
// ==========================================

async function generateUserQrToken() {
    const token = await localforage.getItem('asn_jwt_token');
    if (!token) return;

    showLoading(true, "Membuat QR Code...");

    try {
        const showQrModal = (tempToken) => {
            const modal = document.getElementById('modalUserQr');
            const qrContainer = document.getElementById('userQrContainer');
            const countdownEl = document.getElementById('qrCountdown');

            qrContainer.innerHTML = '';
            userQrCodeInstance = new QRCode(qrContainer, {
                text: tempToken,
                width: 288,                             // Sesuaikan dengan ukuran container w-72 h-72 (18rem * 16px)
                height: 288,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.M
            });

            modal.classList.remove('hidden');
            modal.classList.add('flex');

            let timeLeft = 60;
            countdownEl.innerText = timeLeft;
            qrCountdownInterval = setInterval(() => {
                timeLeft--;
                countdownEl.innerText = timeLeft;
                if (timeLeft <= 0) {
                    tutupModalUserQr();
                }
            }, 1000);
        };

        const callApi = async (url) => {
            const response = await fetchWithAuth(url, { method: 'POST' });
            const res = await response.json();
            if (!response.ok || !res.status) throw new Error(res.message || `Request to ${url} failed with status ${response.status}`);
            return res.data.token;
        };

        try {
            // 1. Coba ke Worker
            console.log("Mencoba membuat QR Code via Worker...");
            const tempToken = await callApi(`${WORKER_URL}/api/token/generate-temporary`);
            showQrModal(tempToken);
        } catch (workerError) {
            // 2. Jika Worker gagal, fallback ke Server Origin
            console.warn("Gagal membuat QR Code via Worker, fallback ke server utama...", workerError);
            const tempToken = await callApi(`${API_BASE_URL}/token/generate-temporary`);
            showQrModal(tempToken);
        }
    } catch (finalError) {
        // Jika keduanya gagal
        console.error("Gagal membuat QR Code dari worker dan server utama.", finalError);
        Swal.fire("Gagal Membuat QR", "Tidak dapat terhubung ke server. Periksa koneksi internet Anda.", "error");
    } finally {
        showLoading(false);
    }
}

function tutupModalUserQr() {
    clearInterval(qrCountdownInterval);
    const modal = document.getElementById('modalUserQr');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.getElementById('userQrContainer').innerHTML = '';
    userQrCodeInstance = null;
}

function bukaAbsenkanPegawai() {
    // Fungsi ini sekarang membuka view baru untuk alur absensi cepat oleh admin.
    switchView('view-admin-cepat');
    setupAdminCepatView();
    history.pushState({ view: 'view-admin-cepat' }, "Absensi Cepat", '#admin-cepat');
}


// ==========================================
// 5.1 ALUR ABSENSI CEPAT (ADMIN)
// ==========================================

function setupAdminCepatView() {
    // Reset state
    adminCepatState = { jadwal: null, scanner: null };

    // Reset UI
    document.getElementById('admin-cepat-kode-akses').value = '';
    document.getElementById('admin-cepat-step1').classList.remove('hidden-view');
    document.getElementById('admin-cepat-step2').classList.add('hidden-view');

    // Hentikan scanner jika masih berjalan
    const scannerDiv = document.getElementById('admin-cepat-scanner');
    if (adminCepatState.scanner && adminCepatState.scanner.isScanning) {
        adminCepatState.scanner.stop().catch(err => console.warn("Gagal menghentikan scanner admin cepat.", err));
    }
    if (scannerDiv) {
        scannerDiv.innerHTML = ''; // Clear the div
    }
    adminCepatState.scanner = null;
}

function batalAdminCepat(fromPopState = false) {
    // Jika tidak dipanggil dari popstate, lakukan navigasi kembali.
    // Jika dipanggil dari popstate, jangan panggil history.back() lagi untuk menghindari loop.
    if (!fromPopState) {
        if (location.hash === '#admin-cepat' || location.hash === '#scanner') {
            history.back();
        }
    } else {
        if (html5QrCode && html5QrCode.isScanning && isAbsenCepatMode) {
            html5QrCode.stop().catch(err => console.warn("Gagal menghentikan scanner saat batal admin cepat.", err));
        }

        // Reset semua state yang relevan
        adminCepatState = { jadwal: null, scanner: null };
        isAbsenCepatMode = false;
        isProcessingScan = false;

        switchView('view-dashboard');
    }
}

async function adminCepatCekJadwal(event) {
    if (event) event.preventDefault();
    const kodeAkses = document.getElementById('admin-cepat-kode-akses').value.trim().toUpperCase();
    if (!kodeAkses) return;

    showLoading(true, "Mengecek Jadwal...");

    try {
        // Panggil validasi server dengan flag untuk melewati pengecekan riwayat absensi lokal.
        const jadwalData = await handleServerValidation(kodeAkses, true);
        if (!jadwalData) {
            // handleServerValidation mungkin sudah menampilkan alert (misal: sudah absen),
            // jadi kita cukup keluar. Loading akan disembunyikan oleh blok finally.
            return;
        }

        adminCepatState.jadwal = jadwalData;

        // Isi detail jadwal ke UI
        document.getElementById('admin-cepat-judul').innerText = jadwalData.judul;
        document.getElementById('admin-cepat-kategori').innerText = jadwalData.kategori;
        document.getElementById('admin-cepat-kode').innerText = jadwalData.kode_akses;
        const tanggalFormatted = new Date(jadwalData.tanggal).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        document.getElementById('admin-cepat-waktu').innerText = `${tanggalFormatted} (${jadwalData.jam_mulai} - ${jadwalData.jam_selesai} WIB)`;

        // Pindah ke langkah berikutnya
        document.getElementById('admin-cepat-step1').classList.add('hidden-view');
        document.getElementById('admin-cepat-step2').classList.remove('hidden-view');

    } catch (error) {
        // Jika terjadi error (misal: jadwal tidak ditemukan), tampilkan pesan.
        Swal.fire("Gagal", error.message || "Terjadi kesalahan saat memeriksa jadwal.", "error");
    } finally {
        // Pastikan overlay loading selalu disembunyikan setelah proses selesai.
        showLoading(false);
    }
}


async function adminCepatMulaiPindai() {
    const keterangan = document.getElementById('admin-cepat-keterangan').value.trim();
    if (!keterangan) {
        Swal.fire('Gagal', 'Keterangan wajib diisi sebelum memulai pemindaian.', 'error');
        return;
    }

    const jadwal = adminCepatState.jadwal;

    // 1. Validasi Waktu Awal
    if (jadwal.is_strict_time == 1) {
        const nowTime = getCurrentServerTime().getTime();
        const eventEndStr = `${jadwal.tanggal}T${jadwal.jam_selesai}:00+07:00`;
        const endTime = new Date(eventEndStr).getTime();
        if (nowTime > endTime) {
            Swal.fire('Waktu Habis', 'Kegiatan ini sudah berakhir. Absensi Cepat tidak diizinkan karena aturan Waktu Ketat (Strict Time) aktif.', 'error');
            return;
        }
    }

    // Fungsi untuk melanjutkan setelah lokasi (jika perlu) didapatkan
    const proceedToScan = () => {
        // Simpan parameter ke state
        adminCepatState.status_kehadiran = document.getElementById('admin-cepat-status-kehadiran').value;
        adminCepatState.status_verifikasi = document.getElementById('admin-cepat-status-verifikasi').value;
        adminCepatState.keterangan = keterangan;
        isAbsenCepatMode = true; // Aktifkan mode pindai cepat

        // Buka scanner utama yang sudah ada dan berfungsi
        bukaScanner(false, 'Pindai QR Profil (Absen Cepat)', false);
    };

    // 2. Validasi Lokasi Awal
    if (jadwal.is_strict_location == 1) {
        showLoading(true, "Memeriksa lokasi Anda...");
        try {
            const pos = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
            });
            const rLat = pos.coords.latitude;
            const rLng = pos.coords.longitude;

            const [tLat, tLng] = jadwal.koordinat.replace(/'/g, '').split(',');
            const jarak = getDistanceInMeters(rLat, rLng, parseFloat(tLat), parseFloat(tLng));
            const radius = parseFloat(jadwal.radius_meter);

            showLoading(false);
            if (jarak > radius) {
                Swal.fire('Di Luar Lokasi', `Anda berada ${Math.round(jarak)} meter dari lokasi kegiatan (Maksimal ${radius}m). Absensi Cepat tidak diizinkan karena aturan Lokasi Ketat (Strict Location) aktif.`, 'error');
                return;
            }

            adminCepatState.lat = rLat;
            adminCepatState.lng = rLng;
            proceedToScan();
        } catch (e) {
            showLoading(false);
            Swal.fire('Lokasi Diperlukan', 'Gagal mendapatkan lokasi Anda. Pastikan GPS aktif dan izin lokasi diberikan.', 'error');
            return;
        }
    } else {
        adminCepatState.lat = 0;
        adminCepatState.lng = 0;
        proceedToScan();
    }
}

// ==========================================
// 5. PROFIL (UPDATE & REFRESH)
// ==========================================

/**
 * Memeriksa masa berlaku token dan memanggil API untuk memperbaruinya jika
 * masa berlakunya kurang dari 5 hari lagi.
 * Fungsi ini mengambil token langsung dari localForage.
 */
async function silentlyRefreshTokenIfNeeded() {
    try {
        const token = await localforage.getItem("asn_jwt_token");
        if (!token) return; // Keluar jika tidak ada token

        // Parse payload manually to get 'exp' without changing global parseJwt
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        const payload = JSON.parse(jsonPayload);

        if (!payload || !payload.exp) return;

        const nowInSeconds = Math.floor(Date.now() / 1000);
        const fiveDaysInSeconds = 5 * 24 * 3600;

        // Jika token akan kedaluwarsa dalam 5 hari ke depan
        if (payload.exp < (nowInSeconds + fiveDaysInSeconds)) {
            console.log("Masa berlaku token akan segera habis, mencoba memperbarui di latar belakang...");

            let response;
            try {
                // 1. Coba refresh via Worker. fetchWithAuth akan mengambil token dari localForage.
                response = await fetchWithAuth(`${WORKER_URL}/api/profil/refresh-token`, { method: 'POST' });
                if (!response.ok) throw new Error(`Worker merespon dengan status ${response.status}`);
            } catch (workerError) {
                // 2. Jika worker gagal, fallback ke server PHP.
                // fetchWithAuth akan mengambil token dari localForage.
                console.warn("Refresh token via Worker gagal, fallback ke server utama.", workerError.message);
                response = await fetchWithAuth(`${API_BASE_URL}/profil/refresh-token`, { method: 'POST' });
            }

            if (response && response.ok) {
                const res = await response.json();
                if (res.status && res.data.token) {
                    // Ganti token lama di localForage dengan yang baru.
                    await localforage.setItem("asn_jwt_token", res.data.token);
                    console.log("Token berhasil diperbarui di latar belakang.");
                } else {
                    console.warn("Gagal memperbarui token di latar belakang (server response):", res.message);
                }
            } else {
                console.warn("Gagal memperbarui token di latar belakang (network/http error).");
            }
        }
    } catch (error) {
        // Abaikan semua error, jangan sampai memblokir UI.
        console.error("Terjadi error saat mencoba memperbarui token:", error);
    }
}
async function refreshProfil() {
    const token = await localforage.getItem("asn_jwt_token");
    if (!token) return;

    const user = parseJwt(token, true); // Validasi token sebelum digunakan
    if (!user) {
        Swal.fire('Error', 'Profil lokal tidak valid. Silakan logout dan login kembali.', 'error');
        return;
    }

    showLoading(true, "Menyinkronkan...");

    try {
        // Hanya ambil sinkronisasi dari Worker tanpa fallback
        console.log("Mencoba sinkronisasi profil via Worker...");
        const response = await fetchWithAuth(`${WORKER_URL}/api/profil/sync`, { method: "POST" });
        if (!response.ok) {
            throw new Error(`Worker merespon dengan status ${response.status}`);
        }

        const res = await response.json();

        if (response.ok && res.status && res.data.token) {
            await localforage.setItem("asn_jwt_token", res.data.token);
            renderProfil();
            Swal.fire({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3500, icon: 'success', title: res.message || 'Profil berhasil diperbarui!' });
        } else {
            Swal.fire('Gagal Sinkronisasi', res.message || 'Gagal menyinkronkan profil.', 'error');
        }
    } catch (finalError) {
        console.error("Error saat sinkronisasi profil (termasuk fallback):", finalError);
        Swal.fire("Gagal Sinkronisasi", "Tidak dapat terhubung ke server. Periksa koneksi internet Anda.", "error");
    } finally {
        showLoading(false);
    }
}

async function bukaModalEditProfil() {
    const token = await localforage.getItem("asn_jwt_token"); if (!token) return;
    const user = parseJwt(token);
    document.getElementById('editJabatan').value = user.jabatan || "";

    // Menggunakan nilai dari hidden input jika ada (setelah pemilihan), jika tidak, gunakan dari token
    const selectedOpd = document.getElementById('editPerangkatDaerahValue').value || user.opd;
    document.getElementById('editPerangkatDaerahDisplay').querySelector('span').textContent = selectedOpd || "Pilih OPD...";
    document.getElementById('editPerangkatDaerahValue').value = selectedOpd || "";

    // Tambahkan event listener untuk membuka view pemilihan OPD
    document.getElementById('editPerangkatDaerahDisplay').onclick = bukaViewPilihOpd;

    document.getElementById('modalEditProfil').classList.remove('hidden');
}

async function bukaViewPilihOpd() {
    tutupModalEditProfil();
    switchView('view-select-opd');

    const listContainer = document.getElementById('listOpdContainer');
    const searchInput = document.getElementById('searchOpd');
    const listOpd = await localforage.getItem('list_opd') || [];

    searchInput.value = '';

    const renderList = (filter = '') => {
        listContainer.innerHTML = '';
        const filteredList = listOpd.filter(opd => opd.toLowerCase().includes(filter.toLowerCase()));

        if (filteredList.length === 0) {
            listContainer.innerHTML = `<div class="text-center text-gray-500 py-6">Tidak ada OPD yang cocok.</div>`;
            return;
        }

        filteredList.forEach(opd => {
            const opdElement = document.createElement('button');
            opdElement.className = 'w-full text-left p-4 bg-white rounded-lg shadow-sm hover:bg-blue-50 border border-gray-200 active:scale-[0.98] transition-transform';
            opdElement.textContent = opd;
            opdElement.onclick = () => pilihOpd(opd);
            listContainer.appendChild(opdElement);
        });
    };

    renderList();

    searchInput.oninput = () => renderList(searchInput.value);
}

function pilihOpd(opdName) {
    document.getElementById('editPerangkatDaerahValue').value = opdName;
    document.getElementById('editPerangkatDaerahDisplay').querySelector('span').textContent = opdName;
    kembaliKeEditProfil();
}

function tutupModalEditProfil() {
    document.getElementById('modalEditProfil').classList.add('hidden');
}

function kembaliKeEditProfil() {
    switchView('view-dashboard');
    bukaModalEditProfil();
}

async function simpanProfil(e) {
    e.preventDefault();
    const pD = document.getElementById('editPerangkatDaerahValue').value;
    const jT = document.getElementById('editJabatan').value.trim();

    showLoading(true, "Menyimpan...");
    try {
        const response = await fetchWithAuth(`${API_BASE_URL}/profil/update`, {
            method: "PUT",
            body: JSON.stringify({ perangkat_daerah: pD, jabatan: jT })
        });
        const res = await response.json();
        // PERBAIKAN: Endpoint 'update' sekarang langsung mengembalikan token baru (karena memanggil refresh() di backend).
        // Tidak perlu lagi memanggil refreshProfil() secara terpisah.
        if (res.status && res.data.token) {
            tutupModalEditProfil();
            // Langsung simpan token baru yang diterima dari response
            await localforage.setItem("asn_jwt_token", res.data.token);
            // Render ulang profil di dashboard
            renderProfil();
            // Tampilkan pesan sukses dari server
            Swal.fire({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, icon: 'success', title: res.message || 'Profil berhasil disimpan!' });
        } else {
            // Jika gagal, tampilkan pesan error dari server
            Swal.fire('Gagal', res.message, 'error');
        }
    } catch (e) {
        Swal.fire('Gagal Menyimpan', 'Tidak dapat terhubung ke server untuk menyimpan profil. Periksa koneksi internet Anda.', 'error');
    }
    showLoading(false);
}

// ==========================================
// 6. JADWAL & QR SCANNER (FLOW NORMAL & ADMIN)
// ==========================================
async function bukaScanner(isNormalFlow = false, title = 'Pindai Kode QR', showManualInput = true) {
    // Alur admin lama (adminFlowState) tidak lagi digunakan, jadi tidak perlu di-reset.
    // Atur judul dan visibilitas tombol di tampilan scanner
    const scannerTitleEl = document.querySelector('#view-scanner .scanner-title');
    if (scannerTitleEl) scannerTitleEl.innerText = title;

    const btnManual = document.getElementById('btnMasukkanKode');
    const btnContainer = document.getElementById('scanner-buttons-container');
    if (showManualInput) {
        btnManual.classList.remove('hidden-view');
        btnContainer.classList.replace('grid-cols-1', 'grid-cols-2');
    } else {
        btnManual.classList.add('hidden-view');
        btnContainer.classList.replace('grid-cols-2', 'grid-cols-1');
    }

    history.pushState({ view: 'scanner' }, title, '#scanner');
    switchView('view-scanner');

    const cameraSelect = document.getElementById('camera-select');
    const cameraContainer = document.getElementById('camera-selection-container');
    cameraContainer.classList.add('hidden-view');

    // Hentikan pemindai yang mungkin masih berjalan
    if (html5QrCode && html5QrCode.isScanning) {
        await html5QrCode.stop();
    }

    try {
        const cameras = await Html5Qrcode.getCameras();
        if (cameras && cameras.length) {
            let defaultCameraId = cameras[0].id;
            if (cameras.length > 1) {
                cameraContainer.classList.remove('hidden-view');
                cameraSelect.innerHTML = '';
                cameras.forEach(camera => {
                    const option = document.createElement('option');
                    option.value = camera.id;
                    option.text = camera.label || `Kamera ${cameras.indexOf(camera) + 1}`;
                    // Heuristik sederhana untuk memilih kamera belakang sebagai default
                    if (camera.label.toLowerCase().includes('back') || camera.label.toLowerCase().includes('belakang') || camera.label.toLowerCase().includes('0')) {
                        option.selected = true;
                        defaultCameraId = camera.id;
                    }
                    cameraSelect.appendChild(option);
                });
                cameraSelect.onchange = () => _startScanner(cameraSelect.value);
            }
            _startScanner(defaultCameraId);
        } else {
            _startScanner(); // Coba mulai tanpa ID kamera spesifik
        }
    } catch (err) {
        console.error("Gagal mendapatkan daftar kamera, menggunakan default.", err);
        _startScanner(); // Fallback jika getCameras gagal
    }
}

async function _startScanner(deviceId) {
    html5QrCode = new Html5Qrcode("qr-reader");
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    const cameraToStart = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "environment" };

    // Hentikan dulu jika sedang berjalan, untuk handle pergantian kamera.
    if (html5QrCode && html5QrCode.isScanning) {
        await html5QrCode.stop().catch(err => console.warn("Gagal menghentikan scanner saat memulai ulang.", err));
    }

    html5QrCode.start(
        cameraToStart,
        config,
        (decodedText, decodedResult) => {
            // Semua hasil pindaian, baik normal maupun cepat, dilewatkan ke handler baru.
            handleScanSuccess(decodedText);
        },
        () => { } // onScanFailure, sengaja dibiarkan kosong untuk mendukung continuous scan.
    ).catch(err => {
        console.error("Gagal memulai pemindai QR:", err);
        Swal.fire("Error Kamera", "Gagal memulai kamera. Pastikan izin telah diberikan.", "error");
        if (location.hash === '#scanner') history.back(); // Kembali jika gagal start.
    });
}


/**
 * Memproses teks hasil pindaian QR dan mengarahkannya ke alur yang benar.
 * @param {string} decodedText - Teks dari QR code.
 */
function handleDecodedQrText(decodedText) {
    // Keluar dari view scanner secara UI
    if (location.hash === '#scanner') {
        history.back();
    }

    const isProfileToken = decodedText.startsWith("BB:");
    const isJadwalJwt = (decodedText.match(/\./g) || []).length === 2 && !isProfileToken;

    // HANYA proses QR Jadwal (baik JWT atau kode manual)
    if (isJadwalJwt) {
        prosesQrCode(decodedText);
    } else if (isProfileToken) {
        // Beri peringatan jika QR profil dipindai di alur normal
        Swal.fire("Tidak Sesuai", "QR Code Profil hanya dapat digunakan pada alur 'Absen Cepat' oleh Admin.", "warning").then(batalAbsen);
    } else {
        // Tangani QR code yang tidak valid
        Swal.fire("Gagal", "QR Code tidak valid atau tidak dikenali. Pastikan Anda memindai QR Code jadwal format baru.", "error").then(batalAbsen);
    }
}

async function tutupScanner(fromPopState = false) {
    // Jika dipanggil dari tombol, gunakan history.back() untuk memicu popstate.
    if (!fromPopState && location.hash === '#scanner') {
        history.back();
        return;
    }

    // Logika inti untuk membersihkan dan beralih view.
    if (html5QrCode && html5QrCode.isScanning) {
        await html5QrCode.stop().catch(err => console.warn("Gagal menghentikan scanner.", err));
    }
    html5QrCode = null;

    if (isAbsenCepatMode) {
        isAbsenCepatMode = false; // Nonaktifkan mode pindai cepat.
        isProcessingScan = false; // Reset flag pemrosesan.
        // Kembali ke layar pengaturan parameter, bukan ke dashboard.
        switchView('view-admin-cepat');
    } else {
        // Alur normal kembali ke dashboard.
        switchView('view-dashboard');
    }
}


/**
 * Dispatcher utama untuk memproses QR code jadwal atau kode manual.
 * Fungsi ini menangani alur untuk pengguna normal dan admin.
 * - Jika `kodeOrJwt` adalah JWT, validasi dilakukan di PWA (client-side).
 * - Jika `kodeOrJwt` adalah kode manual, validasi dilakukan di server.
 * Ini memastikan alur validasi yang benar diterapkan secara otomatis.
 */
async function prosesQrCode(kodeOrJwt) {
    showLoading(true, "Memvalidasi Jadwal...");
    try {
        const isJwt = (kodeOrJwt.match(/\./g) || []).length === 2;
        let jadwalData;

        if (isJwt) {
            jadwalData = await handleJwtValidation(kodeOrJwt);
        } else {
            jadwalData = await handleServerValidation(kodeOrJwt);
        }

        // Jika validasi mengembalikan null (misal: sudah absen), hentikan proses.
        if (!jadwalData) {
            showLoading(false);
            return;
        }

        // Jika validasi berhasil, lanjutkan untuk menyiapkan form.
        await setupAbsenForm(jadwalData);
    } catch (error) {
        showLoading(false);
        console.error("Error processing QR/Code:", error);
        Swal.fire("Gagal", error.message || "Terjadi kesalahan saat memvalidasi jadwal.", "error").then(() => {
            batalAbsen();
        });
    }
}

/**
 * Menangani validasi QR code berformat JWT di sisi klien.
 * Untuk alur admin, pengecekan riwayat absensi lokal akan dilewati.
 * @param {string} jwt - Token JWT dari QR code.
 * @returns {Promise<object|null>} Data jadwal jika valid, atau null jika sudah absen.
 */
async function handleJwtValidation(jwt) {
    const jadwalFromJwt = parseJwt(jwt, true); // Validasi masa berlaku token
    if (!jadwalFromJwt || !jadwalFromJwt.kode_akses) {
        throw new Error("QR Code jadwal tidak valid atau sudah kedaluwarsa.");
    }

    // Validasi tanggal di sisi klien untuk memberikan feedback cepat.
    const nowTime = Date.now();

    // Konversi UTC tersinkronisasi ke string tanggal Jakarta (Y-M-D)
    const jakartaDateString = new Date(nowTime).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

    if (jakartaDateString !== jadwalFromJwt.tanggal) {
        throw new Error("Jadwal ini tidak berlaku untuk hari ini.");
    }

    // --- LOGIKA BARU: Validasi Waktu Mulai di sisi klien tersinkronisasi ---
    const eventStartStr = `${jadwalFromJwt.tanggal}T${jadwalFromJwt.jam_mulai}:00+07:00`;
    const startTime = new Date(eventStartStr).getTime();

    if (nowTime < startTime) {
        throw new Error(`Absensi untuk kegiatan ini belum dibuka. Silakan coba lagi pada atau setelah pukul ${jadwalFromJwt.jam_mulai} WIB.`);
    }

    // Alih-alih mengandalkan data dari JWT, panggil server untuk mendapatkan
    // data jadwal yang lengkap (termasuk target OPD) dan melakukan pengecekan
    // absensi ganda di sisi server. Ini membuat alur sama persis dengan
    // metode input kode manual dan memastikan data selalu up-to-date.
    return await handleServerValidation(jadwalFromJwt.kode_akses);
}

/**
 * Menangani validasi kode akses manual dengan menghubungi server.
 * Fungsi ini akan melakukan pengecekan riwayat lokal (untuk absensi mandiri)
 * dan kemudian memanggil API server yang akan memeriksa absensi ganda di database.
 * Untuk alur admin, fungsi ini akan menggunakan token milik pegawai yang diabsenkan.
 * @param {string} kode - Kode akses manual.
 * @returns {Promise<object|null>} Data jadwal jika valid, atau null jika sudah absen.
 */
async function handleServerValidation(kode, bypassHistoryCheck = false) {
    // Cek riwayat absensi lokal hanya jika tidak di-bypass (misalnya, untuk alur admin).
    if (!bypassHistoryCheck) {
        const token = await localforage.getItem("asn_jwt_token");
        const user = parseJwt(token);
        if (user && user.nip) {
            const currentUserNip = user.nip;
            const riwayatLokal = await localforage.getItem('riwayat_absen') || [];
            const sudahAbsenLokal = riwayatLokal.find(item => item.kode === kode && item.nip === currentUserNip && item.waktu);
            if (sudahAbsenLokal) {
                showLoading(false);
                Swal.fire({ icon: 'warning', title: 'Sudah Pernah Absen', html: `Anda sudah tercatat absensi untuk kegiatan ini pada:<br><b>${formatTanggalWaktuIndonesia(sudahAbsenLokal.waktu)}</b>` });
                return null;
            }
        }
    }

    const cacheBuster = `?v=${Date.now()}`;

    try {
        let response;
        try {
            // 1. Coba ambil dari Worker
            console.log("Mencoba validasi jadwal via Worker...");
            response = await fetch(`${WORKER_URL}/api/jadwal-by-kode/${kode}${cacheBuster}`);
            if (!response.ok) {
                throw new Error(`Worker responded with status ${response.status}`);
            }
        } catch (workerError) {
            // 2. Fallback ke server utama
            console.warn(`Validasi jadwal via Worker gagal (${workerError.message}), fallback ke server utama.`);
            response = await fetchWithAuth(`${API_BASE_URL}/jadwal/${kode}${cacheBuster}`);
        }

        const res = await response.json();
        if (!res.status) {
            throw new Error(res.message);
        }
        return res.data;

    } catch (error) {
        console.error("Gagal memvalidasi jadwal via worker atau origin:", error);
        if (error instanceof SyntaxError) {
            throw new Error('Jadwal tidak ditemukan atau sudah lewat jadwal.');
        }
        throw error;
    }
}


async function masukkanKodeManual() {
    const { value: kode } = await Swal.fire({
        title: 'Masukkan Kode Akses',
        input: 'text',
        inputLabel: 'Masukkan kode yang tertera di bawah QR Code',
        inputPlaceholder: 'Contoh: ABC123XYZ',
        inputAttributes: {
            autocapitalize: 'characters',
            'aria-label': 'Kode Akses Manual'
        },
        showCancelButton: true,
        confirmButtonText: 'Lanjutkan',
        cancelButtonText: 'Batal',
        inputValidator: (value) => {
            if (!value || value.trim().length === 0) {
                return 'Anda harus memasukkan kode!'
            }
        }
    });

    if (kode && kode.trim()) {
        history.back(); // Tutup tampilan scanner
        prosesQrCode(kode.trim().toUpperCase());
    }
}

// ==========================================
// 7. FORM ABSEN (GPS & KAMERA)
// ==========================================
/**
 * Mengatur visibilitas kotak keterangan (untuk user normal) dan opsi admin
 * berdasarkan status absensi (terlambat/luar lokasi) dan alur aplikasi (normal/admin).
 * Fungsi ini dipanggil setelah pengecekan lokasi selesai.
 */
function updateConditionalFormElements() {
    const boxKeteranganUser = document.getElementById('boxKeterangan');
    // --- ALUR USER NORMAL ---
    // Cek apakah user perlu memberikan keterangan.
    const pKeterangan = document.getElementById('labelKeterangan');
    const alasan = [];
    if (isTerlambat) {
        alasan.push('terlambat');
    }
    if (isLuarRadius) {
        alasan.push('berada di luar lokasi');
    }

    if (alasan.length > 0) {
        // Jika ada alasan, tampilkan kotak keterangan.
        const alasanText = alasan.join(' dan ');
        pKeterangan.innerHTML = `Karena Anda terdeteksi <strong>${alasanText}</strong>, mohon isi alasan Anda pada kolom di bawah ini.`;
        boxKeteranganUser.classList.remove('hidden-view');
    } else {
        // Jika tidak, sembunyikan.
        boxKeteranganUser.classList.add('hidden-view');
    }
}

async function cekLokasiOtomatis() {
    const stGeo = document.getElementById('statusGeo');
    const boxGagal = document.getElementById('boxLokasiGagal');
    const stGeoLoading = document.getElementById('statusGeoLoading');

    // Hide failure box and show loading status
    boxGagal.classList.add('hidden-view');
    stGeo.classList.add('hidden-view'); // Pastikan div hasil disembunyikan
    stGeoLoading.classList.remove('hidden-view'); // Tampilkan loading besar

    if (!navigator.geolocation) {
        stGeoLoading.classList.add('hidden-view');
        stGeo.classList.add('hidden-view');
        boxGagal.classList.remove('hidden-view');
        return;
    }

    navigator.geolocation.getCurrentPosition(async (pos) => {
        let radio = document.querySelector('input[name="tipeKehadiran"]:checked');
        if (!radio || radio.value !== 'hadir') return;

        stGeoLoading.classList.add('hidden-view'); // Sembunyikan loading besar
        stGeo.classList.remove('hidden-view'); // Tampilkan div hasil
        const rLat = pos.coords.latitude;
        const rLng = pos.coords.longitude;
        document.getElementById('lat').value = rLat;
        document.getElementById('lng').value = rLng;

        // Mulai proses reverse geocoding untuk mendapatkan alamat
        stGeo.innerHTML = `<span class="inline-block animate-spin mr-1">↻</span> Menerjemahkan alamat...`;
        stGeo.className = "bg-blue-50 text-blue-700 py-2 px-4 rounded-lg text-xs font-bold border border-blue-200";
        const alamat = await getAlamatFromKoordinat(rLat, rLng);

        radio = document.querySelector('input[name="tipeKehadiran"]:checked');
        if (!radio || radio.value !== 'hadir') return;

        document.getElementById('alamat').value = alamat;

        if (currentJadwal.koordinat && currentJadwal.koordinat !== "-") {
            const [tLat, tLng] = currentJadwal.koordinat.replace(/'/g, '').split(',');
            const jarak = getDistanceInMeters(rLat, rLng, parseFloat(tLat), parseFloat(tLng));
            const radius = parseFloat(currentJadwal.radius_meter);

            if (jarak > radius) {
                if (currentJadwal.is_strict_location == 1) {
                    Swal.fire({
                        icon: 'warning',
                        title: 'Lokasi Tidak Sesuai',
                        text: `Anda berada di luar lokasi (${Math.round(jarak)}m). Kegiatan ini tidak mengizinkan absen di luar lokasi. Anda hanya dapat mengajukan Izin/Keterangan.`,
                        confirmButtonColor: '#b91c1c'
                    });
                    const elTipeHadir = document.querySelector('input[name="tipeKehadiran"][value="hadir"]');
                    const elTipeIzin = document.querySelector('input[name="tipeKehadiran"][value="izin"]');
                    if (elTipeHadir && elTipeIzin) {
                        elTipeHadir.disabled = true;
                        elTipeIzin.checked = true;
                        document.getElementById('flowHadir').classList.add('hidden-view');
                        document.getElementById('flowIzin').classList.remove('hidden-view');
                        checkIzinForm();
                    }
                    return;
                }
                stGeo.className = "bg-red-50 text-red-700 py-2 px-4 rounded-lg text-xs font-bold border border-red-200";
                stGeo.innerHTML = `Luar Batas (${Math.round(jarak)}m). <br><small class="font-normal">${alamat}</small>`;
                isLuarRadius = true;
            } else {
                stGeo.className = "bg-green-50 text-green-700 py-2 px-4 rounded-lg text-xs font-bold border border-green-200";
                stGeo.innerHTML = `Lokasi Sesuai (${Math.round(jarak)}m). <br><small class="font-normal">${alamat}</small>`;
                isLuarRadius = false;
            }
        } else {
            stGeo.className = "bg-green-50 text-green-700 py-2 px-4 rounded-lg text-xs font-bold border border-green-200";
            stGeo.innerHTML = `Bebas Lokasi. <br><small class="font-normal">${alamat}</small>`;
            isLuarRadius = false;
        }

        // Setelah lokasi berhasil dideteksi, tampilkan sisa form (kamera, keterangan, dll).
        tampilkanFormLanjutan();
    }, () => {
        stGeoLoading.classList.add('hidden-view');
        stGeo.classList.add('hidden-view');
        boxGagal.classList.remove('hidden-view');

        // Sembunyikan tombol "Lanjutkan" jika strict location
        const btnLanjut = boxGagal.querySelector('button[onclick="lanjutTanpaLokasiValid()"]');
        if (btnLanjut) {
            btnLanjut.style.display = (currentJadwal.is_strict_location == 1) ? 'none' : 'flex';
        }
    }, { enableHighAccuracy: true, timeout: 10000 });
}
function cleanupAbsenForm() {
    // Matikan stream kamera selfie jika sedang aktif
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }

    // (Tindakan defensif) Hentikan juga QR scanner jika ternyata masih aktif
    if (html5QrCode && html5QrCode.isScanning) {
        console.warn("Scanner QR dihentikan secara defensif dari cleanupAbsenForm.");
        html5QrCode.stop().catch(err => console.warn("Gagal menghentikan QR scanner dari cleanupAbsenForm.", err));
        html5QrCode = null;
    }

    // Reset tampilan kamera ke kondisi awal
    ulangFoto();

    // Reset state global yang berhubungan dengan form absensi
    currentJadwal = null;
    isLuarRadius = false;
    isTerlambat = false;
    isAbsenCepatMode = false;
    isProcessingScan = false;

    // Reset nilai input form
    document.getElementById('keterangan').value = '';
}
async function kirimAbsensi() {
    const elTipe = document.querySelector('input[name="tipeKehadiran"]:checked');
    const tipeKehadiran = elTipe ? elTipe.value : 'hadir';

    // Ambil semua data yang dibutuhkan dari elemen form
    const b64 = document.getElementById('fotoBase64').value;
    const lat = document.getElementById('lat').value;
    const lng = document.getElementById('lng').value;
    const alamat = document.getElementById('alamat').value;
    const token = await localforage.getItem("asn_jwt_token");
    const kode = currentJadwal.kode_akses;

    // Tentukan status kehadiran berdasarkan kondisi
    let statusKehadiran;
    let keterangan;
    let statusVerifikasi;

    if (tipeKehadiran === 'izin') {
        const alasan = document.getElementById('alasanIzin').value;
        const ket = document.getElementById('keteranganIzin').value.trim();
        statusKehadiran = alasan; // Set Cuti, Dinas Luar, dsb. langsung
        keterangan = ket || "-";
        statusVerifikasi = "Menunggu Verifikasi Admin";
    } else {
        const baseKeterangan = document.getElementById('keterangan').value.trim();
        statusKehadiran = "Hadir";

        if (isTerlambat && isLuarRadius) {
            statusVerifikasi = "Menunggu Verifikasi Admin";
            keterangan = "Hadir Terlambat Diluar Lokasi - " + baseKeterangan;
        } else if (isTerlambat) {
            statusVerifikasi = "Menunggu Verifikasi Admin";
            keterangan = "Hadir Terlambat - " + baseKeterangan;
        } else if (isLuarRadius) {
            statusVerifikasi = "Menunggu Verifikasi Admin";
            keterangan = "Hadir Diluar Lokasi - " + baseKeterangan;
        } else {
            statusVerifikasi = "Terverifikasi Sistem";
            keterangan = baseKeterangan || "-";
        }
    }

    const useQueue = currentJadwal.aktifkan_antrian == 1;

    showLoading(true, "Mengirim Absensi...");

    try {
        let response;
        let res;

        // Fungsi internal untuk mengirim data ke server utama (PHP) sebagai fallback
        const sendToOriginServer = async () => {
            console.log("Mengirim absensi via: Direct API (Server Utama)");
            const formData = new FormData();
            formData.append('kode_akses', kode);
            formData.append('lat', tipeKehadiran === 'izin' ? '0' : lat);
            formData.append('lng', tipeKehadiran === 'izin' ? '0' : lng);
            formData.append('lokasi', tipeKehadiran === 'izin' ? 'Tidak Hadir / Izin' : alamat);
            formData.append('keterangan', keterangan);
            formData.append('status_kehadiran', statusKehadiran);
            formData.append('status_verifikasi', statusVerifikasi);

            if (tipeKehadiran === 'izin') {
                const fileInput = document.getElementById('buktiIzin');
                if (fileInput.files.length > 0) {
                    formData.append('foto', fileInput.files[0]);
                }
            } else {
                const isPdf = b64.includes('application/pdf');
                const fileExt = isPdf ? 'pdf' : 'jpg';
                const mimeType = isPdf ? 'application/pdf' : 'image/jpeg';
                formData.append('foto', new File([dataURItoBlob(b64)], `absen_selfie.${fileExt}`, { type: mimeType }));
            }

            const originResponse = await fetchWithAuth(`${API_BASE_URL}/absen/submit`, { method: "POST", body: formData, token: token });
            return await originResponse.json();
        };

        if (useQueue && tipeKehadiran !== 'izin') {
            try {
                // 1. Coba kirim ke Worker/Queue
                console.log("Mengirim absensi via: Cloudflare Queue");
                const workerBody = JSON.stringify({
                    kode_akses: kode, kategori: currentJadwal.kategori, lat: lat, lng: lng,
                    lokasi: alamat, keterangan: keterangan, foto_base64: b64,
                    status_kehadiran: statusKehadiran, status_verifikasi: statusVerifikasi
                });
                response = await fetchWithAuth(`${WORKER_URL}/api/absen/submit`, { method: "POST", body: workerBody, token: token });
                if (!response.ok) throw new Error(`Worker merespon dengan status ${response.status}`);
                res = await response.json();
                if (!res.status) throw new Error(res.message || 'Worker mengembalikan status false');
            } catch (workerError) {
                // 2. Jika Worker gagal, fallback ke server utama
                console.warn("Gagal mengirim ke Worker, fallback ke server utama.", workerError.message);
                res = await sendToOriginServer();
                if (!res.status) throw new Error(res.message || "Fallback ke server utama juga gagal.");
                response = { ok: true }; // Anggap OK karena sudah ditangani
            }
        } else {
            // Langsung kirim ke server utama jika antrian tidak aktif
            res = await sendToOriginServer();
            if (!res.status) throw new Error(res.message || "Gagal mengirim ke server utama.");
            response = { ok: true }; // Anggap OK
        }

        // Cek hasil akhir setelah semua logika
        if (response.ok && res.status) {
            const userForHistory = await parseJwt(token);
            if (userForHistory && userForHistory.nip && currentJadwal) {
                const waktuServer = res.data?.waktu || getCurrentServerTime().toISOString();
                simpanRiwayatLokal(currentJadwal.judul, currentJadwal.kategori, waktuServer, currentJadwal.kode_akses, userForHistory.nip);
            }
            Swal.fire('BERHASIL!', res.message || 'Data Absensi telah diterima.', 'success');
            batalAbsen();
        } else {
            // Error ini akan ditangkap oleh blok catch di bawah
            throw new Error(res.message || "Terjadi kesalahan dari server.");
        }
    } catch (e) {
        console.error("Error saat kirim absensi:", e);
        Swal.fire("Gagal Mengirim", "Tidak dapat mengirim data absensi. Periksa koneksi internet Anda dan coba lagi.", "error");
    } finally {
        showLoading(false);
    }
}


async function adminCepatKirimAbsensi(userToken) {
    try {
        const userData = parseJwt(userToken, true);
        if (!userData) {
            Swal.fire({ toast: true, position: 'bottom', icon: 'error', title: `Token Pegawai Tidak Valid`, showConfirmButton: false, timer: 2000 });
            return;
        }

        const jadwal = adminCepatState.jadwal;

        // Cek strict time setiap kali mau kirim, karena waktu berjalan saat scan
        if (jadwal.is_strict_time == 1) {
            const nowTime = getCurrentServerTime().getTime();
            const eventEndStr = `${jadwal.tanggal}T${jadwal.jam_selesai}:00+07:00`;
            const endTime = new Date(eventEndStr).getTime();
            if (nowTime > endTime) {
                Swal.fire({ toast: true, position: 'bottom', icon: 'error', title: `Gagal: Kegiatan Berakhir (Strict Time)`, showConfirmButton: false, timer: 3000 });
                return;
            }
        }

        const kode = jadwal.kode_akses;
        const statusKehadiran = adminCepatState.status_kehadiran;
        const statusVerifikasi = adminCepatState.status_verifikasi;
        const keteranganAdmin = adminCepatState.keterangan;

        // Ambil lokasi dari state (sudah divalidasi sebelumnya)
        const lat = adminCepatState.lat || '0';
        const lng = adminCepatState.lng || '0';

        if (!keteranganAdmin) {
            Swal.fire('Gagal', 'Keterangan wajib diisi.', 'error');
            return;
        }

        let response;
        let res;
        const adminToken = await localforage.getItem("asn_jwt_token");

        try {
            // 1. Coba kirim ke Worker/Queue
            const workerUrl = `${WORKER_URL}/api/absen-cepat/submit`;
            console.log("Mengirim absensi cepat via: Cloudflare Queue");
            const workerBody = JSON.stringify({
                user_token: userToken,
                kode_akses: kode,
                kategori: jadwal.kategori,
                lat: lat, lng: lng, lokasi: 'Absensi Cepat oleh Admin',
                keterangan: keteranganAdmin,
                status_kehadiran: statusKehadiran,
                status_verifikasi: statusVerifikasi,
            });
            response = await fetchWithAuth(workerUrl, { method: "POST", body: workerBody, token: adminToken });
            if (!response.ok) throw new Error(`Worker merespon dengan status ${response.status}`);
            res = await response.json();
            if (!res.status) throw new Error(res.message || 'Worker mengembalikan status false');
        } catch (workerError) {
            // 2. Jika Worker gagal, fallback ke server PHP
            console.warn("Gagal mengirim absensi cepat ke Worker, fallback ke server utama.", workerError.message);

            const fallbackUrl = `${API_BASE_URL}/absen-cepat/submit`;
            const fallbackBody = new FormData();
            fallbackBody.append('user_token', userToken);
            fallbackBody.append('kode_akses', kode);
            fallbackBody.append('lat', lat);
            fallbackBody.append('lng', lng);
            fallbackBody.append('lokasi', 'Absensi Cepat oleh Admin');
            fallbackBody.append('keterangan', keteranganAdmin);
            fallbackBody.append('status_kehadiran', statusKehadiran);
            fallbackBody.append('status_verifikasi', statusVerifikasi);

            response = await fetchWithAuth(fallbackUrl, { method: "POST", body: fallbackBody, token: adminToken });
            res = await response.json();
        }

        if (response.ok && res.status) {
            Swal.fire({ toast: true, position: 'bottom', icon: 'success', title: `Berhasil: ${userData.nama}`, showConfirmButton: false, timer: 1500, timerProgressBar: true });
        } else {
            Swal.fire({ toast: true, position: 'bottom', icon: 'error', title: `Gagal: ${res.message || 'Error'}`, showConfirmButton: false, timer: 2000 });
        }
    } catch (e) {
        console.error("Error saat kirim absensi cepat:", e);
        Swal.fire({ toast: true, position: 'bottom', icon: 'error', title: `Gagal: ${e.message || 'Error Koneksi'}`, showConfirmButton: false, timer: 2000 });
        // Lemparkan kembali error agar bisa ditangkap oleh pemanggil jika perlu.
        throw e;
    }
    // Blok 'finally' yang sebelumnya ada di sini telah dihapus.
}

function tampilkanFormLanjutan() {
    document.getElementById('form-absen-lanjutan').classList.remove('hidden-view');
    mulaiKameraSelfie();
    updateConditionalFormElements();

    // FIX: Memastikan event listener untuk kolom keterangan selalu aktif
    // saat form ditampilkan untuk mengatasi bug tombol kirim yang tidak aktif.
    document.getElementById('keterangan').oninput = validasiTombolKirim;
    validasiTombolKirim();
}

/**
 * Menghitung jarak antara dua koordinat geografis dalam meter menggunakan formula Haversine.
 * @param {number} lat1 Latitude titik pertama.
 * @param {number} lon1 Longitude titik pertama.
 * @param {number} lat2 Latitude titik kedua.
 * @param {number} lon2 Longitude titik kedua.
 * @returns {number} Jarak dalam meter.
 */
function getDistanceInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Radius bumi dalam meter
    const φ1 = lat1 * Math.PI / 180; // φ, λ dalam radian
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Jarak dalam meter
}

function lanjutTanpaLokasiValid() {
    if (currentJadwal && currentJadwal.is_strict_location == 1) {
        Swal.fire({
            icon: 'warning',
            title: 'Lokasi Diwajibkan',
            text: 'Kegiatan ini mewajibkan Anda berada di lokasi. Absen tanpa lokasi tidak diizinkan, Anda hanya dapat mengajukan Izin/Keterangan.',
            confirmButtonColor: '#b91c1c'
        });
        const elTipeHadir = document.querySelector('input[name="tipeKehadiran"][value="hadir"]');
        const elTipeIzin = document.querySelector('input[name="tipeKehadiran"][value="izin"]');
        if (elTipeHadir && elTipeIzin) {
            elTipeHadir.disabled = true;
            elTipeIzin.checked = true;
            document.getElementById('flowHadir').classList.add('hidden-view');
            document.getElementById('flowIzin').classList.remove('hidden-view');
            checkIzinForm();
        }
        return;
    }

    document.getElementById('statusGeoLoading').classList.add('hidden-view');
    isLuarRadius = true; // Force status to be 'luar lokasi'

    // Set placeholder values for coordinates and address to allow submission
    document.getElementById('lat').value = '0';
    document.getElementById('lng').value = '0';
    document.getElementById('alamat').value = 'Lokasi GPS tidak terdeteksi';

    const stGeo = document.getElementById('statusGeo');
    const boxGagal = document.getElementById('boxLokasiGagal');

    // Hide failure box and show a status message
    boxGagal.classList.add('hidden-view');
    stGeo.classList.remove('hidden-view');
    stGeo.className = "bg-yellow-50 text-yellow-700 py-2 px-4 rounded-lg text-xs font-bold border border-yellow-200";
    stGeo.innerHTML = `LOKASI TIDAK VALID. <br><small class="font-normal">Melanjutkan absensi dengan status "Di Luar Lokasi".</small>`;

    // Show the rest of the form
    // Tampilkan sisa form (kamera, keterangan, dll) meskipun lokasi gagal.
    tampilkanFormLanjutan();
}

async function getAlamatFromKoordinat(lat, lng) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);
        if (!response.ok) {
            return `${lat},${lng}`; // Fallback ke koordinat jika API error
        }
        const data = await response.json();
        // display_name adalah alamat lengkap yang disediakan oleh Nominatim
        return data.display_name || `${lat},${lng}`;
    } catch (error) {
        console.error("Gagal melakukan reverse geocoding:", error);
        return `${lat},${lng}`; // Fallback ke koordinat jika ada error jaringan
    }
}

async function mulaiKameraSelfie() {
    const v = document.getElementById('kamera');
    const cameraSelect = document.getElementById('selfie-camera-select');
    const cameraContainer = document.getElementById('selfie-camera-selection-container');

    // Hentikan stream yang mungkin masih berjalan sebelum memulai yang baru
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
    }

    // Fungsi internal untuk memulai stream dengan deviceId tertentu
    const startStream = async (deviceId) => {
        // Hentikan lagi untuk memastikan saat berganti kamera
        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
        }
        const constraints = {
            audio: false,
            video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "user" }
        };
        try {
            videoStream = await navigator.mediaDevices.getUserMedia(constraints);
            v.srcObject = videoStream;
        } catch (e) {
            console.error("Gagal memulai kamera selfie:", e);
            Swal.fire("Error Kamera", "Gagal memulai kamera selfie. Pastikan izin telah diberikan.", "error");
        }
    };

    // Logika utama untuk mendeteksi dan menampilkan pilihan kamera
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        if (videoDevices && videoDevices.length > 1) {
            cameraContainer.classList.remove('hidden-view');
            cameraSelect.innerHTML = '';
            let defaultCameraId = '';

            videoDevices.forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Kamera ${index + 1}`;

                // Heuristik pemilihan default: prioritaskan kamera depan.
                const isFrontCamera = device.label.toLowerCase().includes('front') || device.label.toLowerCase().includes('depan') || device.label.toLowerCase().includes('user');

                if (isFrontCamera) {
                    option.selected = true;
                    defaultCameraId = device.deviceId;
                }
                cameraSelect.appendChild(option);
            });

            if (!defaultCameraId) defaultCameraId = videoDevices[0].deviceId;

            cameraSelect.onchange = () => startStream(cameraSelect.value);
            startStream(defaultCameraId);
        } else {
            cameraContainer.classList.add('hidden-view');
            startStream(); // Mulai kamera default jika hanya ada satu atau tidak ada
        }
    } catch (err) {
        console.error("Gagal mendapatkan daftar kamera selfie:", err);
        cameraContainer.classList.add('hidden-view');
        startStream(); // Fallback jika terjadi error
    }
}

function ambilFoto() {
    const v = document.getElementById('kamera');
    const canv = document.getElementById('canvas');
    // --- PENINGKATAN: MENGECILKAN UKURAN FOTO ---
    // Mengubah lebar canvas dari 400 menjadi 320 akan mengurangi resolusi dan ukuran file secara signifikan.
    canv.width = 320;
    canv.height = (v.videoHeight / v.videoWidth) * canv.width;
    canv.getContext('2d').drawImage(v, 0, 0, canv.width, canv.height);

    // Mengubah kualitas JPEG dari 0.6 menjadi 0.5 juga akan mengurangi ukuran file.
    // Nilai antara 0.4 - 0.6 biasanya merupakan kompromi yang baik antara ukuran dan kualitas.
    const b64 = canv.toDataURL('image/jpeg', 0.5);
    document.getElementById('fotoBase64').value = b64;
    document.getElementById('hasilFoto').src = b64;

    v.classList.add('hidden-view');
    document.getElementById('hasilFoto').classList.remove('hidden-view');

    const pdfPreview = document.getElementById('pdfPreviewContainer');
    if (pdfPreview) pdfPreview.classList.add('hidden-view');

    const btnJepret = document.getElementById('btnJepret');
    if (btnJepret) btnJepret.classList.add('hidden-view');

    const btnUpload = document.getElementById('btnUploadManual');
    if (btnUpload) btnUpload.classList.add('hidden-view');

    const btnUlang = document.getElementById('btnUlang');
    if (btnUlang) btnUlang.classList.remove('hidden-view');

    validasiTombolKirim();
}

async function handleManualUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 1048576) {
        Swal.fire('Error', 'Ukuran file maksimal 1MB', 'error');
        event.target.value = '';
        return;
    }

    const isPdf = file.type === 'application/pdf';

    const reader = new FileReader();
    reader.onload = function (e) {
        const b64 = e.target.result;
        document.getElementById('fotoBase64').value = b64;

        const kamera = document.getElementById('kamera');
        if (kamera) kamera.classList.add('hidden-view');

        const btnJepret = document.getElementById('btnJepret');
        if (btnJepret) btnJepret.classList.add('hidden-view');

        const btnUpload = document.getElementById('btnUploadManual');
        if (btnUpload) btnUpload.classList.add('hidden-view');

        const btnUlang = document.getElementById('btnUlang');
        if (btnUlang) btnUlang.classList.remove('hidden-view');

        const pdfPreview = document.getElementById('pdfPreviewContainer');
        const hasilFoto = document.getElementById('hasilFoto');
        const pdfFileName = document.getElementById('pdfFileName');

        if (isPdf) {
            if (hasilFoto) hasilFoto.classList.add('hidden-view');
            if (pdfPreview) pdfPreview.classList.remove('hidden-view');
            if (pdfFileName) pdfFileName.textContent = file.name;
        } else {
            if (pdfPreview) pdfPreview.classList.add('hidden-view');
            if (hasilFoto) {
                hasilFoto.classList.remove('hidden-view');
                hasilFoto.src = b64;
            }
        }

        validasiTombolKirim();
    };
    reader.readAsDataURL(file);
}

function ulangFoto() {
    document.getElementById('fotoBase64').value = "";
    document.getElementById('hasilFoto').classList.add('hidden-view');

    const pdfPreview = document.getElementById('pdfPreviewContainer');
    if (pdfPreview) pdfPreview.classList.add('hidden-view');

    const fileUpload = document.getElementById('fileUploadManual');
    if (fileUpload) fileUpload.value = "";

    const kamera = document.getElementById('kamera');
    if (kamera) kamera.classList.remove('hidden-view');

    const btnJepret = document.getElementById('btnJepret');
    if (btnJepret) btnJepret.classList.remove('hidden-view');

    const btnUpload = document.getElementById('btnUploadManual');
    if (btnUpload) btnUpload.classList.remove('hidden-view');

    const btnUlang = document.getElementById('btnUlang');
    if (btnUlang) btnUlang.classList.add('hidden-view');

    validasiTombolKirim();
}

function validasiTombolKirim() {
    const b64 = document.getElementById('fotoBase64').value;
    const latValue = document.getElementById('lat').value;
    const btnKirim = document.getElementById('btnKirim');

    let isFormValid = false;

    // Validasi untuk alur normal
    const ket = document.getElementById('keterangan').value.trim();
    const wajibKeterangan = isLuarRadius || isTerlambat;
    const isKoordinatOk = latValue !== null && latValue !== '';
    const isKeteranganOk = !wajibKeterangan || ket !== '';
    isFormValid = b64 && isKoordinatOk && isKeteranganOk;

    if (isFormValid) {
        btnKirim.disabled = false;
        btnKirim.className = "w-full bg-red-700 active:scale-95 text-white font-extrabold py-4 rounded-xl shadow-[0_5px_15px_rgba(185,28,28,0.4)] transition-all flex items-center justify-center gap-2";
    } else {
        btnKirim.disabled = true;
        btnKirim.className = "w-full bg-gray-300 text-gray-500 font-extrabold py-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2";
    }
}
function batalAbsen(fromPopState = false) {
    // Lakukan cleanup SEKARANG, baik dipanggil dari tombol UI maupun dari popstate.
    cleanupAbsenForm();

    // Reset UI form untuk persiapan jika dibuka lagi.
    document.getElementById('formJudul').innerText = '-';
    document.getElementById('formKategori').innerText = "";
    document.getElementById('formKode').innerText = "";
    document.getElementById('formWaktu').innerText = "";

    // Jika fungsi ini dipanggil dari tombol UI, lakukan navigasi kembali.
    // Jika dipanggil dari popstate, navigasi sudah terjadi, jadi kita hanya perlu
    // memastikan view yang benar ditampilkan.
    if (!fromPopState && location.hash === '#form') {
        history.back();
    } else {
        // Ini akan dipanggil oleh popstate atau setelah submit sukses.
        switchView('view-dashboard');
    }
}


function dataURItoBlob(dataURI) {
    const byteString = atob(dataURI.split(',')[1]);
    const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeString });
}

/**
 * Menyiapkan dan menampilkan UI form absensi setelah validasi jadwal berhasil.
 * @param {object} jadwalData - Objek data jadwal yang sudah divalidasi.
 */
async function setupAbsenForm(jadwalData) {
    showLoading(false); // Pastikan loading disembunyikan
    currentJadwal = jadwalData;

    const nowTime = Date.now();
    const eventEndStr = `${currentJadwal.tanggal}T${currentJadwal.jam_selesai}:00+07:00`;
    const endTime = new Date(eventEndStr).getTime();
    isTerlambat = nowTime > endTime;

    let forceIzin = false;
    if (isTerlambat && currentJadwal.is_strict_time == 1) {
        showLoading(false);
        Swal.fire({
            icon: 'warning',
            title: 'Waktu Habis',
            text: 'Waktu absensi telah berakhir untuk kegiatan ini. Anda hanya dapat mengajukan Izin/Keterangan.',
            confirmButtonColor: '#b91c1c'
        });
        forceIzin = true;
    }

    // Isi detail jadwal ke dalam elemen-elemen di form
    document.getElementById('formJudul').innerText = currentJadwal.judul;
    document.getElementById('formKategori').innerText = currentJadwal.kategori;
    document.getElementById('formKode').innerText = currentJadwal.kode_akses;
    document.getElementById('formKategori').parentElement.classList.remove('hidden-view');
    document.getElementById('formKode').parentElement.classList.remove('hidden-view');
    const tanggalFormatted = new Date(currentJadwal.tanggal).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    document.getElementById('formWaktu').innerText = `${tanggalFormatted} (${currentJadwal.jam_mulai} - ${currentJadwal.jam_selesai} WIB)`;

    // Sembunyikan elemen-elemen UI yang mungkin masih terlihat dari sesi sebelumnya
    document.getElementById('form-absen-lanjutan').classList.add('hidden-view');
    document.getElementById('boxLokasiGagal').classList.add('hidden-view');
    document.getElementById('statusGeo').classList.add('hidden-view');
    document.getElementById('statusGeoLoading').classList.remove('hidden-view');
    document.getElementById('keterangan').value = '';

    // Reset Tipe Kehadiran & form Izin
    const elTipeHadir = document.querySelector('input[name="tipeKehadiran"][value="hadir"]');
    const elTipeIzin = document.querySelector('input[name="tipeKehadiran"][value="izin"]');
    if (elTipeHadir && elTipeIzin) {
        elTipeHadir.disabled = forceIzin;
        if (forceIzin) {
            elTipeIzin.checked = true;
            document.getElementById('flowHadir').classList.add('hidden-view');
            document.getElementById('flowIzin').classList.remove('hidden-view');
        } else {
            // Kosongkan pilihan, tunggu user memilih
            elTipeHadir.checked = false;
            elTipeIzin.checked = false;
            document.getElementById('flowHadir').classList.add('hidden-view');
            document.getElementById('flowIzin').classList.add('hidden-view');
            document.getElementById('statusGeoLoading').classList.add('hidden-view');
        }

        document.getElementById('alasanIzin').value = '';
        document.getElementById('keteranganIzin').value = '';
        document.getElementById('buktiIzin').value = '';
        checkIzinForm(); // panggil untuk disable/enable tombol kirim
    }

    // Tambahkan state ke history browser untuk navigasi tombol kembali
    history.pushState({ view: 'form' }, "Konfirmasi Kehadiran", '#form');

    // Matikan kamera terlebih dahulu saat form awal dirender
    if (typeof videoStream !== 'undefined' && videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }

    window._isHadirStarted = false;

    switchView('view-form');
}
/**
 * Handler utama setelah QR code berhasil dipindai.
 * Membedakan antara alur absensi normal dan alur absensi cepat admin.
 * @param {string} decodedText - Teks dari hasil pindaian QR.
 */
async function handleScanSuccess(decodedText) {
    // Alur Absensi Cepat Admin (Continuous Scan)
    if (isAbsenCepatMode) {
        // 1. Langsung hentikan scanner untuk mencegah pindaian ganda saat proses berlangsung.
        if (html5QrCode && html5QrCode.isScanning) {
            await html5QrCode.stop().catch(err => console.warn("Gagal menghentikan scanner setelah sukses.", err));
        }

        const isProfileToken = decodedText.startsWith("BB:");
        if (isProfileToken) {
            // 2. Jika QR valid, tampilkan loading dan proses absensi.
            showLoading(true, "Memproses Absensi...");
            const token = decodedText.replace("BB:", "");
            try {
                // Panggil fungsi pengiriman, yang akan menampilkan notifikasi toast sendiri.
                await adminCepatKirimAbsensi(token);
            } catch (e) {
                // Menangkap error tak terduga dari fungsi pengiriman.
                console.error("Terjadi kesalahan tidak terduga saat mengirim absensi cepat:", e);
                Swal.fire("Error", "Terjadi kesalahan tidak terduga.", "error");
            } finally {
                // 3. Setelah selesai (baik sukses atau gagal), sembunyikan loading.
                showLoading(false);
                // Beri jeda singkat agar pengguna bisa melihat notifikasi toast.
                setTimeout(() => {
                    // 4. Mulai ulang scanner untuk pindaian berikutnya.
                    // Pastikan kita masih dalam mode absen cepat.
                    if (isAbsenCepatMode) {
                        const selectedCameraId = document.getElementById('camera-select').value;
                        _startScanner(selectedCameraId);
                    }
                }, 500); // Jeda 0.5 detik
            }
        } else {
            // 5. Jika QR tidak valid, tampilkan pesan error yang memblokir.
            Swal.fire({
                title: "QR Code Tidak Sesuai",
                text: "Harap pindai QR Code Profil Pegawai yang valid (diawali dengan 'BB:').",
                icon: "error",
                confirmButtonText: "Coba Lagi"
            }).then((result) => {
                // 6. Setelah pengguna menekan "OK", mulai ulang scanner.
                if (isAbsenCepatMode) {
                    const selectedCameraId = document.getElementById('camera-select').value;
                    _startScanner(selectedCameraId);
                }
            });
        }
    } else { // Alur Absensi Normal (tidak berubah)
        if (html5QrCode && html5QrCode.isScanning) {
            await html5QrCode.stop().catch(err => console.warn("Gagal menghentikan scanner setelah sukses.", err));
        }
        handleDecodedQrText(decodedText);
    }
}

// ==========================================
// FUNGSI UNTUK ALUR TIDAK HADIR (IZIN/CUTI)
// ==========================================
function toggleTipeKehadiran() {
    const radio = document.querySelector('input[name="tipeKehadiran"]:checked');
    if (!radio) return; // Jika belum ada yg dipilih, diamkan
    const tipe = radio.value;
    const flowHadir = document.getElementById('flowHadir');
    const flowIzin = document.getElementById('flowIzin');
    const btnKirim = document.getElementById('btnKirim');

    if (tipe === 'hadir') {
        flowHadir.classList.remove('hidden-view');
        flowIzin.classList.add('hidden-view');
        // btnKirim disabled diserahkan pada alur ambil lokasi & kamera
        btnKirim.disabled = true;
        btnKirim.className = "w-full bg-gray-300 text-gray-500 font-extrabold py-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2";
        // --- RESET STATE HADIR ---
        document.getElementById('keterangan').value = '';

        if (!window._isHadirStarted) {
            window._isHadirStarted = true;
            ulangFoto();
            cekLokasiOtomatis();
        } else {
            // Jika sudah pernah dimulai dan cek lokasi sudah selesai, 
            // tampilkan ulang kameranya
            const formLanjutan = document.getElementById('form-absen-lanjutan');
            if (formLanjutan) formLanjutan.classList.remove('hidden-view');

            // Nyalakan kembali kamera dan reset foto
            ulangFoto();
            mulaiKameraSelfie();
        }
    } else {
        flowHadir.classList.add('hidden-view');
        flowIzin.classList.remove('hidden-view');
        const formLanjutan = document.getElementById('form-absen-lanjutan');
        if (formLanjutan) formLanjutan.classList.add('hidden-view');

        // --- RESET STATE IZIN ---
        document.getElementById('alasanIzin').value = '';
        document.getElementById('keteranganIzin').value = '';
        document.getElementById('buktiIzin').value = '';

        checkIzinForm(); // cek form izin untuk enable btnKirim

        // Matikan kamera jika menyala karena pindah ke tab Izin
        if (typeof videoStream !== 'undefined' && videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
            videoStream = null;
        }
    }
}

function checkIzinForm() {
    const radio = document.querySelector('input[name="tipeKehadiran"]:checked');
    if (!radio || radio.value !== 'izin') return;

    const alasan = document.getElementById('alasanIzin').value;
    const ket = document.getElementById('keteranganIzin').value.trim();
    const bukti = document.getElementById('buktiIzin');
    const btnKirim = document.getElementById('btnKirim');

    // Validasi dasar
    let isValid = true;
    if (!alasan || alasan === "") isValid = false;
    if (ket === "") isValid = false;
    if (bukti.files.length === 0) isValid = false;

    // Validasi File
    if (bukti.files.length > 0) {
        const file = bukti.files[0];
        const fileSizeMB = file.size / (1024 * 1024);
        const fileExt = file.name.split('.').pop().toLowerCase();

        if (fileSizeMB > 1.05) {
            isValid = false;
            Swal.fire('File Terlalu Besar', 'Ukuran maksimal file bukti dukung adalah 1 MB.', 'warning');
            bukti.value = '';
        } else if (!['jpg', 'jpeg', 'png', 'pdf'].includes(fileExt)) {
            isValid = false;
            Swal.fire('Format Tidak Sesuai', 'File harus berupa gambar (JPG/PNG) atau PDF.', 'warning');
            bukti.value = '';
        }
    }

    if (isValid) {
        btnKirim.disabled = false;
        btnKirim.className = "w-full bg-red-600 hover:bg-red-700 text-white font-extrabold py-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer";
    } else {
        btnKirim.disabled = true;
        btnKirim.className = "w-full bg-gray-300 text-gray-500 font-extrabold py-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2";
    }
}

// EXPORTS UNTUK TESTING (Diabaikan oleh browser)
if (typeof module !== 'undefined') {
    if (module.exports) {
        module.exports = { getDistanceInMeters, parseJwt, switchView, toggleTipeKehadiran, batalAbsen };
    }
}
