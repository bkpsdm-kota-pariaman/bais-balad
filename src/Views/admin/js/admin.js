let currentJadwalData = [];
let currentPegawaiData = [];
let currentOpdData = [];
// File: public_html/admin.js

const ORIGIN_SERVER_URL = 'https://api-esdm.pariamankota.go.id/beta-bais-pariaman';
const API_BASE_URL = `${ORIGIN_SERVER_URL}/api`;
const WORKER_URL = "https://absensi-kegiatan-asn-worker.bidpp-bkpsdm.workers.dev";
let allOpdList = [];
let qrCodeInstance = null;
let currentRekapData = { jadwal: null, filtered_pegawai: [] };
let mapAdd, circleAdd, markerAdd;
let mapEdit, circleEdit, markerEdit;
let currentQrData = { kode: '', judul: '' };
let opdState = { add: { available: [], selected: [] }, edit: { available: [], selected: [] } };


let paginasiState = { page: 1, limit: 10 };

function resetPaginasi() {
    paginasiState.page = 1;
    paginasiState.limit = 10;

    const containers = [
        'jadwalPagination', 'jadwalPaginationTop',
        'pegawaiPagination', 'pegawaiPaginationTop',
        'rekapPagination', 'rekapPaginationTop',
        'rekapKeseluruhanPagination', 'rekapKeseluruhanPaginationTop',
        'statistikPagination', 'statistikPaginationTop'
    ];

    containers.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('d-none');
    });
}

function gantiPage(fitur, page, limit) {
    paginasiState.page = page;
    paginasiState.limit = limit;

    switch (fitur) {
        case 'jadwal': loadJadwalKegiatan(true); break;
        case 'pegawai': loadPegawai(true); break;
        case 'rekap': terapkanFilterRekap(true); break;
        case 'rekapKeseluruhan': terapkanFilterRekapKeseluruhan(true); break;
        case 'statistik': terapkanFilterStatistik(true); break;
        case 'logAbsensi': terapkanFilterLogAbsensi(true); break;
    }
}

function renderPaginationControls(containerId, paginationData, onPageChangeName) {
    if (!paginationData) return;

    const { current_page: currentPage, limit, total_pages: totalPages, total_rows: totalRows } = paginationData;
    const containerBottom = document.getElementById(containerId);
    const containerTop = document.getElementById(containerId + "Top");

    if (!containerBottom) return;

    if (totalRows === 0) {
        if (containerTop) containerTop.classList.add('d-none');
        containerBottom.classList.add('d-none');
        return;
    }

    if (containerTop) containerTop.classList.remove('d-none');
    containerBottom.classList.remove('d-none');


    let exportBtnHtml = '';
    if (onPageChangeName === 'jadwal') {
        exportBtnHtml = '<button class="btn btn-outline-success btn-sm fw-bold ms-3" onclick="exportJadwalToExcel()"><i class="bi bi-file-earmark-excel-fill"></i> Download Excel</button>';
    } else if (onPageChangeName === 'pegawai') {
        exportBtnHtml = '<button class="btn btn-outline-success btn-sm fw-bold ms-3" onclick="exportPegawaiToExcel()"><i class="bi bi-file-earmark-excel-fill"></i> Download Excel</button>';
    } else if (onPageChangeName === 'rekap') {
        exportBtnHtml = '<button class="btn btn-outline-success btn-sm fw-bold ms-3" onclick="exportRekapToExcel()"><i class="bi bi-file-earmark-excel-fill"></i> Download Excel</button>';
    } else if (onPageChangeName === 'rekapKeseluruhan') {
        exportBtnHtml = '<button class="btn btn-outline-success btn-sm fw-bold ms-3" onclick="exportRekapKeseluruhanToExcel()"><i class="bi bi-file-earmark-excel-fill"></i> Download Excel</button>';
    } else if (onPageChangeName === 'statistik') {
        exportBtnHtml = '<button class="btn btn-outline-success btn-sm fw-bold ms-3" onclick="exportStatistikToExcel()"><i class="bi bi-file-earmark-excel-fill"></i> Download Excel</button>';
    } else if (onPageChangeName === 'logAbsensi') {
        exportBtnHtml = '<button class="btn btn-outline-success btn-sm fw-bold ms-3" onclick="exportLogAbsensiToExcel()"><i class="bi bi-file-earmark-excel-fill"></i> Download Excel</button>';
    }

    let htmlTop = `
        <div class="d-flex flex-wrap gap-3 justify-content-between align-items-center bg-white py-2 px-3 border rounded shadow-sm mb-3">
            <div class="small text-muted mb-2 mb-md-0 d-flex align-items-center">
                <span>Total Data: <span class="fw-bold text-dark">${totalRows}</span></span>
                ${exportBtnHtml}
            </div>
            <div class="d-flex flex-wrap align-items-center gap-2">
                <span class="small text-muted">Tampilkan</span>
                <select class="form-select form-select-sm" style="width: auto;" onchange="gantiPage('${onPageChangeName}', 1, this.value)">
                    <option value="10" ${limit == 10 ? 'selected' : ''}>10</option>
                    <option value="25" ${limit == 25 ? 'selected' : ''}>25</option>
                    <option value="50" ${limit == 50 ? 'selected' : ''}>50</option>
                    <option value="100" ${limit == 100 ? 'selected' : ''}>100</option>
                    <option value="999999" ${limit == 999999 ? 'selected' : ''}>Semua Data</option>
                </select>
                <span class="small text-muted">baris</span>
            </div>
        </div>
    `;


    let htmlBottom = `
        <nav aria-label="Page navigation" class="mt-3 overflow-auto">
            <ul class="pagination justify-content-center mb-0 flex-wrap gap-1">
                <li class="page-item ${currentPage <= 1 ? 'disabled' : ''}">
                    <button class="page-link" onclick="gantiPage('${onPageChangeName}', ${currentPage - 1}, ${limit})" tabindex="-1">&laquo; Prev</button>
                </li>
    `;

    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, currentPage + 2);

    if (startPage > 1) {
        htmlBottom += `
                <li class="page-item">
                    <button class="page-link" onclick="gantiPage('${onPageChangeName}', 1, ${limit})">1</button>
                </li>
        `;
        if (startPage > 2) {
            htmlBottom += `<li class="page-item disabled"><span class="page-link bg-light border-0">...</span></li>`;
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        htmlBottom += `
                <li class="page-item ${i === currentPage ? 'active' : ''}">
                    <button class="page-link" onclick="gantiPage('${onPageChangeName}', ${i}, ${limit})">${i}</button>
                </li>
        `;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            htmlBottom += `<li class="page-item disabled"><span class="page-link bg-light border-0">...</span></li>`;
        }
        htmlBottom += `
                <li class="page-item">
                    <button class="page-link" onclick="gantiPage('${onPageChangeName}', ${totalPages}, ${limit})">${totalPages}</button>
                </li>
        `;
    }

    htmlBottom += `
                <li class="page-item ${currentPage >= totalPages ? 'disabled' : ''}">
                    <button class="page-link" onclick="gantiPage('${onPageChangeName}', ${currentPage + 1}, ${limit})">Next &raquo;</button>
                </li>
            </ul>
        </nav>
    `;

    if (containerTop) containerTop.innerHTML = htmlTop;
    containerBottom.innerHTML = htmlBottom;
}

const modalBuatKegiatan = new bootstrap.Modal(document.getElementById('modalBuatKegiatan'));
const modalEditKegiatan = new bootstrap.Modal(document.getElementById('modalEditKegiatan'));
const modalQrCode = new bootstrap.Modal(document.getElementById('modalQrCode'));
const modalVerifikasi = new bootstrap.Modal(document.getElementById('modalVerifikasi'));
const modalRingkasan = new bootstrap.Modal(document.getElementById('modalRingkasan'));
const modalPegawai = new bootstrap.Modal(document.getElementById('modalPegawai'));
const modalTambahPeserta = new bootstrap.Modal(document.getElementById('modalTambahPeserta'));
const modalOpd = new bootstrap.Modal(document.getElementById('modalOpd'));
const modalImportAbsen = new bootstrap.Modal(document.getElementById('modalImportAbsen'));

function showAdminLoading(show, title = 'Memproses...') {
    if (show) {
        Swal.fire({
            title: title,
            text: 'Mohon tunggu sebentar...',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });
    } else {
        Swal.close();
    }
}

let currentPegawaiMode = 'add';
let tambahPesertaSearchTimeout = null;
let tambahPesertaState = { available: [], selected: [] }; // State untuk modal tambah peserta dual-list
/**
 * Menangani proses login admin.
 * Fungsi ini dipanggil oleh tombol "Masuk" di admin.html.
 */
async function prosesLogin() {
    const usernameInput = document.getElementById('adminUser');
    const passwordInput = document.getElementById('adminPass');
    const loginButton = document.getElementById('btnLogin');

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
        Swal.fire('Peringatan', 'Username dan Password harus diisi.', 'warning');
        return;
    }

    // Nonaktifkan tombol untuk mencegah klik ganda
    loginButton.disabled = true;
    loginButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Memproses...';

    try {
        const result = await fetchAdmin(`${API_BASE_URL}/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (result.status && result.data.token) {
            // Jika login berhasil, simpan token ke localStorage
            localStorage.setItem('admin_jwt_token', result.data.token);

            // Periksa role untuk menu navigasi super admin
            checkSuperAdminUI();

            // Sembunyikan overlay login dan tampilkan konten admin
            document.getElementById('loginOverlay').style.display = 'none';
            document.getElementById('dashboardContainer').classList.remove('d-none');
            if (document.getElementById('adminNavbar')) document.getElementById('adminNavbar').classList.remove('d-none');

            // Di sini Anda bisa memanggil fungsi untuk memuat data awal dashboard, contoh:
            loadJadwalKegiatan();
        } else {
            // Jika login gagal, tampilkan pesan error
            Swal.fire('Gagal', `Login Gagal: ${result.message}`, 'error');
        }

    } catch (error) {
        Swal.fire('Gagal', `Login Gagal: ${error.message}`, 'error');
    } finally {
        // Aktifkan kembali tombol login
        loginButton.disabled = false;
        loginButton.textContent = 'Masuk';
    }
}

/**
 * Menangani proses logout admin.
 */
function logout() {
    if (confirm('Apakah Anda yakin ingin keluar?')) {
        localStorage.removeItem('admin_jwt_token');
        // Tampilkan kembali halaman login
        window.location.reload();
    }
}

/**
 * Memaksa logout tanpa konfirmasi, biasanya karena sesi berakhir.
 */
function forceLogout() {
    localStorage.removeItem('admin_jwt_token');
    window.location.reload();
}

/**
 * Cek status login saat halaman dimuat.
 */
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('admin_jwt_token');
    if (token) {
        // Periksa role untuk menu navigasi super admin
        checkSuperAdminUI();

        // Jika token ada, anggap sudah login. Sembunyikan overlay.
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('dashboardContainer').classList.remove('d-none');
        if (document.getElementById('adminNavbar')) document.getElementById('adminNavbar').classList.remove('d-none');
        loadJadwalKegiatan();
    }
    // Jika tidak ada token, overlay login akan tampil secara default.

    // Inisialisasi Flatpickr
    flatpickr("#newTanggal", { locale: "id", altInput: true, altFormat: "j F Y", dateFormat: "Y-m-d" });
    flatpickr("#editTanggal", { locale: "id", altInput: true, altFormat: "j F Y", dateFormat: "Y-m-d" });

    // Inisialisasi peta saat modal ditampilkan untuk menghindari masalah blank map
    const modalBuatElement = document.getElementById('modalBuatKegiatan');
    modalBuatElement.addEventListener('shown.bs.modal', () => initMap('add'));

    const modalEditElement = document.getElementById('modalEditKegiatan');
    modalEditElement.addEventListener('shown.bs.modal', () => initMap('edit'));

    // Add event listener for search on Enter key
    document.getElementById('pegawaiSearchInput').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            loadPegawai(); // Memungkinkan pencarian dengan tombol Enter
        }
    });

    // Event listener untuk modal QR code, untuk memastikan QR code dibuat setelah modal sepenuhnya terlihat.
    // Ini memperbaiki bug di mana qrcode.js gagal karena elemen container belum memiliki dimensi.
    const modalQrElement = document.getElementById('modalQrCode');
    modalQrElement.addEventListener('shown.bs.modal', () => {
        const qrContainer = document.getElementById('qrcode');
        const qrText = qrContainer.dataset.qrText;

        if (qrText && qrContainer) {
            // Gunakan timeout kecil untuk memastikan DOM modal telah sepenuhnya di-render oleh browser.
            // Ini adalah workaround untuk race condition di mana elemen container belum memiliki dimensi yang dapat diukur.
            setTimeout(() => {
                qrContainer.innerHTML = ''; // Hapus spinner
                try {
                    qrCodeInstance = new QRCode(qrContainer, {
                        text: qrText,
                        width: 256,
                        height: 256,
                        colorDark: "#000000",
                        colorLight: "#ffffff",
                        correctLevel: QRCode.CorrectLevel.M
                    });
                } catch (error) {
                    console.error('Error generating QR in modal event:', error);
                    qrContainer.innerHTML = '<div class="alert alert-danger">Gagal membuat QR Code. Kesalahan internal.</div>';
                }
            }, 50);
        }
    });

    modalQrElement.addEventListener('hidden.bs.modal', () => {
        const qrContainer = document.getElementById('qrcode');
        if (qrCodeInstance) qrCodeInstance.clear();
        if (qrContainer) qrContainer.removeAttribute('data-qr-text');
        qrCodeInstance = null;
    });
});

/**
 * Helper untuk melakukan fetch request dengan token admin.
 */
async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem('admin_jwt_token');
    const headers = {
        'Authorization': `Bearer ${token}`,
        ...options.headers,
    };

    // Auto set application/json if body is string, else let browser set it (for FormData)
    if (typeof options.body === 'string' && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }

    const overlay = document.getElementById('adminLoadingOverlay');
    const controller = new AbortController();
    const fetchOptions = {
        cache: 'no-store', // Prevent aggressive caching of JSON responses
        ...options,
        headers,
        signal: controller.signal
    };

    if (overlay) overlay.style.display = 'flex';
    let timedOut = false;
    const abortTimeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, 10000);

    try {
        const response = await fetch(url, fetchOptions);
        clearTimeout(abortTimeout);

        let result = null;
        try {
            result = await response.json();
        } catch (jsonErr) {
            throw new Error('Respons dari server tidak valid (Bukan JSON).');
        }

        if (result.code === 401) { // Token expired or invalid
            Swal.fire('Sesi Berakhir', 'Sesi Anda telah berakhir. Silakan login kembali.', 'warning');
            forceLogout();
            throw new Error('Unauthorized');
        }
        return result;
    } catch (e) {
        throw e;
    } finally {
        if (overlay) overlay.style.display = 'none';
    }
}

// Helper fetch dengan timeout + loading + SweetAlert error
async function fetchAdmin(url, options = {}) {
    const overlay = document.getElementById('adminLoadingOverlay');
    let abortTimeout;
    const controller = new AbortController();
    options.signal = controller.signal;
    if (overlay) overlay.style.display = 'flex';
    let timedOut = false;
    abortTimeout = setTimeout(() => { timedOut = true; controller.abort(); }, 10000);
    try {
        const resp = await fetch(url, options);
        clearTimeout(abortTimeout);

        let result = null;
        try {
            result = await resp.json();
        } catch (jsonErr) {
            // Bukan respon JSON
        }

        if (!result) {
            throw new Error('Respons dari server tidak valid (Bukan JSON).');
        }

        if (!resp.ok) {
            const errMsg = result.message ? result.message : ('HTTP ' + resp.status);
            throw new Error(errMsg);
        }
        return result;
    } catch (e) {
        throw e;
    } finally {
        if (overlay) overlay.style.display = 'none';
    }
}
/**
 * Memuat daftar jadwal kegiatan dari server.
 */
async function loadJadwalKegiatan(isFromPagination = false) {
    if (isFromPagination !== true) paginasiState.page = 1;
    const pt = document.getElementById("jadwalPaginationTop"); if (pt) pt.classList.add("d-none");
    const pb = document.getElementById("jadwalPagination"); if (pb) pb.classList.add("d-none");
    const loading = document.getElementById('loading');
    const container = document.getElementById('dashboardContainer');
    loading.classList.remove('d-none');
    container.classList.add('d-none');

    try {
        // Tambahkan parameter unik (timestamp) untuk mencegah browser caching pada request GET
        const result = await fetchWithAuth(`${API_BASE_URL}/admin/jadwal?page=${paginasiState.page}&limit=${paginasiState.limit}&_=${new Date().getTime()}`);
        if (result.status) {
            currentJadwalData = result.data.data;
            renderJadwalTable(currentJadwalData);
            renderPaginationControls('jadwalPagination', result.data.pagination, 'jadwal');
        } else {
            Swal.fire('Gagal', 'Gagal memuat jadwal: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('Error loading jadwal:', error);
    } finally {
        loading.classList.add('d-none');
        container.classList.remove('d-none');
    }
}

/**
 * Merender tabel jadwal kegiatan dari data yang diterima.
 */
function renderJadwalTable(jadwalList) {
    const tbody = document.getElementById('listKegiatanBody');
    tbody.innerHTML = '';
    if (jadwalList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">Belum ada jadwal kegiatan.</td></tr>';
        return;
    }

    jadwalList.forEach((jadwal, index) => {
        let rulesBadges = [];
        if (jadwal.is_strict_location == 1) {
            rulesBadges.push('<span class="badge bg-warning text-dark mb-1 me-1"><i class="bi bi-geo-alt-fill"></i> Wajib di Lokasi</span>');
        }
        if (jadwal.is_strict_time == 1) {
            rulesBadges.push('<span class="badge bg-info text-dark mb-1 me-1"><i class="bi bi-clock-fill"></i> Wajib Tepat Waktu</span>');
        }
        if (jadwal.aktifkan_antrian === '1') {
            rulesBadges.push('<span class="badge bg-danger mb-1 me-1"><i class="bi bi-people-fill"></i> Antrian: Aktif</span>');
        } else if (jadwal.aktifkan_antrian === '0') {
            rulesBadges.push('<span class="badge bg-secondary mb-1 me-1"><i class="bi bi-people-fill"></i> Antrian: Non-Aktif</span>');
        }

        let rulesHtml = rulesBadges.length > 0 ? `<div class="d-flex flex-column gap-1 align-items-center">${rulesBadges.join('')}</div>` : '<span class="text-muted small">-</span>'; let syncStatusHtml = '';
        if (jadwal.kv_sync_status == 1) {
            syncStatusHtml = `
                <div class="d-flex flex-column align-items-center gap-1">
                    <span class="badge bg-danger"><i class="bi bi-check-circle-fill"></i> Sinkron</span>
                    <button class="btn btn-sm btn-outline-info mt-1" onclick="syncJadwalKv('${jadwal.kode_akses}', '${jadwal.judul.replace(/'/g, `\\'`)}')" title="Sinkron Ulang Cache"><i class="bi bi-arrow-repeat"></i> Sinkron Ulang</button>
                </div>
            `;
        } else {
            syncStatusHtml = `
                <div class="d-flex flex-column align-items-center gap-1">
                    <span class="badge bg-warning text-dark"><i class="bi bi-exclamation-triangle-fill"></i> Belum Sinkron</span>
                    <button class="btn btn-sm btn-outline-danger mt-1" onclick="syncJadwalKv('${jadwal.kode_akses}', '${jadwal.judul.replace(/'/g, `\\'`)}')" title="Sinkronkan Cache"><i class="bi bi-arrow-repeat"></i> Sinkronkan</button>
                </div>
            `;
        }
        const row = `
            <tr>
                <td class="text-center">${(paginasiState.page - 1) * paginasiState.limit + index + 1}</td>
                <td>
                    <strong class="d-block">${jadwal.judul}</strong>
                    <small class="text-muted d-block">${new Date(jadwal.tanggal).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</small>
                </td>
                <td class="text-center"><span class="badge bg-info">${jadwal.kategori}</span></td>
                <td>${jadwal.jam_mulai} - ${jadwal.jam_selesai} WIB</td>
                <td class="text-center">
                    ${rulesHtml}
                </td>
                <td class="text-center">${syncStatusHtml}</td>
                <td class="text-center" style="min-width: 160px;">
                    <div class="d-flex flex-column gap-2">
                        <button class="btn btn-danger btn-sm" onclick="lihatRekap('${jadwal.kode_akses}')"><i class="bi bi-pie-chart-fill"></i> Lihat Rekap</button>
                        <div class="btn-group btn-group-sm w-100">
                            <button class="btn btn-outline-danger" onclick="cetakQrCode('${jadwal.kode_akses}', '${jadwal.judul.replace(/'/g, "\\'")}', '${jadwal.tanggal}', '${jadwal.jam_mulai}', '${jadwal.jam_selesai}')" title="Cetak QR Code"><i class="bi bi-qr-code"></i> QR</button>
                            <button class="btn btn-outline-warning" onclick="bukaModalEdit('${jadwal.kode_akses}')" title="Edit Jadwal"><i class="bi bi-pencil-fill"></i> Edit</button>
                            <button class="btn btn-outline-danger" onclick="hapusKegiatan('${jadwal.kode_akses}')" title="Hapus Jadwal"><i class="bi bi-trash-fill"></i> Hapus</button>
                        </div>
                    </div>
                </td>
            </tr>
        `;
        tbody.innerHTML += row;
    });
}

/**
 * Membuka modal untuk membuat kegiatan baru.
 */
async function bukaModalBuatKegiatan() {
    document.getElementById('formKegiatanBaru').reset();
    // Sembunyikan dan reset pengaturan lanjutan
    document.getElementById('advancedSettingsAdd').classList.add('d-none');
    document.getElementById('newAktifkanAntrian').value = '';
    // Reset map state jika sudah ada
    if (mapAdd) {
        const pariamanCoords = [-0.6276, 100.1209];
        document.getElementById('geoLatLang').value = '';
        document.getElementById('geoRadius').value = '100';
        document.getElementById('addStrictLocation').checked = false;
        document.getElementById('addStrictTime').checked = false;
        markerAdd.setLatLng(pariamanCoords);
        circleAdd.setLatLng(pariamanCoords);
        circleAdd.setRadius(100);
        mapAdd.setView(pariamanCoords, 13);
    }
    await initOpdSelector('add', []);
    modalBuatKegiatan.show();
}

async function tampilkanPengaturanLanjutan(mode) {
    const result = await Swal.fire({
        title: 'Pengaturan Lanjutan',
        html: "Opsi ini ditujukan untuk administrator teknis. Mengubah pengaturan ini dapat memengaruhi performa server saat absensi.<br><br><strong>Anda yakin ingin melanjutkan?</strong>",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Ya, Lanjutkan!',
        cancelButtonText: 'Batal'
    });

    if (result.isConfirmed) {
        const containerId = mode === 'add' ? 'advancedSettingsAdd' : 'advancedSettingsEdit';
        const container = document.getElementById(containerId);
        container.classList.remove('d-none');
        container.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

/**
 * =================================================
 * FUNGSI-FUNGSI UNTUK SELEKTOR OPD (DUAL LIST)
 * =================================================
 */

/**
 * Mengirim data jadwal baru ke server.
 */
async function submitKegiatanBaru(event) {
    event.preventDefault();
    const btn = document.getElementById('btnSimpanKegiatan');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Menyimpan...';

    const payload = {
        judul: document.getElementById('newJudul').value,
        kategori: document.getElementById('newKategori').value,
        tanggal: document.getElementById('newTanggal').value,
        jam_mulai: document.getElementById('newJamMulai').value,
        jam_selesai: document.getElementById('newJamSelesai').value,
        koordinat: document.getElementById('geoLatLang').value || '-',
        radius_meter: document.getElementById('geoRadius').value || '100',

        target_opd: opdState.add.selected,
        is_strict_time: document.getElementById('addStrictTime').checked ? 1 : 0,
        is_strict_location: document.getElementById('addStrictLocation').checked ? 1 : 0,
        aktifkan_antrian: document.getElementById('newAktifkanAntrian').value
    };

    try {
        const result = await fetchWithAuth(`${API_BASE_URL}/admin/jadwal`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (result.status) {
            modalBuatKegiatan.hide();
            Swal.fire({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2500, icon: 'success', title: 'Jadwal berhasil dibuat!' });
            loadJadwalKegiatan();
        } else {
            Swal.fire('Gagal', result.message, 'error');
        }
    } catch (error) {
        console.error('Error creating schedule:', error);
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Simpan Jadwal';
    }
}

/**
 * Menghapus jadwal kegiatan.
 */
async function hapusKegiatan(kodeAkses) {
    if (!confirm(`Apakah Anda yakin ingin menghapus jadwal dengan kode ${kodeAkses}? Aksi ini tidak dapat dibatalkan.`)) {
        return;
    }

    try {
        const result = await fetchWithAuth(`${API_BASE_URL}/admin/jadwal/${kodeAkses}`, {
            method: 'DELETE'
        });

        if (result.status) {
            Swal.fire('Sukses', 'Jadwal berhasil dihapus.', 'success');
            loadJadwalKegiatan();
        } else {
            Swal.fire('Gagal', 'Gagal menghapus: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('Error deleting schedule:', error);
    }
}

/**
 * Menampilkan QR code untuk dicetak.
 */
async function cetakQrCode(kodeAkses, judul, tanggal, jamMulai, jamSelesai) {
    currentQrData = { kode: kodeAkses, judul: judul };
    const qrContainer = document.getElementById('qrcode');
    qrContainer.innerHTML = '<div class="spinner-border text-danger" role="status"><span class="visually-hidden">Loading...</span></div><p class="mt-2">Membuat QR Code...</p>';
    qrContainer.removeAttribute('data-qr-text');

    modalQrCode.show();

    // Format tanggal dan waktu untuk ditampilkan
    const tanggalFormatted = new Date(tanggal).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const detailText = `${tanggalFormatted} | ${jamMulai} - ${jamSelesai} WIB`;

    // Update detail di modal
    document.getElementById('qrJudulKegiatan').innerText = judul;
    document.getElementById('qrDetailKegiatan').innerText = detailText;
    document.getElementById('qrKodeAkses').innerText = kodeAkses;

    // Update link install aplikasi secara dinamis
    const installLink = document.getElementById('qrInstallLink');
    const installUrl = window.location.href.replace('admin.html', 'index.html');
    installLink.href = installUrl;
    installLink.innerText = installUrl;

    try {
        const result = await fetchWithAuth(`${API_BASE_URL}/admin/jadwal/generate-token/${kodeAkses}`);
        if (result.status && result.data.token) {
            // Simpan token di data attribute, event 'shown.bs.modal' akan membuat QR code.
            qrContainer.dataset.qrText = result.data.token;
        } else {
            qrContainer.innerHTML = `<div class="alert alert-danger">Gagal membuat QR Code: ${result.message}</div>`;
        }
    } catch (error) {
        console.error('Error generating QR token:', error);
        qrContainer.innerHTML = '<div class="alert alert-danger">Gagal terhubung ke server untuk membuat QR Code.</div>';
    }
}

async function downloadQrCode() {
    showAdminLoading(true, 'Menyiapkan gambar...');
    // Beri sedikit waktu agar UI loading muncul dan gambar QR selesai render
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
        const qrImage = document.querySelector('#qrcode img');
        const judulEl = document.getElementById('qrJudulKegiatan');
        const detailEl = document.getElementById('qrDetailKegiatan');
        const kodeEl = document.getElementById('qrKodeAkses');

        // Pastikan gambar QR sudah dimuat
        if (!qrImage || !qrImage.complete || qrImage.naturalWidth === 0) {
            throw new Error('Gambar QR Code belum siap.');
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const padding = 30;
        const qrSize = 256;
        const textSpacing = 15;
        const titleFontSize = 20;
        const detailFontSize = 14;
        const kodeFontSize = 32;
        const canvasWidth = qrSize + 2 * padding;

        // Hitung tinggi total
        let totalHeight = padding; // Padding atas
        totalHeight += titleFontSize + textSpacing;
        totalHeight += detailFontSize + textSpacing;
        totalHeight += qrSize + textSpacing;
        totalHeight += kodeFontSize + 20 + padding; // 20 untuk padding background kode, lalu padding bawah

        canvas.width = canvasWidth;
        canvas.height = totalHeight;

        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        let currentY = padding;

        // Gambar Judul
        ctx.fillStyle = 'black';
        ctx.font = `bold ${titleFontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top'; // Sejajarkan teks dari atas
        ctx.fillText(judulEl.innerText, canvas.width / 2, currentY);
        currentY += titleFontSize + textSpacing;

        // Gambar Detail
        ctx.font = `${detailFontSize}px sans-serif`;
        ctx.fillStyle = '#6c757d';
        ctx.fillText(detailEl.innerText, canvas.width / 2, currentY);
        currentY += detailFontSize + textSpacing;

        // Gambar QR Code
        ctx.drawImage(qrImage, padding, currentY, qrSize, qrSize);
        currentY += qrSize + textSpacing;

        // Gambar Kode Akses
        ctx.font = `bold ${kodeFontSize}px sans-serif`;
        const kodeText = kodeEl.innerText;
        const kodeTextMetrics = ctx.measureText(kodeText);
        const kodeBgWidth = kodeTextMetrics.width + 40;
        const kodeBgHeight = kodeFontSize + 20;
        const kodeBgX = (canvas.width - kodeBgWidth) / 2;

        ctx.fillStyle = '#e9f5ee'; // Latar hijau muda
        ctx.strokeStyle = '#d1e7dd'; // Border hijau lebih muda
        ctx.lineWidth = 1;
        drawRoundRect(ctx, kodeBgX, currentY, kodeBgWidth, kodeBgHeight, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#0f5132'; // Teks hijau tua
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle'; // Pusatkan teks secara vertikal di dalam kotak
        ctx.fillText(kodeText, canvas.width / 2, currentY + kodeBgHeight / 2);

        const link = document.createElement('a');
        link.download = `QR_${currentQrData.judul.replace(/ /g, '_')}_${currentQrData.kode}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();

    } catch (error) {
        console.error("Gagal membuat gambar QR:", error);
        Swal.fire('Gagal', 'Gagal membuat gambar untuk diunduh. Coba lagi.', 'error');
    } finally {
        showAdminLoading(false);
    }
}

// Fungsi bantuan untuk menggambar kotak dengan sudut tumpul
function drawRoundRect(ctx, x, y, width, height, radius) {
    if (width < 2 * radius) radius = width / 2;
    if (height < 2 * radius) radius = height / 2;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
}

function printQrCode() {
    const printContents = document.getElementById('qrPrintArea').innerHTML;
    const printWindow = window.open('', '', 'height=600,width=800');

    printWindow.document.write('<html><head><title>Cetak QR Code</title>');
    printWindow.document.write('<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">');
    printWindow.document.write('<style>body { padding-top: 50px; } #qrcode img { margin: 0 auto; display: block; }</style>');
    printWindow.document.write('</head><body class="text-center">');
    printWindow.document.write(printContents);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    setTimeout(() => { // Timeout untuk memastikan semua resource (terutama gambar QR) termuat
        printWindow.print();
        printWindow.close();
    }, 500);
}

/**
 * Membuka modal edit dan mengisi data jadwal yang ada.
 */
async function bukaModalEdit(kodeAkses) {
    try {
        const result = await fetchWithAuth(`${API_BASE_URL}/admin/jadwal/${kodeAkses}`);
        if (!result.status) {
            Swal.fire('Gagal', 'Gagal memuat data jadwal: ' + result.message, 'error');
            return;
        }

        const jadwal = result.data;

        // Isi form dengan data yang ada
        document.getElementById('editKodeAkses').value = kodeAkses;
        document.getElementById('editJudul').value = jadwal.judul;
        document.getElementById('editKategori').value = jadwal.kategori;
        flatpickr("#editTanggal").setDate(jadwal.tanggal, true);
        document.getElementById('editJamMulai').value = jadwal.jam_mulai;
        document.getElementById('editJamSelesai').value = jadwal.jam_selesai;
        document.getElementById('editGeoLatLang').value = (jadwal.koordinat && jadwal.koordinat !== '-') ? jadwal.koordinat : '';
        document.getElementById('editGeoRadius').value = jadwal.radius_meter || '100';

        document.getElementById('editStrictTime').checked = (jadwal.is_strict_time == 1);
        document.getElementById('editStrictLocation').checked = (jadwal.is_strict_location == 1);


        // Sembunyikan dan atur nilai untuk pengaturan lanjutan
        document.getElementById('advancedSettingsEdit').classList.add('d-none');
        const antrianSelect = document.getElementById('editAktifkanAntrian');
        // Nilai dari DB bisa null, 0, atau 1. Null harus diperlakukan sebagai string kosong ''.
        antrianSelect.value = (jadwal.aktifkan_antrian === null || jadwal.aktifkan_antrian === undefined) ? '' : jadwal.aktifkan_antrian;

        // Muat dan centang OPD yang menjadi target
        await initOpdSelector('edit', jadwal.target_opd);

        modalEditKegiatan.show();

    } catch (error) {
        console.error('Error opening edit modal:', error);
    }
}

/**
 * Mengirim data jadwal yang telah diperbarui ke server.
 */
async function submitEditKegiatan(event) {
    event.preventDefault();
    const btn = document.getElementById('btnSimpanEditKegiatan');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Memperbarui...';

    const kodeAkses = document.getElementById('editKodeAkses').value;
    const payload = {
        judul: document.getElementById('editJudul').value,
        kategori: document.getElementById('editKategori').value,
        tanggal: document.getElementById('editTanggal').value,
        jam_mulai: document.getElementById('editJamMulai').value,
        jam_selesai: document.getElementById('editJamSelesai').value,
        koordinat: document.getElementById('editGeoLatLang').value || '-',
        radius_meter: document.getElementById('editGeoRadius').value || '100',

        target_opd: opdState.edit.selected,
        is_strict_time: document.getElementById('editStrictTime').checked ? 1 : 0,
        is_strict_location: document.getElementById('editStrictLocation').checked ? 1 : 0,
        aktifkan_antrian: document.getElementById('editAktifkanAntrian').value
    };

    try {
        const result = await fetchWithAuth(`${API_BASE_URL}/admin/jadwal/${kodeAkses}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });

        if (result.status) {
            modalEditKegiatan.hide();
            Swal.fire({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2500, icon: 'success', title: 'Jadwal berhasil diperbarui!' });
            loadJadwalKegiatan();
        } else {
            Swal.fire('Gagal', result.message, 'error');
        }
    } catch (error) {
        console.error('Error updating schedule:', error);
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Perbarui Jadwal';
    }
}

function hapusEditGeofence() {
    document.getElementById('editGeoLatLang').value = '';
    if (markerEdit) {
        const pariamanCoords = [-0.6276, 100.1209];
        markerEdit.setLatLng(pariamanCoords);
        circleEdit.setLatLng(pariamanCoords);
        mapEdit.setView(pariamanCoords, 13);
    }
}

// Placeholder untuk fungsi yang belum diimplementasikan sepenuhnya
function lokasiSayaSaatIni(mode) {
    const map = (mode === 'add') ? mapAdd : mapEdit;
    const marker = (mode === 'add') ? markerAdd : markerEdit;

    if (!map || !navigator.geolocation) {
        Swal.fire('Kesalahan', 'Peta atau Geolocation tidak tersedia di browser Anda.', 'error');
        return;
    }

    map.locate({ setView: true, maxZoom: 16 });
    map.once('locationfound', function (e) {
        marker.setLatLng(e.latlng).fire('dragend');
    });
    map.once('locationerror', function (e) {
        Swal.fire('Gagal', 'Gagal mendapatkan lokasi Anda. Pastikan izin lokasi telah diberikan untuk situs ini.', 'error');
    });
}

function hapusGeofence() {
    document.getElementById('geoLatLang').value = '';
    if (markerAdd) {
        const pariamanCoords = [-0.6276, 100.1209];
        markerAdd.setLatLng(pariamanCoords);
        circleAdd.setLatLng(pariamanCoords);
        mapAdd.setView(pariamanCoords, 13);
    }
}

function updateCircleRadius() {
    const radius = document.getElementById('geoRadius').value;
    if (circleAdd && radius >= 0) {
        circleAdd.setRadius(Number(radius));
    }
}

/**
 * Inisialisasi peta Leaflet di dalam modal.
 * @param {string} mode - 'add' untuk modal buat baru, 'edit' untuk modal edit.
 */
function initMap(mode) {
    const pariamanCoords = [-0.6276, 100.1209];
    const isAddMode = mode === 'add';
    const mapId = isAddMode ? 'mapGeofence' : 'editMapGeofence';
    const latLngInputId = isAddMode ? 'geoLatLang' : 'editGeoLatLang';
    const radiusInputId = isAddMode ? 'geoRadius' : 'editGeoRadius';
    let map = isAddMode ? mapAdd : mapEdit;

    if (map) {
        map.invalidateSize();
        return;
    }

    map = L.map(mapId).setView(pariamanCoords, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    let initialCoords = pariamanCoords;
    const latLngInput = document.getElementById(latLngInputId);
    const latlngStr = latLngInput.value;
    if (latlngStr) {
        initialCoords = latlngStr.split(',').map(Number);
        map.setView(initialCoords, 16);
    }

    const marker = L.marker(initialCoords, { draggable: true }).addTo(map);
    const circle = L.circle(initialCoords, { radius: Number(document.getElementById(radiusInputId).value) }).addTo(map);

    if (isAddMode) { mapAdd = map; markerAdd = marker; circleAdd = circle; }
    else { mapEdit = map; markerEdit = marker; circleEdit = circle; }

    marker.on('dragend', function () {
        const pos = marker.getLatLng();
        latLngInput.value = `${pos.lat.toFixed(6)},${pos.lng.toFixed(6)}`;
        circle.setLatLng(pos);
        map.panTo(pos);
    });

    document.getElementById(radiusInputId).addEventListener('input', function () {
        circle.setRadius(Number(this.value));
    });

    // Tambahkan listener untuk input manual koordinat
    latLngInput.addEventListener('input', function () {
        const latlngStr = this.value.trim();
        // Regex untuk memvalidasi format "lat,lng", memperbolehkan spasi di sekitar koma
        const latLngRegex = /^-?\d{1,3}(\.\d+)?\s*,\s*-?\d{1,3}(\.\d+)?$/;

        if (latLngRegex.test(latlngStr)) {
            const [lat, lng] = latlngStr.split(',').map(s => parseFloat(s.trim()));

            // Validasi tambahan untuk rentang koordinat yang valid
            if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                const newPos = [lat, lng];
                marker.setLatLng(newPos);
                circle.setLatLng(newPos);
                map.panTo(newPos);
            }
        }
    });
}

async function initOpdSelector(mode, selectedOpds = []) {
    // Pastikan allOpdList sudah dimuat dengan memanggil fungsi terpusat
    await loadAllOpdList();

    // Jika pemuatan gagal, allOpdList akan tetap kosong. Tampilkan pesan error di UI.
    if (allOpdList.length === 0) {
        const container = document.getElementById(mode === 'add' ? 'availableOpdContainer' : 'editAvailableOpdContainer');
        container.innerHTML = '<div class="alert alert-danger small p-2">Gagal memuat daftar OPD.</div>';
        return;
    }

    // Initialize state for the current mode
    opdState[mode].selected = [...selectedOpds].sort();
    opdState[mode].available = allOpdList.filter(opd => !selectedOpds.includes(opd)).sort();

    // Attach search listeners
    const searchAvailableInput = document.getElementById(mode === 'add' ? 'searchAvailableOpd' : 'editSearchAvailableOpd');
    const searchSelectedInput = document.getElementById(mode === 'add' ? 'searchSelectedOpd' : 'editSearchSelectedOpd');
    searchAvailableInput.onkeyup = () => renderOpdSelector(mode);
    searchSelectedInput.onkeyup = () => renderOpdSelector(mode);
    searchAvailableInput.value = '';
    searchSelectedInput.value = '';

    renderOpdSelector(mode);
}

function renderOpdSelector(mode) {
    const isAddMode = mode === 'add';
    const availableContainer = document.getElementById(isAddMode ? 'availableOpdContainer' : 'editAvailableOpdContainer');
    const selectedContainer = document.getElementById(isAddMode ? 'selectedOpdContainer' : 'editSelectedOpdContainer');
    const searchAvailableInput = document.getElementById(isAddMode ? 'searchAvailableOpd' : 'editSearchAvailableOpd');
    const searchSelectedInput = document.getElementById(isAddMode ? 'searchSelectedOpd' : 'editSearchSelectedOpd');

    const availableFilter = searchAvailableInput.value.toLowerCase();
    const selectedFilter = searchSelectedInput.value.toLowerCase();

    availableContainer.innerHTML = opdState[mode].available
        .filter(opd => opd.toLowerCase().includes(availableFilter))
        .map(opd => `<button type="button" class="list-group-item list-group-item-action py-1 px-2" onclick="moveOpd('${opd.replace(/'/g, "\\'")}', '${mode}', 'select')">${opd}</button>`)
        .join('');

    selectedContainer.innerHTML = opdState[mode].selected
        .filter(opd => opd.toLowerCase().includes(selectedFilter))
        .map(opd => `<button type="button" class="list-group-item list-group-item-action py-1 px-2 list-group-item-success" onclick="moveOpd('${opd.replace(/'/g, "\\'")}', '${mode}', 'deselect')">${opd}</button>`)
        .join('');
}

function moveOpd(opdName, mode, action) {
    if (action === 'select') {
        opdState[mode].available = opdState[mode].available.filter(item => item !== opdName);
        opdState[mode].selected.push(opdName);
    } else { // deselect
        opdState[mode].selected = opdState[mode].selected.filter(item => item !== opdName);
        opdState[mode].available.push(opdName);
    }
    opdState[mode].available.sort();
    opdState[mode].selected.sort();
    renderOpdSelector(mode);
}

function selectAllOpd(mode) {
    opdState[mode].selected.push(...opdState[mode].available);
    opdState[mode].available = [];
    opdState[mode].selected.sort();
    renderOpdSelector(mode);
}

function deselectAllOpd(mode) {
    opdState[mode].available.push(...opdState[mode].selected);
    opdState[mode].selected = [];
    opdState[mode].available.sort();
    renderOpdSelector(mode);
}

function selectOpdDinas(mode) {
    const toSelect = opdState[mode].available.filter(opd => !/\b(sd|smp|tk|paud|ra|mts|mi|ma|puskesmas)\b/i.test(opd));
    opdState[mode].available = opdState[mode].available.filter(opd => !toSelect.includes(opd));
    opdState[mode].selected.push(...toSelect);
    opdState[mode].selected.sort();
    renderOpdSelector(mode);
}

/**
 * =================================================
 * FUNGSI-FUNGSI UNTUK HALAMAN REKAP ABSENSI
 * =================================================
 */

function kembaliKeDaftar() {
    resetPaginasi();
    document.getElementById('opdContainer').classList.add('d-none');
    document.getElementById('pegawaiContainer').classList.add('d-none');
    document.getElementById('rekapContainer').classList.add('d-none');
    document.getElementById('rekapKeseluruhanContainer').classList.add('d-none');
    document.getElementById('statistikKehadiranContainer').classList.add('d-none');
    document.getElementById('logAbsensiContainer').classList.add('d-none');
    document.getElementById('dashboardContainer').classList.remove('d-none');
    loadJadwalKegiatan();
}

function bukaHalamanPegawai() {
    resetPaginasi();
    document.getElementById('dashboardContainer').classList.add('d-none');
    document.getElementById('rekapContainer').classList.add('d-none');
    document.getElementById('rekapKeseluruhanContainer').classList.add('d-none');
    document.getElementById('statistikKehadiranContainer').classList.add('d-none');
    document.getElementById('opdContainer').classList.add('d-none');
    document.getElementById('logAbsensiContainer').classList.add('d-none');
    document.getElementById('pegawaiContainer').classList.remove('d-none');

    // Reset tampilan dan isi filter, jangan load data dulu
    document.getElementById('pegawaiTableBody').innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4"><i class="bi bi-funnel h3"></i><br>Pilih filter di atas dan tekan "Cari" untuk menampilkan data pegawai.</td></tr>';
    document.getElementById('pegawaiFilterOpd').value = '';
    document.getElementById('pegawaiFilterSync').value = 'semua';
    document.getElementById('pegawaiFilterInstall').value = 'semua';
    document.getElementById('pegawaiSearchInput').value = '';
    populatePegawaiFilterOpd();
}

function bukaHalamanOpd() {
    resetPaginasi();
    document.getElementById('dashboardContainer').classList.add('d-none');
    document.getElementById('rekapContainer').classList.add('d-none');
    document.getElementById('rekapKeseluruhanContainer').classList.add('d-none');
    document.getElementById('statistikKehadiranContainer').classList.add('d-none');
    document.getElementById('pegawaiContainer').classList.add('d-none');
    document.getElementById('logAbsensiContainer').classList.add('d-none');
    document.getElementById('opdContainer').classList.remove('d-none');
    loadOpdData();
}

async function lihatRekap(kodeAkses) {
    // Pindah ke tampilan rekap
    document.getElementById('dashboardContainer').classList.add('d-none');
    document.getElementById('rekapKeseluruhanContainer').classList.add('d-none');
    document.getElementById('statistikKehadiranContainer').classList.add('d-none');
    document.getElementById('logAbsensiContainer').classList.add('d-none');
    document.getElementById('rekapContainer').classList.remove('d-none');
    currentRekapData = { jadwal: null, filtered_pegawai: [] }; // Reset data cache
    resetRekapFilters();
    document.getElementById('rekapFilterView').value = 'table';

    // Reset tampilan tabel dan foto ke default (tabel)
    const tableView = document.getElementById('rekapTableView');
    const photoGridView = document.getElementById('rekapPhotoGridView');
    const tableBody = document.getElementById('rekapTableBody');

    tableView.classList.remove('d-none');
    photoGridView.classList.add('d-none');
    photoGridView.innerHTML = ''; // Kosongkan grid foto

    // Tampilkan loading di tabel
    tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm"></div> Memuat data awal...</td></tr>';

    // Reset modal ringkasan
    document.getElementById('rekapPerOpdContainerModal').innerHTML = '';

    // Sembunyikan tombol download excel saat rekap baru dibuka


    try {
        // Panggil API untuk mendapatkan info dasar jadwal dan list OPD untuk filter
        const result = await fetchWithAuth(`${API_BASE_URL}/admin/rekap/${kodeAkses}`);
        if (!result.status) {
            Swal.fire('Gagal', 'Gagal memuat rekap: ' + result.message, 'error');
            kembaliKeDaftar();
            return;
        }
        currentRekapData.jadwal = result.data.jadwal;
        renderRekapHeader(result.data.jadwal);
        populateRekapFilters(result.data.opd_for_filter); // Isi filter OPD

        // Kembalikan tabel ke state awal, menunggu input user
        tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4"><i class="bi bi-funnel h3"></i><br>Pilih filter di atas dan tekan "Tampilkan" untuk melihat data.</td></tr>`;

    } catch (error) {
        console.error('Error loading rekap:', error);
        kembaliKeDaftar();
    }
}

function renderRekapHeader(jadwal) {
    document.getElementById('rekapJudul').innerText = jadwal.judul;
    const tanggalFormatted = new Date(jadwal.tanggal).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('rekapDetailWaktu').innerText = `${tanggalFormatted} | ${jadwal.jam_mulai} - ${jadwal.jam_selesai} WIB`;
    document.getElementById('rekapKategori').innerText = jadwal.kategori;
}

function renderRekapSummary(summaryData, containerId) {
    const container = document.getElementById(containerId);
    const perOpdSummary = summaryData.per_opd_summary;
    const overallSummary = summaryData.summary;

    if (perOpdSummary.length === 0) {
        container.innerHTML = '<div class="text-center text-muted p-3">Tidak ada data target pegawai untuk kegiatan ini.</div>';
        return;
    }

    let html = perOpdSummary.map(opd => {
        const opdHadir = opd.statuses['Hadir'] || 0;
        const opdPercentage = opd.target > 0 ? Math.round((opdHadir / opd.target) * 100) : 0;
        return `
        <div class="mb-3 border-bottom pb-3">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="fw-bold">${opd.opd_name}</span>
                <span class="fw-bold ${opdHadir === opd.target ? 'text-danger' : 'text-dark'}">${opdHadir} / ${opd.target} Pegawai (${opdPercentage}%)</span>
            </div>
            <div class="progress" style="height: 20px;"><div class="progress-bar bg-danger" role="progressbar" style="width: ${opdPercentage}%;" aria-valuenow="${opdPercentage}">${opdPercentage > 0 ? opdPercentage + '%' : ''}</div></div>
            <div class="row gx-2 gy-1 small mt-2 text-center">
                ${Object.entries(opd.statuses).map(([statusName, count]) => {
            let badgeClass = 'bg-primary-subtle';
            let textClass = 'text-primary-emphasis';
            if (statusName === 'Hadir') { badgeClass = 'bg-success-subtle'; textClass = 'text-success-emphasis'; }
            else if (statusName === 'Belum Absen' || statusName === 'Alpa') { badgeClass = 'bg-danger-subtle'; textClass = 'text-danger-emphasis'; }
            return `
                    <div class="col">
                        <div class="p-2 ${badgeClass} rounded h-100">
                            <div class="fw-bold fs-6">${count}</div>
                            <div class="${textClass}" style="font-size: 0.7rem;">${statusName}</div>
                        </div>
                    </div>
                    `;
        }).join('')}
            </div>
        </div>
    `}).join('');

    const totalHadir = (overallSummary.statuses['Hadir'] || 0);
    const percentage = overallSummary.total_target > 0 ? Math.round((totalHadir / overallSummary.total_target) * 100) : 0;

    const summaryHeader = `
        <div class="mb-4 p-3 bg-light rounded border">
            <div class="d-flex justify-content-between align-items-center mb-2"><span class="fw-bold h5">Total Keseluruhan</span><span class="fw-bold h5">${totalHadir} / ${overallSummary.total_target} Pegawai (${percentage}%)</span></div>
            <div class="progress" style="height: 25px;"><div class="progress-bar progress-bar-striped bg-danger" role="progressbar" style="width: ${percentage}%;">${percentage}% Hadir</div></div>
            <div class="row gx-2 gy-1 small mt-2 text-center">
                ${Object.entries(overallSummary.statuses).map(([statusName, count]) => {
        let badgeClass = 'bg-primary-subtle';
        let textClass = 'text-primary-emphasis';
        if (statusName === 'Hadir') { badgeClass = 'bg-success-subtle'; textClass = 'text-success-emphasis'; }
        else if (statusName === 'Belum Absen' || statusName === 'Alpa') { badgeClass = 'bg-danger-subtle'; textClass = 'text-danger-emphasis'; }
        return `
                    <div class="col">
                        <div class="p-2 ${badgeClass} rounded h-100">
                            <div class="fw-bold fs-6">${count}</div>
                            <div class="${textClass}" style="font-size: 0.7rem;">${statusName}</div>
                        </div>
                    </div>
                    `;
    }).join('')}
            </div>
        </div>
    `;

    let warningBanner = '';
    if (overallSummary.menunggu_verifikasi && overallSummary.menunggu_verifikasi > 0) {
        warningBanner = `
        <div class="alert alert-warning d-flex align-items-center mb-4" role="alert">
            <i class="bi bi-exclamation-triangle-fill fs-4 me-3"></i>
            <div>
                <strong>Perhatian:</strong> Terdapat <strong>${overallSummary.menunggu_verifikasi}</strong> pengajuan kehadiran/izin yang statusnya masih <strong>Menunggu Verifikasi Admin</strong>. Silakan periksa daftar absensi dan lakukan verifikasi.
            </div>
        </div>
        `;
    }

    container.innerHTML = warningBanner + summaryHeader + html;
}

function populateRekapFilters(opdList) {
    populateOpdCheckboxContainer('rekapFilterOpdContainer', opdList);
}

function resetRekapFilters() {
    const opdSelect = document.getElementById('rekapFilterOpdContainer');
    if (opdSelect && opdSelect.tomselect) opdSelect.tomselect.setValue('semua');
    document.getElementById('rekapSearchInput').value = '';
    // Saat direset, defaultnya adalah semua data
    document.getElementById('rekapFilterStatus').value = 'semua';
    document.getElementById('rekapFilterVerifikasi').value = 'semua';
}
async function terapkanFilterRekap(isFromPagination = false) {
    if (isFromPagination !== true) paginasiState.page = 1;
    const pt = document.getElementById("rekapPaginationTop"); if (pt) pt.classList.add("d-none");
    const pb = document.getElementById("rekapPagination"); if (pb) pb.classList.add("d-none");
    const selectedOpds = getSelectedOpdFromCheckbox('rekapFilterOpdContainer');
    const statusKehadiran = document.getElementById('rekapFilterStatus').value;
    const statusVerifikasi = document.getElementById('rekapFilterVerifikasi').value;
    const selectedView = document.getElementById('rekapFilterView').value;
    const searchInput = document.getElementById('rekapSearchInput').value;

    const tbody = document.getElementById('rekapTableBody');
    const tableView = document.getElementById('rekapTableView');
    const photoGridView = document.getElementById('rekapPhotoGridView');

    const checkAllHeader = document.getElementById('rekapPilihSemua').parentElement;

    // Atur tampilan dan tampilkan indikator muat data
    if (selectedView === 'table') {
        tableView.classList.remove('d-none');
        photoGridView.classList.add('d-none');
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm"></div> Memuat data...</td></tr>';
        checkAllHeader.classList.remove('d-none');
    } else { // photo view
        tableView.classList.add('d-none');
        photoGridView.classList.remove('d-none');
        photoGridView.innerHTML = '<div class="col-12 text-center text-muted py-4"><div class="spinner-border spinner-border-sm"></div> Memuat foto...</div>';
        checkAllHeader.classList.add('d-none');
        document.getElementById('btnHapusTerpilih').classList.add('d-none');
    }

    // Selalu sembunyikan tombol download saat filter baru diterapkan


    try {
        const result = await fetchWithAuth(`${API_BASE_URL}/admin/rekap/details/${currentRekapData.jadwal.kode_akses}`, {
            method: 'POST',
            body: JSON.stringify({ opd_list: selectedOpds, status_kehadiran: statusKehadiran, status_verifikasi: statusVerifikasi, search: searchInput, page: paginasiState.page, limit: paginasiState.limit })
        });

        if (result.status) {
            currentRekapData.filtered_pegawai = result.data.data;
            renderPaginationControls('rekapPagination', result.data.pagination, 'rekap');
            if (selectedView === 'table') {
                renderRekapTable(currentRekapData.filtered_pegawai);
            } else {
                renderFotoKehadiranGrid(currentRekapData.filtered_pegawai);
            }

            // Tampilkan tombol download jika ada data
            if (result.data.data.length > 0) {

            }
        } else {
            // Tangani error dari API, ganti indikator muat dengan pesan error
            if (selectedView === 'table') {
                tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">Gagal memuat data: ${result.message}</td></tr>`;
            } else {
                photoGridView.innerHTML = `<div class="col-12 text-center text-danger py-4">Gagal memuat data: ${result.message}</div>`;
            }
        }
    } catch (error) {
        console.error('Error applying rekap filter:', error);
        // Tangani error koneksi, ganti indikator muat dengan pesan error
        if (selectedView === 'table') {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">Terjadi kesalahan koneksi.</td></tr>`;
        } else {
            photoGridView.innerHTML = `<div class="col-12 text-center text-danger py-4">Terjadi kesalahan koneksi.</div>`;
        }
    }
}

/**
 * =================================================
 * FUNGSI-FUNGSI UNTUK HALAMAN MANAJEMEN OPD
 * =================================================
 */
let currentOpdMode = 'add';

async function loadOpdData() {
    const tbody = document.getElementById('opdTableBody');
    tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm"></div> Memuat data OPD...</td></tr>';

    try {
        // Tambahkan timestamp untuk bypass cache
        const result = await fetchWithAuth(`${API_BASE_URL}/admin/opd?_=${new Date().getTime()}`);
        if (result.status) {
            currentOpdData = result.data;
            renderOpdTable(currentOpdData);
        } else {
            tbody.innerHTML = `<tr><td colspan="3" class="text-center text-danger py-4">Gagal memuat data: ${result.message}</td></tr>`;
        }
    } catch (error) {
        console.error('Error loading OPD data:', error);
        tbody.innerHTML = `<tr><td colspan="3" class="text-center text-danger py-4">Terjadi kesalahan koneksi.</td></tr>`;
    }
}

function renderOpdTable(opdList) {
    const tbody = document.getElementById('opdTableBody');
    if (opdList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-4">Tidak ada data OPD.</td></tr>';
        return;
    }

    tbody.innerHTML = opdList.map((opd, i) => {
        const opdData = JSON.stringify(opd).replace(/"/g, '&quot;');
        return `
            <tr>
                <td class="text-center">${i + 1}</td>
                <td>${opd.nama_opd}</td>
                <td class="text-center">
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-warning" onclick='bukaModalEditOpd(${opdData})' title="Edit OPD"><i class="bi bi-pencil-fill"></i></button>
                        <button class="btn btn-outline-danger" onclick="hapusOpd('${opd.id}', '${opd.nama_opd.replace(/'/g, `\\'`)}')" title="Hapus OPD"><i class="bi bi-trash-fill"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function bukaModalTambahOpd() {
    currentOpdMode = 'add';
    document.getElementById('formOpd').reset();

    const header = document.getElementById('modalOpdHeader');
    const title = document.getElementById('modalOpdTitle');
    const button = document.getElementById('btnSimpanOpd');

    header.className = 'modal-header bg-danger text-white border-0';
    title.innerHTML = '<i class="bi bi-building"></i> Tambah OPD Baru';
    button.className = 'btn btn-danger w-100 fw-bold py-2';
    button.innerHTML = '<i class="bi bi-plus-circle"></i> Tambah OPD';

    modalOpd.show();
}

function bukaModalEditOpd(opd) {
    currentOpdMode = 'edit';
    document.getElementById('formOpd').reset();

    const header = document.getElementById('modalOpdHeader');
    const title = document.getElementById('modalOpdTitle');
    const button = document.getElementById('btnSimpanOpd');

    header.className = 'modal-header bg-warning text-dark border-0';
    title.innerHTML = '<i class="bi bi-pencil-square"></i> Edit Nama OPD';
    button.className = 'btn btn-warning w-100 fw-bold py-2';
    button.innerHTML = '<i class="bi bi-floppy"></i> Simpan Perubahan';

    document.getElementById('opdId').value = opd.id;
    document.getElementById('opdNama').value = opd.nama_opd;

    modalOpd.show();
}

async function submitOpd(event) {
    event.preventDefault();
    const btn = document.getElementById('btnSimpanOpd');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Menyimpan...';

    const payload = {
        nama_opd: document.getElementById('opdNama').value,
    };

    let url = `${API_BASE_URL}/admin/opd`;
    let method = 'POST';

    if (currentOpdMode === 'edit') {
        const opdId = document.getElementById('opdId').value;
        url = `${API_BASE_URL}/admin/opd/${opdId}`;
        method = 'PUT';
    }

    try {
        const result = await fetchWithAuth(url, { method: method, body: JSON.stringify(payload) });
        if (result.status) {
            modalOpd.hide();
            Swal.fire({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2500, icon: 'success', title: result.message });
            loadOpdData();
        } else {
            Swal.fire('Gagal', result.message, 'error');
        }
    } catch (error) { } finally {
        btn.disabled = false;
        btn.innerHTML = (currentOpdMode === 'add') ? '<i class="bi bi-plus-circle"></i> Tambah OPD' : '<i class="bi bi-floppy"></i> Simpan Perubahan';
    }
}

async function hapusOpd(id, nama) {
    const confirmation = await Swal.fire({
        title: 'Anda Yakin?',
        html: `Anda akan menghapus OPD:<br><b>${nama}</b>.<br>Aksi ini tidak dapat dibatalkan!`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Ya, Hapus!',
        cancelButtonText: 'Batal'
    });

    if (confirmation.isConfirmed) {
        try {
            const result = await fetchWithAuth(`${API_BASE_URL}/admin/opd/${id}`, { method: 'DELETE' });
            if (result.status) {
                Swal.fire('Terhapus!', result.message, 'success');
                loadOpdData();
            } else {
                Swal.fire('Gagal', result.message, 'error');
            }
        } catch (error) { }
    }
}

async function syncOpdList() {
    const confirmation = await Swal.fire({
        title: 'Sinkronkan Cache OPD?',
        html: `Anda akan memperbarui daftar OPD yang disimpan di cache Cloudflare. Ini akan memastikan PWA menggunakan daftar OPD terbaru.`,
        icon: 'info',
        showCancelButton: true,
        confirmButtonColor: '#198754',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Ya, Sinkronkan!',
        cancelButtonText: 'Batal'
    });

    if (confirmation.isConfirmed) {
        showAdminLoading(true, 'Memulai sinkronisasi...');
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/admin/opd/sync-kv`, { method: 'POST' });
            showAdminLoading(false);
            if (res.status) {
                Swal.fire({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2500, icon: 'success', title: res.message });
            } else {
                Swal.fire('Gagal', res.message, 'error');
            }
        } catch (error) {
            showAdminLoading(false);
        }
    }
}

function renderRekapTable(filteredPegawai) {
    const tbody = document.getElementById('rekapTableBody');
    const tableView = document.getElementById('rekapTableView');
    tableView.classList.remove('d-none');
    document.getElementById('rekapPhotoGridView').classList.add('d-none');

    // Injeksi Banner Warning
    let warningContainer = document.getElementById('rekap-warning-container');
    if (!warningContainer) {
        warningContainer = document.createElement('div');
        warningContainer.id = 'rekap-warning-container';
        tableView.parentNode.insertBefore(warningContainer, tableView);
    }

    const pendingCount = filteredPegawai.filter(p => p.status_verifikasi === 'Menunggu Verifikasi Admin').length;
    if (pendingCount > 0) {
        warningContainer.innerHTML = `<div class="alert alert-warning shadow-sm border-warning mb-3"><i class="bi bi-exclamation-triangle-fill me-2"></i>Terdapat <strong>${pendingCount}</strong> absensi yang <strong>Menunggu Verifikasi Admin</strong> pada tabel di bawah ini. Harap segera periksa.</div>`;
    } else {
        warningContainer.innerHTML = '';
    }

    const checkAllHeader = document.getElementById('rekapPilihSemua').parentElement;
    document.getElementById('rekapPilihSemua').checked = false;
    document.getElementById('btnHapusTerpilih').classList.add('d-none');

    if (filteredPegawai.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Tidak ada data yang cocok dengan filter.</td></tr>';
        checkAllHeader.classList.add('d-none');
    } else {
        tbody.innerHTML = filteredPegawai.map((p, i) => {
            const pegawaiInfo = `
                <strong class="d-block">${p.nama_pegawai}</strong>
                <small class="text-muted">NIP: ${p.nip}</small>
                <small class="d-block text-muted">Jabatan: ${p.jabatan || '-'}</small>
            `;

            // --- Kolom Detail Absensi ---
            let detailAbsensiInfo = '<span class="text-muted fst-italic">Belum Absen</span>';
            // Kehadiran dianggap valid hanya jika ada waktu absen DAN statusnya tidak ditolak oleh admin.
            const isHadir = p.waktu_absen && p.status_verifikasi !== 'Ditolak Oleh Admin';

            if (isHadir) {
                const waktu = new Date(p.waktu_absen).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                let kehadiranBadge = '';
                const statusHadir = p.status_kehadiran || 'Hadir';

                switch (statusHadir) {
                    case 'Hadir':
                        kehadiranBadge = `<span class="badge bg-danger">Hadir</span>`;
                        break;
                    case 'Hadir Terlambat':
                        kehadiranBadge = `<span class="badge bg-warning text-dark">Hadir Terlambat</span>`;
                        break;
                    case 'Hadir Diluar Lokasi':
                        kehadiranBadge = `<span class="badge bg-info text-dark">Hadir Diluar Lokasi</span>`;
                        break;
                    case 'Hadir Terlambat Diluar Lokasi':
                        kehadiranBadge = `<span class="badge bg-danger">Terlambat &amp; Diluar Lokasi</span>`;
                        break;
                    case 'Dinas Dalam Daerah':
                        kehadiranBadge = `<span class="badge bg-primary">Dinas Dalam Daerah</span>`;
                        break;
                    case 'Dinas Luar Daerah':
                        kehadiranBadge = `<span class="badge bg-primary">Dinas Luar Daerah</span>`;
                        break;
                    case 'Tugas Belajar':
                        kehadiranBadge = `<span class="badge bg-info text-dark">Tugas Belajar</span>`;
                        break;
                    default:
                        kehadiranBadge = `<span class="badge bg-secondary">${statusHadir}</span>`;
                }

                detailAbsensiInfo = `
                    <strong class="d-block">${waktu} WIB</strong>
                    <div class="mt-1">${kehadiranBadge}</div>
                    <small class="text-muted d-block mt-1" title="Alamat Absen">${p.lokasi_absen || 'Lokasi tidak tercatat'}</small>
                `;
            }

            // --- Kolom Status Verifikasi ---
            let verifikasiBadge = '';
            const statusVerif = p.status_verifikasi || 'ALPA';

            switch (statusVerif) {
                case 'Terverifikasi Oleh Admin':
                    verifikasiBadge = `<span class="badge bg-danger">Disahkan Admin</span>`;
                    break;
                case 'Terverifikasi Sistem':
                    verifikasiBadge = `<span class="badge bg-danger">Terverifikasi Sistem</span>`;
                    break;
                case 'Ditolak Oleh Admin':
                    verifikasiBadge = `<span class="badge bg-danger">Ditolak Admin</span>`;
                    break;
                case 'Menunggu Verifikasi Admin':
                    verifikasiBadge = `<span class="badge bg-warning text-dark border border-warning"><i class="bi bi-hourglass-split"></i> Menunggu Verifikasi</span>`;
                    break;
                case 'ALPA':
                default:
                    verifikasiBadge = `<span class="badge bg-secondary">Alpa</span>`;
                    break;
            }

            let fotoLink = '';
            if (p.nama_file_foto && p.nama_file_foto !== 'MANUAL_INPUT.jpg') {
                const isDrive = p.nama_file_foto.startsWith('http://') || p.nama_file_foto.startsWith('https://');
                const urlFoto = isDrive ? p.nama_file_foto : `${ORIGIN_SERVER_URL}/uploads/foto_absensi/${p.nama_file_foto}`;
                const icon = isDrive ? '<i class="bi bi-google"></i> Link Drive' : '<i class="bi bi-camera-fill"></i> Lihat Foto';
                fotoLink = `<a href="${urlFoto}" target="_blank" class="d-block small text-decoration-none mt-1">${icon}</a>`;
            }

            const keteranganText = p.keterangan ? `<div class="small text-muted mt-1 fst-italic" title="Keterangan">"${p.keterangan}"</div>` : '';

            const statusKeteranganInfo = `${verifikasiBadge}${fotoLink}${keteranganText}`;

            const pegawaiData = JSON.stringify(p).replace(/"/g, '&quot;');

            return `<tr>
                <td class="text-center align-middle"><input class="form-check-input rekap-pilih-checkbox" type="checkbox" value="${p.nip}" onchange="updateTombolHapusMassal()"></td>
                <td class="text-center">${(paginasiState.page - 1) * paginasiState.limit + i + 1}</td>
                <td>${pegawaiInfo}</td>
                <td>${p.perangkat_daerah}</td>
                <td>${detailAbsensiInfo}</td>
                <td>${statusKeteranganInfo}</td>
                <td class="text-center">
                    <div class="btn-group btn-group-sm" role="group">
                        <button class="btn btn-outline-danger" onclick='bukaModalVerifikasi(${pegawaiData})' title="Edit Status">
                            <i class="bi bi-pencil-square"></i>
                        </button>
                        <button class="btn btn-outline-danger" onclick="hapusDataAbsensi('${p.nip}', '${p.nama_pegawai.replace(/'/g, `\\'`)}', '${currentRekapData.jadwal.kode_akses}')" title="Hapus dari Rekap">
                            <i class="bi bi-person-x-fill"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');
        checkAllHeader.classList.remove('d-none');
    }
}

function renderFotoKehadiranGrid(filteredPegawai) {
    const photoGridView = document.getElementById('rekapPhotoGridView');
    document.getElementById('rekapTableView').classList.add('d-none');
    document.getElementById('rekapPhotoGridView').classList.remove('d-none');
    photoGridView.innerHTML = '';

    // Syarat foto ditampilkan: Ada nama file foto yang valid (bukan hasil input manual). Status verifikasi diabaikan.
    const photos = filteredPegawai.filter(p => p.nama_file_foto && p.nama_file_foto !== 'MANUAL_INPUT.jpg');

    if (photos.length === 0) {
        photoGridView.innerHTML = '<div class="col-12 text-center text-muted py-4">Tidak ada foto kehadiran yang cocok dengan filter.</div>';
        return;
    }

    photos.forEach(p => {
        const waktu = new Date(p.waktu_absen).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        let statusKehadiranBadge = '';
        switch (p.status_kehadiran) {
            case 'Hadir':
                statusKehadiranBadge = `<span class="badge bg-success">Hadir</span>`;
                break;
            case 'Alpa':
            case 'Belum Absen':
                statusKehadiranBadge = `<span class="badge bg-danger">Alpa</span>`;
                break;
            default:
                statusKehadiranBadge = `<span class="badge bg-primary">${p.status_kehadiran}</span>`;
        }

        // Tambahkan badge untuk status verifikasi agar lebih informatif
        let verifStatusBadge = '';
        switch (p.status_verifikasi) {
            case 'Terverifikasi Oleh Admin':
                verifStatusBadge = `<span class="badge bg-danger">Disahkan Admin</span>`;
                break;
            case 'Ditolak Oleh Admin':
                verifStatusBadge = `<span class="badge bg-warning text-dark">Ditolak Admin</span>`;
                break;
        }

        const pegawaiData = JSON.stringify(p).replace(/"/g, '&quot;');

        const isDrive = p.nama_file_foto.startsWith('http://') || p.nama_file_foto.startsWith('https://');
        const isPdf = p.nama_file_foto.toLowerCase().endsWith('.pdf');

        let mediaHtml = '';
        if (isDrive) {
            mediaHtml = `<div class="d-flex flex-column align-items-center justify-content-center bg-light border-bottom" style="height: 200px;">
                            <i class="bi bi-google fs-1 text-danger mb-2"></i>
                            <span class="text-muted small">Foto dari Google Drive</span>
                            <a href="${p.nama_file_foto}" target="_blank" class="btn btn-sm btn-outline-danger mt-2">Buka Tautan</a>
                         </div>`;
        } else if (isPdf) {
            mediaHtml = `<div class="d-flex flex-column align-items-center justify-content-center bg-light border-bottom" style="height: 200px;">
                            <i class="bi bi-file-earmark-pdf-fill fs-1 text-danger mb-2"></i>
                            <span class="text-muted small fw-bold">Dokumen PDF</span>
                            <a href="${ORIGIN_SERVER_URL}/uploads/foto_absensi/${p.nama_file_foto}" target="_blank" class="btn btn-sm btn-danger mt-2"><i class="bi bi-box-arrow-up-right"></i> Buka PDF</a>
                         </div>`;
        } else {
            mediaHtml = `<img src="${ORIGIN_SERVER_URL}/uploads/foto_absensi/${p.nama_file_foto}" class="card-img-top" alt="Foto Absensi ${p.nama_pegawai}" style="height: 200px; object-fit: cover; cursor: pointer;" onclick="Swal.fire({ title: 'Foto Kehadiran: ${p.nama_pegawai.replace(/'/g, `\\'`)}', imageUrl: '${ORIGIN_SERVER_URL}/uploads/foto_absensi/${p.nama_file_foto}', imageWidth: '90vw', imageHeight: 'auto', showCloseButton: true, confirmButtonText: 'Tutup' })">`;
        }

        const cardHtml = `
            <div class="col">
                <div class="card h-100 shadow-sm">
                    ${mediaHtml}
                    <div class="card-body d-flex flex-column">
                        <h6 class="card-title fw-bold mb-1">${p.nama_pegawai}</h6>
                        <p class="card-text small text-muted mb-2">${p.perangkat_daerah}</p>
                        <div class="d-flex flex-wrap gap-1 mb-2">
                            ${statusKehadiranBadge}
                            <span class="badge bg-secondary">${waktu}</span>
                            ${verifStatusBadge}
                        </div>
                        <p class="card-text small mb-1" title="Lokasi Absen"><i class="bi bi-geo-alt-fill"></i> ${p.lokasi_absen || 'Lokasi tidak tercatat'}</p>
                        ${p.keterangan && p.keterangan !== '-' ? `<p class="card-text small fst-italic text-warning mb-2" title="Keterangan"><i class="bi bi-info-circle"></i> "${p.keterangan}"</p>` : ''}
                        
                        <div class="mt-auto pt-2 border-top">
                            <button class="btn btn-sm btn-outline-danger w-100" onclick='bukaModalVerifikasi(${pegawaiData})'>
                                <i class="bi bi-pencil-square"></i> Edit Status
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        photoGridView.innerHTML += cardHtml;
    });
}

async function hapusDataAbsensi(nip, nama, kodeAkses) {
    const confirmation = await Swal.fire({
        title: 'Anda Yakin?',
        html: `Anda akan menghapus <b>${nama}</b> (NIP: ${nip}) dari rekap kegiatan ini. <br><br><strong class="text-danger">Aksi ini tidak dapat dibatalkan dan akan menghilangkan data kehadiran/ketidakhadiran pegawai ini dari rekap.</strong>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Ya, Hapus!',
        cancelButtonText: 'Batal'
    });

    if (confirmation.isConfirmed) {
        try {
            const result = await fetchWithAuth(`${API_BASE_URL}/admin/rekap/entry/${kodeAkses}/${nip}`, {
                method: 'DELETE'
            });

            if (result.status) {
                Swal.fire('Terhapus!', result.message, 'success');

                // Hapus dari data cache dan render ulang
                currentRekapData.filtered_pegawai = currentRekapData.filtered_pegawai.filter(p => p.nip !== nip);
                const selectedView = document.getElementById('rekapFilterView').value;
                if (selectedView === 'table') {
                    renderRekapTable(currentRekapData.filtered_pegawai);
                } else {
                    renderFotoKehadiranGrid(currentRekapData.filtered_pegawai);
                }
                refreshRekapSummary();
            } else {
                Swal.fire('Gagal', result.message, 'error');
            }
        } catch (error) { }
    }
}

async function bukaModalVerifikasi(pegawai) {
    document.getElementById('formVerifikasi').reset();

    document.getElementById('verifNama').value = pegawai.nama_pegawai;
    document.getElementById('verifNip').value = pegawai.nip;
    document.getElementById('verifKodeAkses').value = currentRekapData.jadwal.kode_akses;

    // --- NEW: Populate OPD and Jabatan ---
    await loadAllOpdList(); // Ensure OPD list is available
    const opdSelect = document.getElementById('verifOpd');
    opdSelect.innerHTML = ''; // Clear previous options
    allOpdList.forEach(opd => {
        const option = document.createElement('option');
        option.value = opd;
        option.textContent = opd;
        if (opd === pegawai.perangkat_daerah) {
            option.selected = true;
        }
        opdSelect.appendChild(option);
    });
    document.getElementById('verifJabatan').value = pegawai.jabatan || '';

    document.getElementById('verifStatusLama').textContent = pegawai.status_verifikasi || 'ALPA';
    document.getElementById('verifKeterangan').value = pegawai.keterangan || '';

    const verifLinkFoto = document.getElementById('verifLinkFoto');
    const verifTanpaFoto = document.getElementById('verifTanpaFoto');

    const verifBuktiDukung = document.getElementById('verifBuktiDukung');
    const verifBuktiLabel = verifBuktiDukung.previousElementSibling;

    if (pegawai.nama_file_foto && pegawai.nama_file_foto !== 'MANUAL_INPUT.jpg' && pegawai.nama_file_foto !== '-') {
        const isDrive = pegawai.nama_file_foto.startsWith('http://') || pegawai.nama_file_foto.startsWith('https://');
        verifLinkFoto.href = isDrive ? pegawai.nama_file_foto : `${ORIGIN_SERVER_URL}/uploads/foto_absensi/${pegawai.nama_file_foto}`;
        verifLinkFoto.innerHTML = isDrive ? '<i class="bi bi-google"></i> Buka Link Drive' : '<i class="bi bi-box-arrow-up-right"></i> Buka di Tab Baru';
        verifLinkFoto.classList.remove('d-none');
        verifTanpaFoto.classList.add('d-none');
    } else {
        verifLinkFoto.classList.add('d-none');
        verifTanpaFoto.classList.remove('d-none');
    }

    verifBuktiDukung.required = false;
    verifBuktiLabel.innerHTML = 'Upload Bukti Dukung <span class="text-secondary fw-normal">(Opsional, Maks 1MB)</span>';
    verifBuktiLabel.classList.remove('text-danger');
    verifBuktiDukung.classList.remove('border-danger');

    const verifStatusSelect = document.getElementById('verifStatus');
    if (pegawai.status_verifikasi === 'Ditolak Oleh Admin') {
        verifStatusSelect.value = 'Ditolak Oleh Admin';
    } else {
        verifStatusSelect.value = 'Terverifikasi Oleh Admin';
    }

    modalVerifikasi.show();
}

async function submitVerifikasi(event) {
    event.preventDefault();

    const formData = new FormData();
    formData.append('kode_akses', document.getElementById('verifKodeAkses').value);
    formData.append('nip', document.getElementById('verifNip').value);
    formData.append('status_verifikasi', document.getElementById('verifStatus').value);
    const setHadir = document.getElementById('verifStatusKehadiran').value;
    if (setHadir) formData.append('status_kehadiran', setHadir);
    formData.append('keterangan', document.getElementById('verifKeterangan').value);
    formData.append('opd', document.getElementById('verifOpd').value);
    formData.append('jabatan', document.getElementById('verifJabatan').value);

    const fileInput = document.getElementById('verifBuktiDukung');
    if (fileInput.files.length > 0) {
        formData.append('bukti_dukung', fileInput.files[0]);
    } else if (fileInput.required) {
        Swal.fire('Kesalahan', 'Bukti dukung (Foto/PDF) wajib diunggah!', 'error');
        return;
    }

    const btn = document.getElementById('btnSimpanVerif');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Menyimpan...';

    try {
        const result = await fetchWithAuth(`${API_BASE_URL}/admin/verifikasi`, {
            method: 'POST',
            body: formData
        });

        if (result.status) {
            modalVerifikasi.hide();
            Swal.fire({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2000, icon: 'success', title: 'Status berhasil diperbarui!' });

            // Ambil daftar OPD terbaru untuk filter, karena mungkin berubah setelah edit.
            try {
                const verifKodeAkses = document.getElementById('verifKodeAkses').value;
                const opdResult = await fetchWithAuth(`${API_BASE_URL}/admin/rekap/opd-list/${verifKodeAkses}`);
                if (opdResult.status) {
                    populateOpdCheckboxContainer('rekapFilterOpdContainer', opdResult.data);
                }
            } catch (e) { console.error("Gagal refresh list OPD filter:", e); }

            if (!document.getElementById('rekapKeseluruhanContainer').classList.contains('d-none')) {
                terapkanFilterRekapKeseluruhan();
            } else if (!document.getElementById('rekapContainer').classList.contains('d-none')) {
                terapkanFilterRekap();
                refreshRekapSummary(); // Refresh juga modal ringkasan
            }
        } else {
            Swal.fire('Gagal', 'Gagal memperbarui: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('Error submitting verification:', error);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-floppy"></i> Simpan Status';
    }
}

// --- FUNGSI SET ABSEN MASAL DIHAPUS (Digabung ke Tambah Peserta) ---

async function bukaModalTambahPeserta() {
    const searchInput = document.getElementById('tambahPesertaSearch');
    document.getElementById('tambahPesertaKodeAkses').value = currentRekapData.jadwal.kode_akses;

    // Reset state
    tambahPesertaState = { available: [], selected: [] };

    // Reset UI
    document.getElementById('availablePesertaContainer').innerHTML = '<div class="list-group-item text-center text-muted">Gunakan filter di atas dan tekan "Cari".</div>';
    document.getElementById('selectedPesertaContainer').innerHTML = '';
    document.getElementById('searchAvailablePeserta').value = '';
    document.getElementById('searchSelectedPeserta').value = '';
    searchInput.value = '';

    modalTambahPeserta.show();

    await loadAllOpdList(); // Memastikan allOpdList terisi
    populateOpdCheckboxContainer('tambahPesertaFilterOpdContainer', allOpdList);

    // Tambahkan event listener untuk search input (Enter key)
    searchInput.onkeypress = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Mencegah form tersubmit otomatis
            cariEligiblePegawai();
        }
    };

    // Tambahkan listener untuk filter di list
    document.getElementById('searchAvailablePeserta').onkeyup = () => renderTambahPesertaView();
    document.getElementById('searchSelectedPeserta').onkeyup = () => renderTambahPesertaView();
}

async function cariEligiblePegawai() {
    const availableContainer = document.getElementById('availablePesertaContainer');
    const searchInput = document.getElementById('tambahPesertaSearch');
    const kodeAkses = document.getElementById('tambahPesertaKodeAkses').value;

    const filterText = searchInput.value.trim();
    const selectedOpds = getSelectedOpdFromCheckbox('tambahPesertaFilterOpdContainer');

    if (filterText.length === 0 && selectedOpds.length === 0) {
        Swal.fire('Filter Diperlukan', 'Silakan isi pencarian pegawai atau pilih minimal satu OPD terlebih dahulu.', 'warning');
        return;
    }

    availableContainer.innerHTML = '<div class="list-group-item text-center text-muted"><div class="spinner-border spinner-border-sm"></div> Mencari pegawai...</div>';

    try {
        const result = await fetchWithAuth(`${API_BASE_URL}/admin/rekap/eligible-pegawai/${kodeAkses}`, {
            method: 'POST',
            body: JSON.stringify({
                search: filterText,
                opd_list: selectedOpds,
                include_all: true
            })
        });

        if (result.status) {
            // Filter out any pegawai that are already in the 'selected' list
            const selectedNips = new Set(tambahPesertaState.selected.map(p => p.nip));
            tambahPesertaState.available = result.data.filter(p => !selectedNips.has(p.nip));
            renderTambahPesertaView();
        } else {
            availableContainer.innerHTML = `<div class="list-group-item text-center text-danger">Gagal memuat: ${result.message}</div>`;
        }
    } catch (error) {
        availableContainer.innerHTML = `<div class="list-group-item text-center text-danger">Gagal terhubung ke server.</div>`;
    }
}

function renderTambahPesertaView() {
    const availableContainer = document.getElementById('availablePesertaContainer');
    const selectedContainer = document.getElementById('selectedPesertaContainer');
    const searchAvailableInput = document.getElementById('searchAvailablePeserta');
    const searchSelectedInput = document.getElementById('searchSelectedPeserta');

    const availableFilter = searchAvailableInput.value.toLowerCase();
    const selectedFilter = searchSelectedInput.value.toLowerCase();

    const renderList = (pegawaiList, filter, isSelectedList) => {
        return pegawaiList
            .filter(p =>
                p.nama_pegawai.toLowerCase().includes(filter) ||
                p.nip.toLowerCase().includes(filter) ||
                (p.jabatan && p.jabatan.toLowerCase().includes(filter)) ||
                (p.perangkat_daerah && p.perangkat_daerah.toLowerCase().includes(filter))
            )
            .map(p => {
                const action = isSelectedList ? 'deselect' : 'select';
                const btnClass = isSelectedList ? 'list-group-item-success' : '';
                const onClickAction = `movePegawai('${p.nip}', '${action}')`;

                return `
                    <button type="button" class="list-group-item list-group-item-action py-2 px-2 ${btnClass}" onclick="${onClickAction}">
                        <strong class="d-block">${p.nama_pegawai}</strong>
                        <small class="text-muted d-block">NIP: ${p.nip}</small>
                        <small class="text-muted d-block">${p.jabatan || '-'}</small>
                        <small class="text-muted d-block fst-italic">${p.perangkat_daerah}</small>
                    </button>
                `;
            }).join('');
    };

    availableContainer.innerHTML = renderList(tambahPesertaState.available, availableFilter, false) || '<div class="list-group-item text-center text-muted small">Tidak ada pegawai tersedia.</div>';
    selectedContainer.innerHTML = renderList(tambahPesertaState.selected, selectedFilter, true) || '<div class="list-group-item text-center text-muted small">Belum ada pegawai dipilih.</div>';
}

function movePegawai(nip, action) {
    if (action === 'select') {
        const pegawaiToMove = tambahPesertaState.available.find(p => p.nip === nip);
        if (pegawaiToMove) {
            tambahPesertaState.available = tambahPesertaState.available.filter(p => p.nip !== nip);
            tambahPesertaState.selected.push(pegawaiToMove);
        }
    } else { // deselect
        const pegawaiToMove = tambahPesertaState.selected.find(p => p.nip === nip);
        if (pegawaiToMove) {
            tambahPesertaState.selected = tambahPesertaState.selected.filter(p => p.nip !== nip);
            tambahPesertaState.available.push(pegawaiToMove);
        }
    }
    // Sort both lists by name for consistency
    tambahPesertaState.available.sort((a, b) => a.nama_pegawai.localeCompare(b.nama_pegawai));
    tambahPesertaState.selected.sort((a, b) => a.nama_pegawai.localeCompare(b.nama_pegawai));
    renderTambahPesertaView();
}

function moveAllPegawai(action) {
    const searchAvailableInput = document.getElementById('searchAvailablePeserta');
    const availableFilter = searchAvailableInput.value.toLowerCase();

    if (action === 'select') {
        // Move only the currently filtered items
        const itemsToMove = tambahPesertaState.available.filter(p =>
            p.nama_pegawai.toLowerCase().includes(availableFilter) ||
            p.nip.toLowerCase().includes(availableFilter)
        );
        tambahPesertaState.selected.push(...itemsToMove);
        tambahPesertaState.available = tambahPesertaState.available.filter(p => !itemsToMove.includes(p));
    } else { // deselect
        // Deselect all, regardless of filter
        tambahPesertaState.available.push(...tambahPesertaState.selected);
        tambahPesertaState.selected = [];
    }
    tambahPesertaState.available.sort((a, b) => a.nama_pegawai.localeCompare(b.nama_pegawai));
    tambahPesertaState.selected.sort((a, b) => a.nama_pegawai.localeCompare(b.nama_pegawai));
    renderTambahPesertaView();
}

function toggleBulkVerifikasi() {
    const statusKehadiran = document.getElementById('bulkStatusKehadiran').value;
    const colVerifikasi = document.getElementById('colBulkVerifikasi');
    if (statusKehadiran === 'Belum Absen') {
        colVerifikasi.style.display = 'none';
    } else {
        colVerifikasi.style.display = 'block';
    }
}

async function submitTambahPesertaBulk(event) {
    if (event) event.preventDefault();

    const btn = document.getElementById('btnSimpanTambahPeserta');
    const kodeAkses = document.getElementById('tambahPesertaKodeAkses').value;

    if (tambahPesertaState.selected.length === 0) {
        Swal.fire('Tidak Ada yang Dipilih', 'Silakan pilih minimal satu pegawai.', 'warning');
        return;
    }

    const statusKehadiran = document.getElementById('bulkStatusKehadiran').value;
    const statusVerifikasi = document.getElementById('bulkStatusVerifikasi').value;
    const keterangan = document.getElementById('bulkKeterangan').value;
    const buktiInput = document.getElementById('bulkBuktiDukung');

    if (statusKehadiran !== 'Belum Absen' && !buktiInput.files[0]) {
        // Jika wajib upload bukti, uncomment logic dibawah ini, 
        // tapi sesuai instruksi admin bukti opsional kecuali kita enforce disini.
        // Kita biarkan opsional saja.
    }

    if (buktiInput.files.length > 0 && buktiInput.files[0].size > 1048576) {
        Swal.fire('File Terlalu Besar', 'Maksimal ukuran file bukti dukung adalah 1MB.', 'warning');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Menyimpan...';

    const nipsArray = tambahPesertaState.selected.map(p => p.nip);

    const formData = new FormData();
    formData.append('kode_akses', kodeAkses);
    formData.append('nips', JSON.stringify(nipsArray));
    formData.append('status_kehadiran', statusKehadiran);
    formData.append('status_verifikasi', statusVerifikasi);
    formData.append('keterangan', keterangan);

    if (buktiInput.files[0]) {
        formData.append('bukti_dukung', buktiInput.files[0]);
    }

    try {
        const result = await fetchWithAuth(`${API_BASE_URL}/admin/rekap/entry/bulk/${kodeAkses}`, {
            method: 'POST',
            body: formData
        });

        if (result.status) {
            modalTambahPeserta.hide();
            Swal.fire({
                icon: 'success',
                title: 'Berhasil!',
                text: result.message
            });

            // Refresh list OPD di filter utama
            try {
                const opdResult = await fetchWithAuth(`${API_BASE_URL}/admin/rekap/opd-list/${kodeAkses}`);
                if (opdResult.status) {
                    populateOpdCheckboxContainer('rekapFilterOpdContainer', opdResult.data);
                }
            } catch (e) { console.error("Gagal refresh list OPD filter:", e); }

        } else {
            Swal.fire('Gagal', result.message, 'error');
        }
    } catch (error) {
        console.error('Error adding participant:', error);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-floppy"></i> Simpan Pilihan & Kehadiran';
    }
}

async function tampilkanModalRingkasan() {
    const modalBody = document.getElementById('rekapPerOpdContainerModal');
    modalBody.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-danger"></div><p class="mt-2">Memuat ringkasan...</p></div>';
    modalRingkasan.show();

    try {
        const result = await fetchWithAuth(`${API_BASE_URL}/admin/rekap/summary/${currentRekapData.jadwal.kode_akses}`);
        if (result.status) {
            renderRekapSummary(result.data, 'rekapPerOpdContainerModal');
        } else {
            modalBody.innerHTML = `<div class="alert alert-danger">Gagal memuat ringkasan: ${result.message}</div>`;
        }
    } catch (error) {
        console.error('Error fetching summary:', error);
        modalBody.innerHTML = `<div class="alert alert-danger">Terjadi kesalahan pada aplikasi: ${error.message}</div>`;
    }
}

async function refreshRekapSummary() {
    const kodeAkses = currentRekapData.jadwal.kode_akses;
    const modalBody = document.getElementById('rekapPerOpdContainerModal');
    const originalHtml = modalBody.innerHTML;
    modalBody.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-danger"></div><p class="mt-2">Memuat ulang data...</p></div>';

    try {
        const result = await fetchWithAuth(`${API_BASE_URL}/admin/rekap/summary/${kodeAkses}`);
        if (result.status) {
            renderRekapSummary(result.data, 'rekapPerOpdContainerModal');
            // Tidak perlu panggil terapkanFilterRekap() lagi, ini memperbaiki bug
        } else {
            Swal.fire('Gagal', 'Gagal refresh: ' + result.message, 'error');
            modalBody.innerHTML = originalHtml;
        }
    } catch (error) {
        console.error('Error refreshing summary:', error);
        modalBody.innerHTML = originalHtml;
    }
}

async function exportRekapToExcel() {
    // 1. Dapatkan nilai filter saat ini sesuai struktur DOM halaman rekap.
    const selectedOpds = getSelectedOpdFromCheckbox('rekapFilterOpdContainer');
    const statusKehadiranSelect = document.getElementById('rekapFilterStatus');
    const statusVerifikasiSelect = document.getElementById('rekapFilterVerifikasi');
    const searchInput = document.getElementById('rekapSearchInput').value;

    const statusKehadiran = statusKehadiranSelect && statusKehadiranSelect.value ? statusKehadiranSelect.value : 'semua';
    const statusVerifikasi = statusVerifikasiSelect && statusVerifikasiSelect.value ? statusVerifikasiSelect.value : 'semua';

    // 2. Validasi: Pastikan elemen filter status tersedia di DOM.
    if (!statusKehadiranSelect || !statusVerifikasiSelect) {
        Swal.fire('Filter Tidak Tersedia', 'Elemen filter "Status Kehadiran" atau "Status Verifikasi" tidak ditemukan.', 'warning');
        return;
    }
    // 3. Panggil API detail untuk mendapatkan data yang akan diexport
    try {
        const result = await fetchWithAuth(`${API_BASE_URL}/admin/rekap/details/${currentRekapData.jadwal.kode_akses}`, {
            method: 'POST',
            body: JSON.stringify({
                opd_list: selectedOpds,
                status_kehadiran: statusKehadiran,
                status_verifikasi: statusVerifikasi,
                search: searchInput
            })
        });

        if (!result.status || result.data.length === 0) {
            Swal.fire('Informasi', 'Tidak ada data untuk diunduh berdasarkan filter yang dipilih.', 'info');
            return;
        }

        // 4. Siapkan data untuk di-export ke Excel
        const dataForExcel = result.data.map((p, index) => ({
            'No': index + 1,
            'Nama Pegawai': p.nama_pegawai,
            'NIP': p.nip,
            'Jabatan': p.jabatan || '-',
            'Perangkat Daerah': p.perangkat_daerah,
            'Status Kehadiran': p.status_kehadiran || p.status, // Use new status_kehadiran, fallback to old status
            'Waktu Absen': p.waktu_absen || '-',
            'Lokasi Absen': p.lokasi_absen || '-',
            'Status Verifikasi': p.status_verifikasi,
            'Keterangan Admin': p.keterangan || '-'
        }));

        // 5. Buat worksheet dan workbook
        const ws = XLSX.utils.json_to_sheet(dataForExcel);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Rekap Absensi");

        // 6. Buat nama file dinamis dan picu unduhan
        const judulKegiatan = currentRekapData.jadwal.judul.replace(/[^a-zA-Z0-9]/g, '_');
        const fileName = `Rekap_${judulKegiatan}.xlsx`;
        XLSX.writeFile(wb, fileName);

    } catch (error) {
        Swal.fire('Kesalahan', 'Terjadi kesalahan saat menyiapkan data untuk diunduh.', 'error');
    }
}

function togglePilihSemuaRekap() {
    const isChecked = document.getElementById('rekapPilihSemua').checked;
    document.querySelectorAll('.rekap-pilih-checkbox').forEach(checkbox => {
        checkbox.checked = isChecked;
    });
    updateTombolHapusMassal();
}

function updateTombolHapusMassal() {
    const checkedBoxes = document.querySelectorAll('.rekap-pilih-checkbox:checked');
    const btnHapus = document.getElementById('btnHapusTerpilih');
    if (checkedBoxes.length > 0) {
        btnHapus.classList.remove('d-none');
        btnHapus.textContent = `Hapus ${checkedBoxes.length} Terpilih`;
    } else {
        btnHapus.classList.add('d-none');
    }
}

async function hapusDataAbsensiMassal() {
    const checkedBoxes = document.querySelectorAll('.rekap-pilih-checkbox:checked');
    const nipsToDelete = Array.from(checkedBoxes).map(cb => cb.value);

    if (nipsToDelete.length === 0) {
        Swal.fire('Tidak Ada yang Dipilih', 'Silakan centang minimal satu pegawai untuk dihapus.', 'warning');
        return;
    }

    const confirmation = await Swal.fire({
        title: 'Anda Yakin?',
        html: `Anda akan menghapus <b>${nipsToDelete.length}</b> data absensi pegawai dari rekap ini. <br><br><strong class="text-danger">Aksi ini tidak dapat dibatalkan.</strong>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Ya, Hapus!',
        cancelButtonText: 'Batal'
    });

    if (confirmation.isConfirmed) {
        try {
            const payload = {
                kode_akses: currentRekapData.jadwal.kode_akses,
                nips: nipsToDelete
            };
            const result = await fetchWithAuth(`${API_BASE_URL}/admin/rekap/entry/bulk-delete`, {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (result.status) {
                Swal.fire('Terhapus!', result.message, 'success');
                terapkanFilterRekap(); // Refresh the view
                refreshRekapSummary();
            } else {
                Swal.fire('Gagal', result.message, 'error');
            }
        } catch (error) { }
    }
}

/**
 * =================================================
 * FUNGSI-FUNGSI UNTUK HALAMAN MANAJEMEN PEGAWAI
 * =================================================
 */


async function populatePegawaiFilterOpd() {
    await loadAllOpdList(); // Memastikan daftar OPD sudah dimuat
    const select = document.getElementById('pegawaiFilterOpd');
    // Simpan value yang sedang dipilih jika ada
    const selectedValue = select.value;
    select.innerHTML = '<option value="">-- Semua OPD --</option>'; // Opsi untuk tidak memfilter by OPD
    allOpdList.forEach(opd => {
        const option = document.createElement('option');
        option.value = opd;
        option.textContent = opd;
        select.appendChild(option);
    });
    // Kembalikan value yang terpilih
    select.value = selectedValue;
}

async function loadPegawai(isFromPagination = false) {
    if (isFromPagination !== true) paginasiState.page = 1;
    const pt = document.getElementById("pegawaiPaginationTop"); if (pt) pt.classList.add("d-none");
    const pb = document.getElementById("pegawaiPagination"); if (pb) pb.classList.add("d-none");
    const opd = document.getElementById('pegawaiFilterOpd').value;
    const installStatus = document.getElementById('pegawaiFilterInstall').value;
    const syncStatus = document.getElementById('pegawaiFilterSync').value;
    const search = document.getElementById('pegawaiSearchInput').value;
    const tbody = document.getElementById('pegawaiTableBody');

    tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm"></div> Memuat data pegawai...</td></tr>';

    try {
        const result = await fetchWithAuth(`${API_BASE_URL}/admin/pegawai?page=${paginasiState.page}&limit=${paginasiState.limit}&opd=${encodeURIComponent(opd === 'semua' ? '' : opd)}&install=${installStatus}&sync=${syncStatus}&search=${encodeURIComponent(search)}`);
        if (result.status) {
            currentPegawaiData = result.data.data;
            renderPegawaiTable(currentPegawaiData);
            renderPaginationControls('pegawaiPagination', result.data.pagination, 'pegawai');
        } else {
            tbody.innerHTML = `<tr><td colspan="11" class="text-center text-danger py-4">Gagal memuat data: ${result.message}</td></tr>`;
        }
    } catch (error) {
        console.error('Error loading pegawai:', error);
        tbody.innerHTML = `<tr><td colspan="11" class="text-center text-danger py-4">Terjadi kesalahan koneksi.</td></tr>`;
    }
}

function formatIndonesianDateTime(dateTimeString) {
    if (!dateTimeString) {
        return '-';
    }
    try {
        const date = new Date(dateTimeString);
        return date.toLocaleString('id-ID', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }).replace(/\./g, ':');
    } catch (e) {
        return dateTimeString;
    }
}

function renderPegawaiTable(pegawaiList) {
    const tbody = document.getElementById('pegawaiTableBody');
    if (pegawaiList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted py-4">Tidak ada data pegawai yang ditemukan.</td></tr>';
        return;
    }

    tbody.innerHTML = pegawaiList.map((p, i) => {
        const pegawaiData = JSON.stringify(p).replace(/"/g, '&quot;');

        let syncStatusHtml = '';
        if (p.kv_sync_status == 1) {
            syncStatusHtml = `
                <div class="d-flex flex-column align-items-center gap-1">
                    <span class="badge bg-danger"><i class="bi bi-check-circle-fill"></i> Sinkron</span>
                    <button class="btn btn-sm btn-outline-info mt-1" onclick="syncPegawaiKv('${p.nip}', '${p.nama_pegawai.replace(/'/g, `\\'`)}')" title="Sinkron Ulang Cache"><i class="bi bi-arrow-repeat"></i> Sinkron Ulang</button>
                </div>
            `;
        } else {
            syncStatusHtml = `
                <div class="d-flex flex-column align-items-center gap-1">
                    <span class="badge bg-warning text-dark"><i class="bi bi-exclamation-triangle-fill"></i> Belum Sinkron</span>
                    <button class="btn btn-sm btn-outline-danger mt-1" onclick="syncPegawaiKv('${p.nip}', '${p.nama_pegawai.replace(/'/g, `\\'`)}')" title="Sinkronkan Cache"><i class="bi bi-arrow-repeat"></i> Sinkronkan</button>
                </div>
            `;
        }

        const roleBadge = p.role === 'Admin'
            ? `<span class="badge bg-danger">${p.role}</span>`
            : `<span class="badge bg-secondary">${p.role}</span>`;

        return `
            <tr>
                <td class="text-center">${(paginasiState.page - 1) * paginasiState.limit + i + 1}</td>
                <td>${p.nama_pegawai}</td>
                <td>${p.nip}</td>
                <td>${p.perangkat_daerah}</td>
                <td>${p.jabatan || '-'}</td>
                <td><span class="badge ${p.jenis_asn === 'PNS' ? 'bg-danger' : 'bg-danger'}">${p.jenis_asn}</span></td>
                <td>${roleBadge}</td>
                <td class="text-center">${syncStatusHtml}</td>
                <td class="text-center">
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-warning" onclick='bukaModalEditPegawai(${pegawaiData})' title="Edit Pegawai"><i class="bi bi-pencil-fill"></i></button>
                        <button class="btn btn-outline-danger" onclick="hapusPegawai('${p.nip}', '${p.nama_pegawai.replace(/'/g, `\\'`)}')" title="Hapus Pegawai"><i class="bi bi-trash-fill"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function syncPegawaiKv(nip, nama) {
    const confirmation = await Swal.fire({
        title: 'Sinkronkan Ulang Cache?',
        html: `Anda akan memicu sinkronisasi ulang cache untuk pegawai:<br><b>${nama}</b> (NIP: ${nip}).<br><br>Ini akan memperbarui data di cache.`,
        icon: 'info',
        showCancelButton: true,
        confirmButtonColor: '#198754',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Ya, Sinkronkan!',
        cancelButtonText: 'Batal'
    });

    if (confirmation.isConfirmed) {
        showAdminLoading(true, 'Memulai sinkronisasi...');
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/admin/pegawai/sync-kv/${nip}`, { method: 'POST' });
            showAdminLoading(false);
            if (res.status) {
                Swal.fire({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2500, icon: 'success', title: res.message });
                loadPegawai(); // Muat ulang data tabel untuk melihat status baru
            } else {
                Swal.fire('Gagal', res.message, 'error');
            }
        } catch (error) {
            showAdminLoading(false);
        }
    }
}

async function syncJadwalKv(kodeAkses, judul) {
    const confirmation = await Swal.fire({
        title: 'Sinkronkan Ulang Cache?',
        html: `Anda akan memicu sinkronisasi ulang cache untuk jadwal:<br><b>${judul}</b> (Kode: ${kodeAkses}).<br><br>Ini akan memperbarui data di cache.`,
        icon: 'info',
        showCancelButton: true,
        confirmButtonColor: '#198754',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Ya, Sinkronkan!',
        cancelButtonText: 'Batal'
    });

    if (confirmation.isConfirmed) {
        showAdminLoading(true, 'Memulai sinkronisasi...');
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/admin/jadwal/sync-kv/${kodeAkses}`, { method: 'POST' });
            showAdminLoading(false);
            if (res.status) {
                Swal.fire({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2500, icon: 'success', title: res.message });
                loadJadwalKegiatan(); // Muat ulang data tabel untuk melihat status baru
            } else {
                Swal.fire('Gagal', res.message, 'error');
            }
        } catch (error) {
            showAdminLoading(false);
        }
    }
}

async function loadAllOpdList() {
    if (allOpdList.length > 0) return; // Already loaded
    try {
        // Gunakan endpoint admin yang benar, yang mengembalikan array of objects
        const result = await fetchWithAuth(`${API_BASE_URL}/admin/opd`);
        if (result.status) {
            // Ubah array of objects menjadi array of strings (nama OPD) dan urutkan
            allOpdList = result.data.map(opd => opd.nama_opd).sort();
        } else {
            allOpdList = []; // Pastikan array kosong jika gagal
            console.error('Gagal memuat daftar OPD global.');
        }
    } catch (error) {
        allOpdList = []; // Pastikan array kosong jika gagal
        console.error('Error loading global OPD list:', error);
    }
}

function populateOpdCheckboxContainer(containerId, opdArray) {
    const select = document.getElementById(containerId);
    if (!select) return;

    // Simpan OPD yang sedang terpilih
    const selectedOpd = select.value || 'semua';

    // Update existing TomSelect instance if any
    if (select.tomselect) {
        select.tomselect.clear();
        select.tomselect.clearOptions();
        select.tomselect.addOption({ value: 'semua', text: '-- Semua OPD --' });
        opdArray.forEach(opd => {
            select.tomselect.addOption({ value: opd, text: opd });
        });
        select.tomselect.setValue(selectedOpd, true);
        return;
    }

    let html = '<option value="semua">-- Semua OPD --</option>';
    html += opdArray.map(opd => {
        const isSelected = (selectedOpd === opd) ? 'selected' : '';
        return `<option value="${opd}" ${isSelected}>${opd}</option>`;
    }).join('');

    select.innerHTML = html;

    // Initialize TomSelect
    new TomSelect(select, {
        create: false,
        sortField: {
            field: "text",
            direction: "asc"
        },
        maxOptions: null
    });
}

function getSelectedOpdFromCheckbox(containerId) {
    const select = document.getElementById(containerId);
    if (!select) return 'semua';
    return select.value;
}

function populateOpdDropdown(selectId, selectedValue = '') {
    const select = document.getElementById(selectId);
    select.innerHTML = '<option value="">-- Pilih Perangkat Daerah --</option>'; // Default option
    allOpdList.forEach(opd => {
        const option = document.createElement('option');
        option.value = opd;
        option.textContent = opd;
        if (opd === selectedValue) {
            option.selected = true;
        }
        select.appendChild(option);
    });
}

async function bukaModalTambahPegawai() {
    currentPegawaiMode = 'add';
    document.getElementById('formPegawai').reset();
    document.getElementById('pegawaiNip').readOnly = false;
    document.getElementById('pegawaiNikLabel').innerText = 'NIK';

    // Role management
    const superAdmin = isSuperAdmin();
    document.getElementById('roleAsn').checked = true;
    document.getElementById('roleAdmin').checked = false;
    document.getElementById('roleSuperAdmin').checked = false;
    document.getElementById('roleAdmin').disabled = !superAdmin;
    document.getElementById('roleSuperAdmin').disabled = !superAdmin;

    const header = document.getElementById('modalPegawaiHeader');
    const title = document.getElementById('modalPegawaiTitle');
    const button = document.getElementById('btnSimpanPegawai');

    header.className = 'modal-header bg-danger text-white border-0';
    title.innerHTML = '<i class="bi bi-person-plus-fill"></i> Tambah Pegawai Baru';
    button.className = 'btn btn-danger w-100 fw-bold py-2';
    button.innerHTML = '<i class="bi bi-plus-circle"></i> Tambah Pegawai';

    await loadAllOpdList();
    populateOpdDropdown('pegawaiOpd');
    modalPegawai.show();
}

async function bukaModalEditPegawai(pegawai) {
    currentPegawaiMode = 'edit';
    document.getElementById('formPegawai').reset();
    document.getElementById('pegawaiNip').readOnly = true;

    const header = document.getElementById('modalPegawaiHeader');
    const title = document.getElementById('modalPegawaiTitle');
    const button = document.getElementById('btnSimpanPegawai');

    header.className = 'modal-header bg-warning text-dark border-0';
    title.innerHTML = '<i class="bi bi-pencil-square"></i> Edit Data Pegawai';
    button.className = 'btn btn-warning w-100 fw-bold py-2';
    button.innerHTML = '<i class="bi bi-floppy"></i> Simpan Perubahan';

    document.getElementById('pegawaiNipLama').value = pegawai.nip;
    document.getElementById('pegawaiNip').value = pegawai.nip;
    document.getElementById('pegawaiNama').value = pegawai.nama_pegawai;
    document.getElementById('pegawaiNik').value = '';
    document.getElementById('pegawaiNikLabel').innerText = 'NIK (kosongkan jika data tetap)';
    document.getElementById('pegawaiJabatan').value = pegawai.jabatan || '';
    document.getElementById('pegawaiJenisAsn').value = pegawai.jenis_asn;

    // Role management
    const superAdmin = isSuperAdmin();
    document.getElementById('roleAdmin').disabled = !superAdmin;
    document.getElementById('roleSuperAdmin').disabled = !superAdmin;

    document.getElementById('roleAsn').checked = true; // Always checked
    document.getElementById('roleAdmin').checked = false;
    document.getElementById('roleSuperAdmin').checked = false;

    if (pegawai.role) {
        const roles = pegawai.role.split(',').map(r => r.trim().toLowerCase());
        if (roles.includes('admin')) document.getElementById('roleAdmin').checked = true;
        if (roles.includes('super admin')) document.getElementById('roleSuperAdmin').checked = true;
    }

    await loadAllOpdList();
    populateOpdDropdown('pegawaiOpd', pegawai.perangkat_daerah);

    modalPegawai.show();
}

async function submitPegawai(event) {
    event.preventDefault();
    const btn = document.getElementById('btnSimpanPegawai');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Menyimpan...';

    const payload = {
        nip: document.getElementById('pegawaiNip').value,
        nama_pegawai: document.getElementById('pegawaiNama').value,
        nik: document.getElementById('pegawaiNik').value,
        perangkat_daerah: document.getElementById('pegawaiOpd').value,
        jabatan: document.getElementById('pegawaiJabatan').value,
        jenis_asn: document.getElementById('pegawaiJenisAsn').value,
        role: Array.from(document.querySelectorAll('.role-checkbox:checked')).map(cb => cb.value)
    };

    let url = `${API_BASE_URL}/admin/pegawai`;
    let method = 'POST';

    if (currentPegawaiMode === 'edit') {
        const nipLama = document.getElementById('pegawaiNipLama').value;
        url = `${API_BASE_URL}/admin/pegawai/${nipLama}`;
        method = 'PUT';
    }

    try {
        const result = await fetchWithAuth(url, { method: method, body: JSON.stringify(payload) });
        if (result.status) {
            modalPegawai.hide();
            Swal.fire({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2500, icon: 'success', title: result.message });
            loadPegawai();
        } else {
            Swal.fire('Gagal', result.message, 'error');
        }
    } catch (error) { } finally {
        btn.disabled = false;
        btn.innerHTML = (currentPegawaiMode === 'add') ? '<i class="bi bi-plus-circle"></i> Tambah Pegawai' : '<i class="bi bi-floppy"></i> Simpan Perubahan';
    }
}

async function hapusPegawai(nip, nama) {
    const confirmation = await Swal.fire({
        title: 'Anda Yakin?',
        html: `Anda akan menghapus pegawai:<br><b>${nama}</b> (NIP: ${nip}).<br>Aksi ini tidak dapat dibatalkan!`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Ya, Hapus!',
        cancelButtonText: 'Batal'
    });

    if (confirmation.isConfirmed) {
        try {
            const result = await fetchWithAuth(`${API_BASE_URL}/admin/pegawai/${nip}`, { method: 'DELETE' });
            if (result.status) {
                Swal.fire('Terhapus!', result.message, 'success');
                loadPegawai(); // Muat ulang tabel setelah berhasil hapus
            } else {
                Swal.fire('Gagal', result.message, 'error');
            }
        } catch (error) { }
    }
}

// =========================================================================
// FITUR REKAP KESELURUHAN
// =========================================================================

let currentRekapKeseluruhanData = [];

function initRekapKeseluruhanUI() {
    // Inisialisasi Flatpickr    
    flatpickr("#rekapKeseluruhanStartDate", {
        locale: "id",
        dateFormat: "Y-m-d",
        defaultDate: new Date()
    });

    flatpickr("#rekapKeseluruhanEndDate", {
        locale: "id",
        dateFormat: "Y-m-d",
        defaultDate: new Date()
    });
}

async function bukaHalamanRekapKeseluruhan() {
    resetPaginasi();
    document.getElementById('dashboardContainer').classList.add('d-none');
    document.getElementById('rekapContainer').classList.add('d-none');
    document.getElementById('pegawaiContainer').classList.add('d-none');
    document.getElementById('opdContainer').classList.add('d-none');
    document.getElementById('statistikKehadiranContainer').classList.add('d-none');
    document.getElementById('logAbsensiContainer').classList.add('d-none');
    document.getElementById('rekapKeseluruhanContainer').classList.remove('d-none');

    initRekapKeseluruhanUI();

    // Load OPD list if not already
    if (allOpdList.length === 0) {
        await loadAllOpdList();
    }

    populateOpdCheckboxContainer('rekapKeseluruhanFilterOpdContainer', allOpdList);

    // Reset state
    document.getElementById('rekapKeseluruhanTableBody').innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4"><i class="bi bi-funnel h3"></i><br>Pilih filter di atas dan tekan "Tampilkan Data" untuk menampilkan rekap.</td></tr>';

    resetRekapKeseluruhanFilters();
}

function resetRekapKeseluruhanFilters() {
    const opdSelect = document.getElementById('rekapKeseluruhanFilterOpdContainer');
    if (opdSelect && opdSelect.tomselect) opdSelect.tomselect.setValue('semua');
    document.getElementById('rekapKeseluruhanSearchInput').value = '';
    document.getElementById('rekapKeseluruhanFilterStatus').value = 'semua';
    document.getElementById('rekapKeseluruhanFilterVerifikasi').value = 'semua';
}

async function terapkanFilterRekapKeseluruhan(isFromPagination = false) {
    if (isFromPagination !== true) paginasiState.page = 1;
    const pt = document.getElementById("rekapKeseluruhanPaginationTop"); if (pt) pt.classList.add("d-none");
    const pb = document.getElementById("rekapKeseluruhanPagination"); if (pb) pb.classList.add("d-none");
    const startDate = document.getElementById('rekapKeseluruhanStartDate').value;
    const endDate = document.getElementById('rekapKeseluruhanEndDate').value;

    if (!startDate || !endDate) {
        Swal.fire('Input Tidak Lengkap', 'Pilih Tanggal Mulai dan Tanggal Selesai terlebih dahulu.', 'warning');
        return;
    }

    const selectedOpds = getSelectedOpdFromCheckbox('rekapKeseluruhanFilterOpdContainer');
    const statusKehadiran = document.getElementById('rekapKeseluruhanFilterStatus').value;
    const statusVerifikasi = document.getElementById('rekapKeseluruhanFilterVerifikasi').value;
    const searchInput = document.getElementById('rekapKeseluruhanSearchInput').value;

    const tbody = document.getElementById('rekapKeseluruhanTableBody');
    const tableView = document.getElementById('rekapKeseluruhanTableView');


    tableView.classList.remove('d-none');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm"></div> Memuat data keseluruhan...</td></tr>';



    try {
        const result = await fetchWithAuth(`${API_BASE_URL}/admin/rekap/keseluruhan`, {
            method: 'POST',
            body: JSON.stringify({ start_date: startDate, end_date: endDate, opd_list: selectedOpds, status_kehadiran: statusKehadiran, status_verifikasi: statusVerifikasi, search: searchInput, page: paginasiState.page, limit: paginasiState.limit })
        });

        if (result.status) {
            currentRekapKeseluruhanData = result.data.data;
            renderPaginationControls('rekapKeseluruhanPagination', result.data.pagination, 'rekapKeseluruhan');
            renderRekapKeseluruhanTable(currentRekapKeseluruhanData);

            if (result.data.length > 0) {

            }
        } else {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">Gagal memuat data: ${result.message}</td></tr>`;
        }
    } catch (error) {
        console.error('Error fetching rekap keseluruhan:', error);
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">Terjadi kesalahan koneksi.</td></tr>`;
    }
}

function renderRekapKeseluruhanTable(data) {
    const tbody = document.getElementById('rekapKeseluruhanTableBody');
    const tableView = document.getElementById('rekapKeseluruhanTableView');
    tableView.classList.remove('d-none');

    // Injeksi Banner Warning
    let warningContainer = document.getElementById('keseluruhan-warning-container');
    if (!warningContainer) {
        warningContainer = document.createElement('div');
        warningContainer.id = 'keseluruhan-warning-container';
        tableView.parentNode.insertBefore(warningContainer, tableView);
    }

    const pendingCount = data.filter(p => p.status_verifikasi === 'Menunggu Verifikasi Admin').length;
    if (pendingCount > 0) {
        warningContainer.innerHTML = `<div class="alert alert-warning shadow-sm border-warning mb-3"><i class="bi bi-exclamation-triangle-fill me-2"></i>Terdapat <strong>${pendingCount}</strong> absensi yang <strong>Menunggu Verifikasi Admin</strong> pada tabel di bawah ini. Harap segera periksa.</div>`;
    } else {
        warningContainer.innerHTML = '';
    }

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Tidak ada data yang cocok dengan filter.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map((p, i) => {
        const bln = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        const parts = p.tanggal.split('-');
        const tanggalM = `${parts[2]} ${bln[parseInt(parts[1]) - 1]} ${parts[0]}`;

        const kegiatanInfo = `
            <strong class="d-block text-danger">${p.judul_kegiatan}</strong>
            <small class="text-muted"><i class="bi bi-upc-scan"></i> ${p.kode_akses}</small>
            <small class="d-block text-muted"><i class="bi bi-calendar"></i> ${tanggalM} (${p.jam_mulai} - ${p.jam_selesai})</small>
        `;

        const pegawaiInfo = `
            <strong class="d-block">${p.nama_pegawai}</strong>
            <small class="text-muted">NIP: ${p.nip}</small>
            <small class="d-block text-muted">OPD: <span class="fw-medium">${p.perangkat_daerah}</span></small>
        `;

        const waktu = new Date(p.waktu_absen).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        let kehadiranBadge = '';
        const statusHadir = p.status_kehadiran || 'Hadir';

        switch (statusHadir) {
            case 'Hadir': kehadiranBadge = `<span class="badge bg-danger">Hadir</span>`; break;
            case 'Hadir Terlambat': kehadiranBadge = `<span class="badge bg-warning text-dark">Hadir Terlambat</span>`; break;
            case 'Hadir Diluar Lokasi': kehadiranBadge = `<span class="badge bg-info text-dark">Hadir Diluar Lokasi</span>`; break;
            case 'Hadir Terlambat Diluar Lokasi': kehadiranBadge = `<span class="badge bg-danger">Terlambat &amp; Diluar Lokasi</span>`; break;
            case 'Dinas Dalam Daerah': kehadiranBadge = `<span class="badge bg-primary">Dinas Dalam Daerah</span>`; break;
            case 'Dinas Luar Daerah': kehadiranBadge = `<span class="badge bg-primary">Dinas Luar Daerah</span>`; break;
            case 'Tugas Belajar': kehadiranBadge = `<span class="badge bg-info text-dark">Tugas Belajar</span>`; break;
            default: kehadiranBadge = `<span class="badge bg-secondary">${statusHadir}</span>`;
        }

        const detailAbsensiInfo = `
            <strong class="d-block">${waktu} WIB</strong>
            <div class="mt-1">${kehadiranBadge}</div>
            <small class="text-muted d-block mt-1" title="Alamat Absen">${p.lokasi_absen || 'Lokasi tidak tercatat'}</small>
        `;

        let verifikasiBadge = '';
        const statusVerif = p.status_verifikasi || 'ALPA';

        switch (statusVerif) {
            case 'Terverifikasi Oleh Admin': verifikasiBadge = `<span class="badge bg-danger">Disahkan Admin</span>`; break;
            case 'Terverifikasi Sistem': verifikasiBadge = `<span class="badge bg-danger">Terverifikasi Sistem</span>`; break;
            case 'Ditolak Oleh Admin': verifikasiBadge = `<span class="badge bg-danger">Ditolak Admin</span>`; break;
            case 'Menunggu Verifikasi Admin': verifikasiBadge = `<span class="badge bg-warning text-dark border border-warning"><i class="bi bi-hourglass-split"></i> Menunggu Verifikasi</span>`; break;
            case 'ALPA':
            default:
                verifikasiBadge = `<span class="badge bg-secondary">Alpa</span>`;
                break;
        }

        let fotoLink = '';
        if (p.nama_file_foto && p.nama_file_foto !== 'MANUAL_INPUT.jpg') {
            const isDrive = p.nama_file_foto.startsWith('http://') || p.nama_file_foto.startsWith('https://');
            const urlFoto = isDrive ? p.nama_file_foto : `${ORIGIN_SERVER_URL}/uploads/foto_absensi/${p.nama_file_foto}`;
            const icon = isDrive ? '<i class="bi bi-google"></i> Link Drive' : '<i class="bi bi-camera-fill"></i> Lihat Foto';
            fotoLink = `<a href="${urlFoto}" target="_blank" class="d-block small text-decoration-none mt-1">${icon}</a>`;
        }

        const keteranganText = p.keterangan ? `<div class="small text-muted mt-1 fst-italic" title="Keterangan">"${p.keterangan}"</div>` : '';
        const statusKeteranganInfo = `${verifikasiBadge}${fotoLink}${keteranganText}`;

        return `<tr>
            <td class="text-center align-middle">${(paginasiState.page - 1) * paginasiState.limit + i + 1}</td>
            <td class="align-middle">${kegiatanInfo}</td>
            <td class="align-middle">${pegawaiInfo}</td>
            <td class="align-middle">${detailAbsensiInfo}</td>
            <td class="align-middle">${statusKeteranganInfo}</td>
            <td class="text-center align-middle">
                <!-- Gunakan sistem modal verifikasi yang sudah ada, tapi inject currentRekapData sementara -->
                <button class="btn btn-sm btn-outline-danger" onclick='bukaModalVerifikasiKeseluruhan(${JSON.stringify(p).replace(/"/g, "&quot;")})' title="Edit Status">
                    <i class="bi bi-pencil-square"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger ms-1" onclick="hapusDataAbsensiKeseluruhan('${p.nip}', '${p.nama_pegawai}', '${p.kode_akses}')" title="Hapus Data">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}

async function hapusDataAbsensiKeseluruhan(nip, nama, kodeAkses) {
    const confirmation = await Swal.fire({
        title: 'Anda Yakin?',
        html: `Anda akan menghapus <b>${nama}</b> (NIP: ${nip}) dari rekap kegiatan ini. <br><br><strong class="text-danger">Aksi ini tidak dapat dibatalkan dan akan menghilangkan data kehadiran/ketidakhadiran pegawai ini dari rekap.</strong>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Ya, Hapus!',
        cancelButtonText: 'Batal'
    });

    if (confirmation.isConfirmed) {
        try {
            const result = await fetchWithAuth(`${API_BASE_URL}/admin/rekap/entry/${kodeAkses}/${nip}`, {
                method: 'DELETE'
            });

            if (result.status) {
                Swal.fire('Terhapus!', result.message, 'success');
                // Refresh data dengan filter yang sama
                terapkanFilterRekapKeseluruhan();
            } else {
                Swal.fire('Gagal', result.message, 'error');
            }
        } catch (error) { }
    }
}

function bukaModalVerifikasiKeseluruhan(pegawai) {
    // Inject sementara currentRekapData agar bukaModalVerifikasi() bisa bekerja dengan baik
    currentRekapData = { jadwal: { kode_akses: pegawai.kode_akses } };
    bukaModalVerifikasi(pegawai);
}

function exportRekapKeseluruhanToExcel() {
    if (currentRekapKeseluruhanData.length === 0) {
        Swal.fire('Data Kosong', 'Tidak ada data untuk diekspor.', 'warning');
        return;
    }

    const dataToExport = currentRekapKeseluruhanData.map((p, index) => {
        let absensiInfo = 'Belum Absen';
        if (p.waktu_absen) {
            absensiInfo = new Date(p.waktu_absen).toLocaleString('id-ID');
        }

        return {
            'No': index + 1,
            'Kode Kegiatan': p.kode_akses,
            'Nama Kegiatan': p.judul_kegiatan,
            'Tanggal Kegiatan': p.tanggal,
            'Nama Pegawai': p.nama_pegawai,
            'NIP': p.nip,
            'Jabatan': p.jabatan || '-',
            'Perangkat Daerah (OPD)': p.perangkat_daerah,
            'Waktu Absen': absensiInfo,
            'Status Kehadiran': p.status_kehadiran || '-',
            'Status Verifikasi': p.status_verifikasi || 'ALPA',
            'Keterangan': p.keterangan || '-',
            'Lokasi Absen': p.lokasi_absen || '-',
            'Link Foto': (p.nama_file_foto && p.nama_file_foto !== 'MANUAL_INPUT.jpg') ?
                (p.nama_file_foto.startsWith('http') ? p.nama_file_foto : `${ORIGIN_SERVER_URL}/uploads/foto_absensi/${p.nama_file_foto}`) : '-'
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Rekap Keseluruhan");

    // Atur lebar kolom agar rapi
    worksheet['!cols'] = [
        { wch: 5 },  // No
        { wch: 15 }, // Kode
        { wch: 40 }, // Kegiatan
        { wch: 15 }, // Tanggal
        { wch: 35 }, // Nama Pegawai
        { wch: 20 }, // NIP
        { wch: 35 }, // Jabatan
        { wch: 40 }, // OPD
        { wch: 20 }, // Waktu Absen
        { wch: 25 }, // Status Kehadiran
        { wch: 25 }, // Status Verifikasi
        { wch: 40 }, // Keterangan
        { wch: 40 }, // Lokasi
        { wch: 60 }  // Link Foto
    ];

    const fileName = `Rekap_Keseluruhan_Absensi_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
}

// =========================================================================
// FITUR STATISTIK KEHADIRAN
// =========================================================================

let currentStatistikData = [];

function initStatistikUI() {
    // Inisialisasi Flatpickr    
    flatpickr("#statistikStartDate", {
        locale: "id",
        dateFormat: "Y-m-d",
        defaultDate: new Date()
    });

    flatpickr("#statistikEndDate", {
        locale: "id",
        dateFormat: "Y-m-d",
        defaultDate: new Date()
    });
}

async function bukaHalamanStatistikKehadiran() {
    resetPaginasi();
    document.getElementById('dashboardContainer').classList.add('d-none');
    document.getElementById('rekapContainer').classList.add('d-none');
    document.getElementById('pegawaiContainer').classList.add('d-none');
    document.getElementById('opdContainer').classList.add('d-none');
    document.getElementById('rekapKeseluruhanContainer').classList.add('d-none');
    document.getElementById('logAbsensiContainer').classList.add('d-none');
    document.getElementById('statistikKehadiranContainer').classList.remove('d-none');

    initStatistikUI();

    // Load OPD list if not already
    if (allOpdList.length === 0) {
        await loadAllOpdList();
    }

    populateOpdCheckboxContainer('statistikFilterOpdContainer', allOpdList);

    // Reset state
    document.getElementById('statistikTableBody').innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4"><i class="bi bi-funnel h3"></i><br>Pilih filter di atas dan tekan "Tampilkan Statistik" untuk menampilkan data.</td></tr>';

    resetStatistikFilters();
}

function resetStatistikFilters() {
    const opdSelect = document.getElementById('statistikFilterOpdContainer');
    if (opdSelect && opdSelect.tomselect) opdSelect.tomselect.setValue('semua');
    document.getElementById('statAlpaKes').checked = true;
}

async function terapkanFilterStatistik(isFromPagination = false) {
    if (isFromPagination !== true) paginasiState.page = 1;
    const pt = document.getElementById("statistikPaginationTop"); if (pt) pt.classList.add("d-none");
    const pb = document.getElementById("statistikPagination"); if (pb) pb.classList.add("d-none");
    const startDate = document.getElementById('statistikStartDate').value;
    const endDate = document.getElementById('statistikEndDate').value;

    if (!startDate || !endDate) {
        Swal.fire('Input Tidak Lengkap', 'Pilih Tanggal Mulai dan Tanggal Selesai terlebih dahulu.', 'warning');
        return;
    }

    const selectedOpds = getSelectedOpdFromCheckbox('statistikFilterOpdContainer');
    const statusKehadiran = document.querySelector('input[name="statistikStatusKehadiran"]:checked').value;

    const tbody = document.getElementById('statistikTableBody');
    const tableView = document.getElementById('statistikTableView');


    tableView.classList.remove('d-none');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm"></div> Memuat data statistik...</td></tr>';



    try {
        const result = await fetchWithAuth(`${API_BASE_URL}/admin/statistik`, {
            method: 'POST',
            body: JSON.stringify({ start_date: startDate, end_date: endDate, opd_list: selectedOpds, status_kehadiran: statusKehadiran, page: paginasiState.page, limit: paginasiState.limit })
        });

        if (result.status) {
            currentStatistikData = result.data.data;
            renderPaginationControls('statistikPagination', result.data.pagination, 'statistik');
            renderStatistikTable(currentStatistikData, statusKehadiran);

            if (result.data.length > 0) {

            }
        } else {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">Gagal memuat data: ${result.message}</td></tr>`;
        }
    } catch (error) {
        console.error('Error fetching statistik kehadiran:', error);
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">Terjadi kesalahan koneksi.</td></tr>`;
    }
}

function renderStatistikTable(data, statusKehadiranLabel) {
    const tbody = document.getElementById('statistikTableBody');
    document.getElementById('statistikTableView').classList.remove('d-none');

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Tidak ada data statistik yang ditemukan.</td></tr>';
        return;
    }

    let humanStatus = statusKehadiranLabel;
    if (statusKehadiranLabel === 'alpa') humanStatus = 'Alpa';

    tbody.innerHTML = data.map((p, i) => {
        return `<tr>
            <td class="text-center align-middle">${(paginasiState.page - 1) * paginasiState.limit + i + 1}</td>
            <td class="align-middle">${p.nip}</td>
            <td class="align-middle fw-bold">${p.nama_pegawai}</td>
            <td class="align-middle">${p.jabatan || '-'}</td>
            <td class="align-middle">${p.perangkat_daerah}</td>
            <td class="text-center align-middle h5">
                <div class="d-flex align-items-center justify-content-center gap-2">
                    <span class="badge bg-danger rounded-pill px-3 py-2">${p.jumlah}x ${humanStatus}</span>
                    <button class="btn btn-sm btn-outline-info" onclick="lihatDetailStatistik('${p.nip}', '${p.nama_pegawai.replace(/'/g, `\\'`)}', '${statusKehadiranLabel}')"><i class="bi bi-eye"></i> Detail</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

async function lihatDetailStatistik(nip, namaPegawai, statusKehadiranFixed) {
    const startDate = document.getElementById('statistikStartDate').value;
    const endDate = document.getElementById('statistikEndDate').value;
    const statusKehadiran = statusKehadiranFixed || document.querySelector('input[name="statistikStatusKehadiran"]:checked').value;

    document.getElementById('detailStatistikNama').innerText = namaPegawai;
    const tbody = document.getElementById('detailStatistikTableBody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4"><div class="spinner-border text-danger"></div></td></tr>';

    const modal = new bootstrap.Modal(document.getElementById('modalDetailStatistik'));
    modal.show();

    try {
        const result = await fetchWithAuth(`${API_BASE_URL}/admin/statistik/detail`, {
            method: 'POST',
            body: JSON.stringify({
                start_date: startDate,
                end_date: endDate,
                nip: nip,
                status_kehadiran: statusKehadiran
            })
        });

        if (result.status && result.data.length > 0) {
            tbody.innerHTML = result.data.map((d, i) => {
                const tanggalFmt = d.tanggal.split('-').reverse().join('-');
                let waktuAbsen = d.waktu_absen ? d.waktu_absen.split(' ')[1] : '<span class="text-danger fw-bold">Belum Absen</span>';
                if (statusKehadiran === 'alpa' || d.status_verifikasi === 'Ditolak Oleh Admin' || !d.waktu_absen) {
                    waktuAbsen = '<span class="text-danger fw-bold">Tidak Hadir / Alpa</span>';
                }
                const lokasi = d.lokasi_absen ? `<br><small class="text-muted"><i class="bi bi-geo-alt"></i> ${d.lokasi_absen}</small>` : '';
                return `<tr>
                    <td class="ps-3">${i + 1}</td>
                    <td class="fw-bold">${d.judul_kegiatan}</td>
                    <td>${tanggalFmt}<br><small class="text-muted">${d.jam_mulai} - ${d.jam_selesai}</small></td>
                    <td>${waktuAbsen}${lokasi}</td>
                </tr>`;
            }).join('');
        } else {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">Tidak ada detail kegiatan yang ditemukan.</td></tr>`;
        }
    } catch (error) {
        console.error('Error fetching statistik detail:', error);
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger py-4">Terjadi kesalahan koneksi.</td></tr>`;
    }
}

function exportStatistikToExcel() {
    if (currentStatistikData.length === 0) {
        Swal.fire('Data Kosong', 'Tidak ada data untuk diekspor.', 'warning');
        return;
    }

    let statusKehadiranLabel = document.querySelector('input[name="statistikStatusKehadiran"]:checked').value;
    if (statusKehadiranLabel === 'alpa') statusKehadiranLabel = 'Alpa';

    const dataForExcel = currentStatistikData.map((p, index) => {
        return {
            'No': index + 1,
            'NIP': p.nip,
            'Nama Pegawai': p.nama_pegawai,
            'Jabatan': p.jabatan || '-',
            'Perangkat Daerah (OPD)': p.perangkat_daerah,
            [`Jumlah ${statusKehadiranLabel}`]: p.jumlah
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Statistik Kehadiran');

    worksheet['!cols'] = [
        { wch: 5 },  // No
        { wch: 20 }, // NIP
        { wch: 35 }, // Nama Pegawai
        { wch: 30 }, // Jabatan
        { wch: 40 }, // OPD
        { wch: 15 }  // Jumlah
    ];

    const fileName = `Statistik_Kehadiran_${statusKehadiranLabel}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
}
// EXPORTS UNTUK TESTING (Diabaikan oleh browser)
if (typeof module !== 'undefined') {
    if (module.exports) {
        module.exports = { formatIndonesianDateTime, selectAllOpd, deselectAllOpd };
    }
}



function exportRawDataToExcel(data, fileNamePrefix) {
    if (!data || data.length === 0) {
        Swal.fire('Data Kosong', 'Tidak ada data untuk diekspor.', 'warning');
        return;
    }
    const dataForExcel = data.map((item, index) => {
        return { 'No': index + 1, ...item };
    });
    const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
    const fileName = `${fileNamePrefix}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
}

function exportJadwalToExcel() {
    exportRawDataToExcel(currentJadwalData, 'Data_Kegiatan');
}

function exportPegawaiToExcel() {
    exportRawDataToExcel(currentPegawaiData, 'Data_Pegawai');
}

function exportOpdToExcel() {
    exportRawDataToExcel(currentOpdData, 'Data_OPD');
}

function exportRekapToExcel() {
    exportRawDataToExcel(currentRekapData ? currentRekapData.filtered_pegawai : [], 'Rekap_Kehadiran_Kegiatan');
}

function exportRekapKeseluruhanToExcel() {
    exportRawDataToExcel(currentRekapKeseluruhanData, 'Rekap_Keseluruhan');
}

function exportStatistikToExcel() {
    exportRawDataToExcel(currentStatistikData, 'Statistik_Kehadiran');
}

/**
 * =================================================
 * IMPORT CSV ABSEN MANUAL
 * =================================================
 */
function bukaModalImportAbsen() {
    if (!currentRekapData || !currentRekapData.jadwal) {
        Swal.fire('Kesalahan', 'Data jadwal tidak ditemukan.', 'error');
        return;
    }

    document.getElementById('formImportAbsen').reset();
    document.getElementById('importKodeAkses').value = currentRekapData.jadwal.kode_akses;

    // Reset preview data just in case
    parsedImportData = [];
    document.getElementById('previewImportBody').innerHTML = '';
    document.getElementById('previewImportContainer').classList.add('d-none');
    document.getElementById('btnProsesImport').classList.add('d-none');

    modalImportAbsen.show();
}

document.getElementById('modalImportAbsen').addEventListener('hidden.bs.modal', function () {
    document.getElementById('formImportAbsen').reset();
    parsedImportData = [];
    document.getElementById('previewImportBody').innerHTML = '';
    document.getElementById('previewImportContainer').classList.add('d-none');
    document.getElementById('btnProsesImport').classList.add('d-none');
});

let parsedImportData = [];

function downloadTemplateCSV() {
    const headers = "waktu;nip;nama_pegawai;jabatan;opd;lokasi;lat;lng;nama_file_foto\n";
    // Get the first OPD for the sample if available, else a dummy one
    const sampleOpd = (allOpdList && allOpdList.length > 0) ? allOpdList[0] : "Dinas Komunikasi dan Informatika";

    // Sample rows
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} 07:30:00`;

    const rows = [
        `${dateStr};198001012010011001;Budi Santoso;Staf;${sampleOpd};Kantor Walikota;-0.6276;100.1209;foto_budi.jpg`,
        `${dateStr};198502022015022002;Siti Aminah;Kasubag;${sampleOpd};Kantor Walikota;-0.6276;100.1209;foto_siti.jpg`,
        `${dateStr};199003032020031003;Andi Kurniawan;Kepala Bidang;${sampleOpd};Kantor Walikota;-0.6276;100.1209;foto_andi.jpg`
    ];

    const csvContent = "data:text/csv;charset=utf-8," + headers + rows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "template_import_absen.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function handlePreviewCSV(event) {
    const file = event.target.files[0];
    const previewContainer = document.getElementById('previewImportContainer');
    const tbody = document.getElementById('previewImportBody');
    const btnProses = document.getElementById('btnProsesImport');

    if (!file) {
        previewContainer.classList.add('d-none');
        btnProses.classList.add('d-none');
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');

        parsedImportData = [];
        tbody.innerHTML = '';

        if (lines.length <= 1) {
            Swal.fire('Kesalahan', 'File CSV kosong atau hanya berisi header.', 'error');
            return;
        }

        // Ensure opd names are mapped correctly for validation
        const validOpds = allOpdList.map(opd => opd.trim().toLowerCase());

        // Validasi waktu regex: YYYY-MM-DD HH:MM:SS
        const waktuRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(';');

            const waktu = cols[0] ? cols[0].trim() : '';
            const nip = cols[1] ? cols[1].trim() : '';
            const nama = cols[2] ? cols[2].trim() : '';
            const jabatan = cols[3] ? cols[3].trim() : '';
            const opd = cols[4] ? cols[4].trim() : '';
            const lokasi = cols[5] ? cols[5].trim() : '';
            const lat = cols[6] ? cols[6].trim() : '';
            const lng = cols[7] ? cols[7].trim() : '';
            const foto = cols[8] ? cols[8].trim() : '';

            let validationMsgs = [];

            // Validasi
            if (!waktu) {
                validationMsgs.push('<span class="text-danger"><i class="bi bi-x-circle"></i> Waktu kosong</span>');
            } else if (!waktuRegex.test(waktu)) {
                validationMsgs.push('<span class="text-danger"><i class="bi bi-x-circle"></i> Format waktu harus YYYY-MM-DD HH:MM:SS</span>');
            }
            if (!nip) {
                validationMsgs.push('<span class="text-danger"><i class="bi bi-x-circle"></i> NIP kosong</span>');
            }
            if (!nama) {
                validationMsgs.push('<span class="text-danger"><i class="bi bi-x-circle"></i> Nama kosong</span>');
            }
            if (!jabatan) {
                validationMsgs.push('<span class="text-danger"><i class="bi bi-x-circle"></i> Jabatan kosong</span>');
            }
            if (!opd) {
                validationMsgs.push('<span class="text-danger"><i class="bi bi-x-circle"></i> OPD kosong</span>');
            } else if (validOpds.length > 0 && !validOpds.includes(opd.toLowerCase())) {
                validationMsgs.push('<span class="text-warning"><i class="bi bi-exclamation-triangle"></i> OPD tidak terdaftar</span>');
            }
            if (!lokasi) {
                validationMsgs.push('<span class="text-danger"><i class="bi bi-x-circle"></i> Lokasi kosong</span>');
            }
            if (!lat) {
                validationMsgs.push('<span class="text-danger"><i class="bi bi-x-circle"></i> Latitude kosong</span>');
            }
            if (!lng) {
                validationMsgs.push('<span class="text-danger"><i class="bi bi-x-circle"></i> Longitude kosong</span>');
            }
            if (!foto) {
                validationMsgs.push('<span class="text-danger"><i class="bi bi-x-circle"></i> Foto kosong</span>');
            }

            const isValid = validationMsgs.length === 0;
            if (isValid) {
                validationMsgs.push('<span class="text-success"><i class="bi bi-check-circle"></i> Valid</span>');
            }

            const dataRow = { waktu, nip, nama_pegawai: nama, jabatan, opd, lokasi, lat, lng, nama_file_foto: foto };
            parsedImportData.push({ data: dataRow, valid: isValid });

            const idx = parsedImportData.length - 1;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="text-center"><input class="form-check-input import-row-check" type="checkbox" value="${idx}" ${isValid ? 'checked' : 'disabled'}></td>
                <td>${validationMsgs.join('<br>')}</td>
                <td>${waktu || '<em class="text-muted">Kosong</em>'}</td>
                <td>${nip}</td>
                <td>${nama}</td>
                <td>${opd}</td>
                <td>${foto}</td>
            `;
            tbody.appendChild(tr);
        }

        previewContainer.classList.remove('d-none');
        const countSpan = document.getElementById('previewImportCount');
        if (countSpan) countSpan.innerText = parsedImportData.length;

        if (parsedImportData.length > 0) {
            btnProses.classList.remove('d-none');
        }
    };
    reader.readAsText(file);
}

function toggleImportCheckAll(el) {
    const checkboxes = document.querySelectorAll('.import-row-check:not(:disabled)');
    checkboxes.forEach(cb => cb.checked = el.checked);
}

async function submitImportAbsen(event) {
    event.preventDefault();

    const checkboxes = document.querySelectorAll('.import-row-check:checked');
    if (checkboxes.length === 0) {
        Swal.fire('Peringatan', 'Silakan centang minimal 1 baris data untuk diimport.', 'warning');
        return;
    }

    const selectedData = [];
    let hasInvalidData = false;

    checkboxes.forEach(cb => {
        const idx = parseInt(cb.value);
        if (parsedImportData[idx]) {
            if (!parsedImportData[idx].valid) {
                hasInvalidData = true;
            }
            selectedData.push(parsedImportData[idx].data);
        }
    });

    if (hasInvalidData) {
        Swal.fire('Kesalahan Validasi', 'Terdapat data yang tidak valid pada baris yang Anda centang. Pastikan hanya memilih data yang sudah valid formatnya.', 'error');
        return;
    }

    const kodeAkses = document.getElementById('importKodeAkses').value;
    const statusKehadiran = document.getElementById('importStatusKehadiran').value;
    const statusVerifikasi = document.getElementById('importStatusVerifikasi').value;
    const keterangan = document.getElementById('importKeterangan').value;

    const payload = {
        kode_akses: kodeAkses,
        status_kehadiran: statusKehadiran,
        status_verifikasi: statusVerifikasi,
        keterangan: keterangan,
        data: selectedData
    };

    const btnProses = document.getElementById('btnProsesImport');
    btnProses.disabled = true;
    btnProses.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Memproses...';

    try {
        const response = await fetchWithAuth(`${API_BASE_URL}/admin/rekap/import-csv`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (response.status) {
            Swal.fire({
                icon: 'success',
                title: 'Import Berhasil',
                text: response.message
            });
            modalImportAbsen.hide();
            terapkanFilterRekap(false); // Reload rekap
        } else {
            Swal.fire('Gagal', response.message || 'Terjadi kesalahan saat import data.', 'error');
        }
    } catch (error) {
        console.error('Import Error:', error);
        Swal.fire('Kesalahan', 'Terjadi kesalahan jaringan atau server.', 'error');
    } finally {
        btnProses.disabled = false;
        btnProses.innerHTML = '<i class="bi bi-cloud-upload"></i> Proses Import Data Terpilih';
    }
}

// === FUNGSI LOG ABSENSI (SUPER ADMIN ONLY) ===
function isSuperAdmin() {
    try {
        const token = localStorage.getItem('admin_jwt_token');
        if (!token) return false;
        const payload = JSON.parse(atob(token.split('.')[1]));
        const roles = Array.isArray(payload.data?.role)
            ? payload.data.role.map(r => String(r).trim().toLowerCase())
            : (payload.data?.role ? String(payload.data.role).split(',').map(r => r.trim().toLowerCase()) : []);
        return roles.includes('super admin');
    } catch (e) {
        return false;
    }
}

function checkSuperAdminUI() {
    const isSuper = isSuperAdmin();
    const divider = document.getElementById('menuDividerLogAbsensi');
    const item = document.getElementById('menuItemLogAbsensi');
    if (isSuper) {
        if (divider) divider.classList.remove('d-none');
        if (item) item.classList.remove('d-none');
    } else {
        if (divider) divider.classList.add('d-none');
        if (item) item.classList.add('d-none');
    }
}

let currentLogAbsensiData = [];

async function bukaHalamanLogAbsensi() {
    if (!isSuperAdmin()) {
        Swal.fire('Akses Ditolak', 'Hanya super admin yang dapat mengakses log absensi.', 'error');
        return;
    }
    resetPaginasi();

    // Sembunyikan semua container lain
    document.getElementById('dashboardContainer').classList.add('d-none');
    document.getElementById('rekapContainer').classList.add('d-none');
    document.getElementById('pegawaiContainer').classList.add('d-none');
    document.getElementById('opdContainer').classList.add('d-none');
    document.getElementById('rekapKeseluruhanContainer').classList.add('d-none');
    document.getElementById('statistikKehadiranContainer').classList.add('d-none');
    document.getElementById('logAbsensiContainer').classList.remove('d-none');

    // Reset input filter
    document.getElementById('logFilterKegiatan').value = '';
    document.getElementById('logFilterPegawai').value = '';
    document.getElementById('logFilterAksi').value = '';
    document.getElementById('logFilterPelaku').value = '';
    document.getElementById('logFilterTanggal').value = '';

    // Sembunyikan detail box kegiatan
    document.getElementById('logKegiatanDetailBox').classList.add('d-none');

    // Reset tampilan tabel
    document.getElementById('logAbsensiTableBody').innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4"><i class="bi bi-funnel h3"></i><br>Silakan masukkan kode akses kegiatan pada filter di atas dan klik "Cari".</td></tr>';
    const pt = document.getElementById("logAbsensiPaginationTop"); if (pt) pt.classList.add("d-none");
    const pb = document.getElementById("logAbsensiPagination"); if (pb) pb.classList.add("d-none");
}

async function terapkanFilterLogAbsensi(isFromPagination = false) {
    if (isFromPagination !== true) paginasiState.page = 1;
    const kodeAkses = document.getElementById('logFilterKegiatan').value.trim();
    if (!kodeAkses) {
        Swal.fire('Filter Wajib', 'Silakan masukkan kode akses kegiatan terlebih dahulu.', 'warning');
        return;
    }

    const searchPegawai = document.getElementById('logFilterPegawai').value.trim();
    const jenisAksi = document.getElementById('logFilterAksi').value;
    const searchPelaku = document.getElementById('logFilterPelaku').value.trim();
    const tanggal = document.getElementById('logFilterTanggal').value;

    const tbody = document.getElementById('logAbsensiTableBody');
    const detailBox = document.getElementById('logKegiatanDetailBox');

    // Tampilkan loading di tabel
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm text-danger"></div> Memuat data kegiatan dan log absensi...</td></tr>';
    const pt = document.getElementById("logAbsensiPaginationTop"); if (pt) pt.classList.add("d-none");
    const pb = document.getElementById("logAbsensiPagination"); if (pb) pb.classList.add("d-none");

    // 1. Ambil detail kegiatan dari database untuk validasi & display
    try {
        const resJadwal = await fetchWithAuth(`${API_BASE_URL}/admin/jadwal/${kodeAkses}`);
        if (!resJadwal.status || !resJadwal.data) {
            detailBox.classList.add('d-none');
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">Kode akses kegiatan "${kodeAkses}" tidak ditemukan.</td></tr>`;
            Swal.fire('Gagal', `Jadwal kegiatan dengan kode akses "${kodeAkses}" tidak ditemukan.`, 'error');
            return;
        }

        // Tampilkan detail kegiatan
        const j = resJadwal.data;
        document.getElementById('logDetailKodeAkses').textContent = j.kode_akses;
        document.getElementById('logDetailJudul').textContent = j.judul;
        document.getElementById('logDetailKategori').textContent = j.kategori;
        document.getElementById('logDetailTanggal').textContent = j.tanggal ? formatIndonesianDateTime(j.tanggal).split(',')[0] : '-';
        document.getElementById('logDetailJam').textContent = `${j.jam_mulai} - ${j.jam_selesai} WIB`;
        document.getElementById('logDetailRadius').textContent = `${j.radius_meter} meter`;
        detailBox.classList.remove('d-none');

    } catch (e) {
        console.error('Error fetching jadwal detail:', e);
        detailBox.classList.add('d-none');
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger py-4">Gagal memverifikasi kode akses kegiatan.</td></tr>';
        return;
    }

    // 2. Jika jadwal ditemukan, ambil log absensi dari server
    const query = new URLSearchParams({
        kode_akses: kodeAkses,
        search_pegawai: searchPegawai,
        jenis_aksi: jenisAksi,
        search_pelaku: searchPelaku,
        tanggal: tanggal,
        page: paginasiState.page,
        limit: paginasiState.limit
    });

    try {
        const result = await fetchWithAuth(`${API_BASE_URL}/admin/log-absensi?${query.toString()}`);
        if (result.status) {
            currentLogAbsensiData = result.data.data;
            renderLogAbsensiTable(currentLogAbsensiData);
            renderPaginationControls('logAbsensiPagination', result.data.pagination, 'logAbsensi');
        } else {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">Gagal memuat log: ${result.message}</td></tr>`;
        }
    } catch (error) {
        console.error('Error fetching log absensi:', error);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger py-4">Terjadi kesalahan koneksi atau hak akses saat mengambil log.</td></tr>';
    }
}

function renderLogAbsensiTable(rows) {
    const tbody = document.getElementById('logAbsensiTableBody');
    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Tidak ada data log absensi untuk filter ini.</td></tr>';
        return;
    }

    const pageStartNo = (paginasiState.page - 1) * paginasiState.limit;

    tbody.innerHTML = rows.map((r, index) => {
        let badgeColor = r.jenis_aksi === 'tambah' ? 'success' : (r.jenis_aksi === 'edit' ? 'warning text-dark' : 'danger');
        let formattedData = '-';
        try {
            const parsed = JSON.parse(r.data);
            formattedData = JSON.stringify(parsed, null, 2);
        } catch (e) {
            formattedData = r.data || '-';
        }

        return `
            <tr>
                <td class="text-center fw-bold">${pageStartNo + index + 1}</td>
                <td><small class="fw-semibold">${formatIndonesianDateTime(r.waktu_aksi)}</small></td>
                <td class="text-center"><span class="badge bg-${badgeColor}">${r.jenis_aksi.toUpperCase()}</span></td>
                <td>
                    <div class="fw-bold">${r.nama && r.nama !== '-' ? r.nama : '-'}</div>
                    <small class="text-muted">NIP: ${r.nip}</small>
                </td>
                <td>
                    <div class="fw-bold">${r.nama_pelaku || '-'}</div>
                    <small class="text-muted">NIP: ${r.nip_pelaku}</small>
                </td>
                <td>
                    <div class="font-monospace small text-primary">${r.ip_address || '-'}</div>
                    <small class="text-muted text-break d-block" style="font-size: 0.7rem; max-width: 140px; line-height: 1.1;" title="${(r.user_agent || '').replace(/"/g, '&quot;')}">${r.user_agent || '-'}</small>
                </td>
                <td>
                    <textarea class="form-control form-control-sm text-start font-monospace bg-light" rows="3" readonly style="font-size: 0.75rem; resize: vertical;">${formattedData}</textarea>
                </td>
            </tr>
        `;
    }).join('');
}

function exportLogAbsensiToExcel() {
    if (!currentLogAbsensiData || currentLogAbsensiData.length === 0) {
        Swal.fire('Data Kosong', 'Tidak ada data log absensi untuk diekspor.', 'warning');
        return;
    }
    const dataForExport = currentLogAbsensiData.map(item => ({
        'ID Log': item.id_log_absensi,
        'Waktu Aksi': item.waktu_aksi,
        'Jenis Aksi': item.jenis_aksi,
        'Kode Akses': item.kode_akses,
        'NIP Pegawai': item.nip,
        'Nama Pegawai': item.nama,
        'NIP Pelaku': item.nip_pelaku,
        'Nama Pelaku': item.nama_pelaku,
        'IP Address': item.ip_address,
        'User Agent': item.user_agent || '-',
        'Data JSON': item.data
    }));

    const ws = XLSX.utils.json_to_sheet(dataForExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Log Absensi");

    const tgl = new Date().toISOString().slice(0, 10);
    const kode = document.getElementById('logFilterKegiatan').value.trim() || 'Semua';
    XLSX.writeFile(wb, `Log_Absensi_${kode}_${tgl}.xlsx`);
}
