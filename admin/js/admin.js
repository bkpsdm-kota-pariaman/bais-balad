// File: public_html/admin.js

const ORIGIN_SERVER_URL = 'https://api-esdm.pariamankota.go.id/bais-balad';
const API_BASE_URL = `${ORIGIN_SERVER_URL}/api`;
const WORKER_URL = "https://absensi-kegiatan-asn-worker.bidpp-bkpsdm.workers.dev";
let allOpdList = [];
let qrCodeInstance = null;
let currentRekapData = { jadwal: null, filtered_pegawai: [] };
let rekapFilterOpdSelect = null;
let mapAdd, circleAdd, markerAdd;
let mapEdit, circleEdit, markerEdit;
let currentQrData = { kode: '', judul: '' };
let opdState = { add: { available: [], selected: [] }, edit: { available: [], selected: [] } };

const modalBuatKegiatan = new bootstrap.Modal(document.getElementById('modalBuatKegiatan'));
const modalEditKegiatan = new bootstrap.Modal(document.getElementById('modalEditKegiatan'));
const modalQrCode = new bootstrap.Modal(document.getElementById('modalQrCode'));
const modalVerifikasi = new bootstrap.Modal(document.getElementById('modalVerifikasi'));
const modalRingkasan = new bootstrap.Modal(document.getElementById('modalRingkasan'));
const modalPegawai = new bootstrap.Modal(document.getElementById('modalPegawai'));
const modalTambahPeserta = new bootstrap.Modal(document.getElementById('modalTambahPeserta'));
const modalOpd = new bootstrap.Modal(document.getElementById('modalOpd'));

/**
 * Menampilkan atau menyembunyikan overlay loading menggunakan SweetAlert.
 * @param {boolean} show - True untuk menampilkan, false untuk menyembunyikan.
 * @param {string} [title='Memproses...'] - Teks judul yang akan ditampilkan.
 */
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

let currentPegawaiMode = 'add'; // 'add' or 'edit'
let tambahPesertaOpdFilterSelect = null; // Untuk filter OPD di modal tambah peserta
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
        alert('Username dan Password harus diisi.');
        return;
    }

    // Nonaktifkan tombol untuk mencegah klik ganda
    loginButton.disabled = true;
    loginButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Memproses...';

    try {
        const response = await fetch(`${API_BASE_URL}/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const result = await response.json();

        if (result.status && result.data.token) {
            // Jika login berhasil, simpan token ke localStorage
            localStorage.setItem('admin_jwt_token', result.data.token);

            // Sembunyikan overlay login dan tampilkan konten admin
            document.getElementById('loginOverlay').style.display = 'none';
            document.getElementById('dashboardContainer').classList.remove('d-none');
            document.getElementById('navButtons').classList.remove('d-none');
            
            // Di sini Anda bisa memanggil fungsi untuk memuat data awal dashboard, contoh:
            loadJadwalKegiatan(); 
        } else {
            // Jika login gagal, tampilkan pesan error
            alert(`Login Gagal: ${result.message}`);
        }

    } catch (error) {
        console.error('Login error:', error);
        alert('Koneksi Gagal: Tidak dapat terhubung ke server. Periksa koneksi internet Anda.');
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
        // Jika token ada, anggap sudah login. Sembunyikan overlay.
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('dashboardContainer').classList.remove('d-none');
        document.getElementById('navButtons').classList.remove('d-none');
        loadJadwalKegiatan();
    }
    // Jika tidak ada token, overlay login akan tampil secara default.

    // Inisialisasi Flatpickr
    flatpickr("#newTanggal", { locale: "id", altInput: true, altFormat: "j F Y", dateFormat: "Y-m-d" });
    flatpickr("#editTanggal", { locale: "id", altInput: true, altFormat: "j F Y", dateFormat: "Y-m-d" });
    rekapFilterOpdSelect = new TomSelect("#rekapFilterOpd", { create: false });

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
        'Content-Type': 'application/json',
        ...options.headers,
    };

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) { // Token expired or invalid
        alert('Sesi Anda telah berakhir. Silakan login kembali.');
        forceLogout();
        throw new Error('Unauthorized');
    }
    return response.json();
}

/**
 * Memuat daftar jadwal kegiatan dari server.
 */
async function loadJadwalKegiatan() {
    const loading = document.getElementById('loading');
    const container = document.getElementById('dashboardContainer');
    loading.classList.remove('d-none');
    container.classList.add('d-none');

    try {
        // Tambahkan parameter unik (timestamp) untuk mencegah browser caching pada request GET
        const result = await fetchWithAuth(`${API_BASE_URL}/admin/jadwal?_=${new Date().getTime()}`);
        if (result.status) {
            renderJadwalTable(result.data);
        } else {
            alert('Gagal memuat jadwal: ' + result.message);
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
        let antrianBadge = '';
        if (jadwal.aktifkan_antrian === '1') {
            antrianBadge = '<span class="badge bg-primary">Antrian: Aktif</span>';
        } else if (jadwal.aktifkan_antrian === '0') {
            antrianBadge = '<span class="badge bg-secondary">Antrian: Non-Aktif</span>';
        }

        let syncStatusHtml = '';
        if (jadwal.kv_sync_status == 1) {
            syncStatusHtml = '<span class="badge bg-success"><i class="bi bi-check-circle-fill"></i> Sinkron</span>';
        } else {
            syncStatusHtml = `
                <div class="d-flex flex-column align-items-center gap-1">
                    <span class="badge bg-warning text-dark"><i class="bi bi-exclamation-triangle-fill"></i> Belum Sinkron</span>
                    <button class="btn btn-sm btn-outline-primary mt-1" onclick="syncJadwalKv('${jadwal.kode_akses}', '${jadwal.judul.replace(/'/g, `\\'`)}')" title="Sinkronkan data ke cache KV"><i class="bi bi-arrow-repeat"></i> Sinkronkan</button>
                </div>
            `;
        }
        const row = `
            <tr>
                <td class="text-center">${index + 1}</td>
                <td>
                    <strong class="d-block">${jadwal.judul}</strong>
                    <small class="text-muted d-block">${new Date(jadwal.tanggal).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</small>
                    ${antrianBadge ? `<div class="mt-1">${antrianBadge}</div>` : ''}
                </td>
                <td class="text-center"><span class="badge bg-info">${jadwal.kategori}</span></td>
                <td>${jadwal.jam_mulai} - ${jadwal.jam_selesai} WIB</td>
                <td class="text-center">${syncStatusHtml}</td>
                <td class="text-center" style="min-width: 160px;">
                    <div class="d-flex flex-column gap-2">
                        <button class="btn btn-primary btn-sm" onclick="lihatRekap('${jadwal.kode_akses}')"><i class="bi bi-pie-chart-fill"></i> Lihat Rekap</button>
                        <div class="btn-group btn-group-sm w-100">
                            <button class="btn btn-outline-success" onclick="cetakQrCode('${jadwal.kode_akses}', '${jadwal.judul.replace(/'/g, "\\'")}', '${jadwal.tanggal}', '${jadwal.jam_mulai}', '${jadwal.jam_selesai}')" title="Cetak QR Code"><i class="bi bi-qr-code"></i> QR</button>
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
        Swal.fire('Koneksi Gagal', 'Gagal menyimpan jadwal. Periksa koneksi internet Anda.', 'error');
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
            alert('Jadwal berhasil dihapus.');
            loadJadwalKegiatan();
        } else {
            alert('Gagal menghapus: ' + result.message);
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
    qrContainer.innerHTML = '<div class="spinner-border text-success" role="status"><span class="visually-hidden">Loading...</span></div><p class="mt-2">Membuat QR Code...</p>';
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
            alert('Gagal memuat data jadwal: ' + result.message);
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
        alert('Gagal Memuat: Terjadi kesalahan koneksi saat memuat data jadwal.');
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
        Swal.fire('Koneksi Gagal', 'Gagal memperbarui jadwal. Periksa koneksi internet Anda.', 'error');
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
        alert('Peta atau Geolocation tidak tersedia di browser Anda.');
        return;
    }

    map.locate({ setView: true, maxZoom: 16 });
    map.once('locationfound', function(e) {
        marker.setLatLng(e.latlng).fire('dragend');
    });
    map.once('locationerror', function(e) {
        alert("Gagal mendapatkan lokasi Anda. Pastikan izin lokasi telah diberikan untuk situs ini.");
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

    marker.on('dragend', function() {
        const pos = marker.getLatLng();
        latLngInput.value = `${pos.lat.toFixed(6)},${pos.lng.toFixed(6)}`;
        circle.setLatLng(pos);
        map.panTo(pos);
    });

    document.getElementById(radiusInputId).addEventListener('input', function() {
        circle.setRadius(Number(this.value));
    });

    // Tambahkan listener untuk input manual koordinat
    latLngInput.addEventListener('input', function() {
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
    // Ensure allOpdList is loaded
    if (allOpdList.length === 0) {
        try {
            const result = await fetchWithAuth(`${API_BASE_URL}/admin/opd/list`);
            if (result.status) {
                allOpdList = result.data;
            } else {
                const container = document.getElementById(mode === 'add' ? 'availableOpdContainer' : 'editAvailableOpdContainer');
                container.innerHTML = '<div class="text-danger">Gagal memuat daftar OPD.</div>';
                return;
            }
        } catch (error) {
            const container = document.getElementById(mode === 'add' ? 'availableOpdContainer' : 'editAvailableOpdContainer');
            container.innerHTML = '<div class="text-danger">Gagal memuat daftar OPD.</div>';
            return;
        }
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
    const toSelect = opdState[mode].available.filter(opd => !/sd|smp|puskesmas/i.test(opd));
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
    document.getElementById('opdContainer').classList.add('d-none');
    document.getElementById('pegawaiContainer').classList.add('d-none');
    document.getElementById('rekapContainer').classList.add('d-none');
    document.getElementById('dashboardContainer').classList.remove('d-none');
    loadJadwalKegiatan();
}

function bukaHalamanPegawai() {
    document.getElementById('dashboardContainer').classList.add('d-none');
    document.getElementById('rekapContainer').classList.add('d-none');
    document.getElementById('opdContainer').classList.add('d-none');
    document.getElementById('pegawaiContainer').classList.remove('d-none');
    
    // Reset tampilan dan isi filter, jangan load data dulu
    document.getElementById('pegawaiTableBody').innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4"><i class="bi bi-funnel h3"></i><br>Pilih filter di atas dan tekan "Cari" untuk menampilkan data pegawai.</td></tr>';
    document.getElementById('pegawaiFilterOpd').value = '';
    document.getElementById('pegawaiFilterSync').value = 'semua';
    document.getElementById('pegawaiFilterInstall').value = 'semua';
    document.getElementById('pegawaiSearchInput').value = '';
    populatePegawaiFilterOpd();
    loadPegawaiStats();
}

function bukaHalamanOpd() {
    document.getElementById('dashboardContainer').classList.add('d-none');
    document.getElementById('rekapContainer').classList.add('d-none');
    document.getElementById('pegawaiContainer').classList.add('d-none');
    document.getElementById('opdContainer').classList.remove('d-none');
    loadOpdData();
}

async function lihatRekap(kodeAkses) {
    // Pindah ke tampilan rekap
    document.getElementById('dashboardContainer').classList.add('d-none');
    document.getElementById('rekapContainer').classList.remove('d-none');
    
    // Reset state & UI secara menyeluruh untuk menghindari data lama muncul
    currentRekapData = { jadwal: null, filtered_pegawai: [] }; // Reset data cache
    
    // Reset filter inputs
    rekapFilterOpdSelect.clear(); // Clear TomSelect
    document.getElementById('rekapFilterStatus').value = 'semua';
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
    document.getElementById('btnDownloadExcel').classList.add('d-none');

    try {
        // Panggil API untuk mendapatkan info dasar jadwal dan list OPD untuk filter
        const result = await fetchWithAuth(`${API_BASE_URL}/admin/rekap/${kodeAkses}`);
        if (!result.status) {
            alert('Gagal memuat rekap: ' + result.message);
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

    let html = perOpdSummary.map(opd => `
        <div class="mb-3 border-bottom pb-3">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="fw-bold">${opd.opd_name}</span>
                <span class="fw-bold ${opd.hadir === opd.target ? 'text-success' : 'text-dark'}">${opd.hadir} / ${opd.target} Pegawai (${opd.percentage}%)</span>
            </div>
            <div class="progress" style="height: 20px;"><div class="progress-bar bg-success" role="progressbar" style="width: ${opd.percentage}%;" aria-valuenow="${opd.percentage}">${opd.percentage > 0 ? opd.percentage + '%' : ''}</div></div>
            <div class="row gx-2 gy-1 small mt-2 text-center">
                <div class="col">
                    <div class="p-2 bg-success-subtle rounded h-100">
                        <div class="fw-bold fs-6">${opd.hadir_ideal}</div>
                        <div class="text-success-emphasis" style="font-size: 0.7rem;">Hadir Tepat Waktu</div>
                    </div>
                </div>
                <div class="col">
                    <div class="p-2 bg-danger-subtle rounded h-100">
                        <div class="fw-bold fs-6">${opd.alpa}</div>
                        <div class="text-danger-emphasis" style="font-size: 0.7rem;">Tidak Hadir</div>
                    </div>
                </div>
                <div class="col">
                    <div class="p-2 bg-warning-subtle rounded h-100">
                        <div class="fw-bold fs-6">${opd.terlambat}</div>
                        <div class="text-warning-emphasis" style="font-size: 0.7rem;">Terlambat</div>
                    </div>
                </div>
                <div class="col">
                    <div class="p-2 bg-info-subtle rounded h-100">
                        <div class="fw-bold fs-6">${opd.diluar_lokasi}</div>
                        <div class="text-info-emphasis" style="font-size: 0.7rem;">Di Luar Lokasi</div>
                    </div>
                </div>
                <div class="col">
                    <div class="p-2 bg-danger-subtle rounded h-100">
                        <div class="fw-bold fs-6">${opd.terlambat_diluar_lokasi}</div>
                        <div class="text-danger-emphasis" style="font-size: 0.7rem;">Terlambat &amp; Luar Lokasi</div>
                    </div>
                </div>
            </div>
        </div>
    `).join('');

    const summaryHeader = `
        <div class="mb-4 p-3 bg-light rounded border">
            <div class="d-flex justify-content-between align-items-center mb-2"><span class="fw-bold h5">Total Keseluruhan</span><span class="fw-bold h5">${overallSummary.total_hadir} / ${overallSummary.total_target} Pegawai (${overallSummary.percentage_hadir}%)</span></div>
            <div class="progress" style="height: 25px;"><div class="progress-bar progress-bar-striped bg-primary" role="progressbar" style="width: ${overallSummary.percentage_hadir}%;">${overallSummary.percentage_hadir}% Hadir</div></div>
            <div class="row gx-2 gy-1 small mt-2 text-center">
                <div class="col">
                    <div class="p-2 bg-success-subtle rounded h-100">
                        <div class="fw-bold fs-6">${overallSummary.total_hadir_ideal}</div>
                        <div class="text-success-emphasis" style="font-size: 0.7rem;">Hadir Tepat Waktu</div>
                    </div>
                </div>
                <div class="col">
                    <div class="p-2 bg-danger-subtle rounded h-100">
                        <div class="fw-bold fs-6">${overallSummary.total_alpa}</div>
                        <div class="text-danger-emphasis" style="font-size: 0.7rem;">Tidak Hadir</div>
                    </div>
                </div>
                <div class="col">
                    <div class="p-2 bg-warning-subtle rounded h-100">
                        <div class="fw-bold fs-6">${overallSummary.total_terlambat}</div>
                        <div class="text-warning-emphasis" style="font-size: 0.7rem;">Terlambat</div>
                    </div>
                </div>
                <div class="col">
                    <div class="p-2 bg-info-subtle rounded h-100">
                        <div class="fw-bold fs-6">${overallSummary.total_diluar_lokasi}</div>
                        <div class="text-info-emphasis" style="font-size: 0.7rem;">Di Luar Lokasi</div>
                    </div>
                </div>
                <div class="col">
                    <div class="p-2 bg-danger-subtle rounded h-100">
                        <div class="fw-bold fs-6">${overallSummary.total_terlambat_diluar_lokasi}</div>
                        <div class="text-danger-emphasis" style="font-size: 0.7rem;">Terlambat &amp; Luar Lokasi</div>
                    </div>
                </div>
            </div>
        </div>`;

    container.innerHTML = summaryHeader + html;
}

function populateRekapFilters(opdList) {
    rekapFilterOpdSelect.clear();
    rekapFilterOpdSelect.clearOptions();
    rekapFilterOpdSelect.addOption(opdList.map(opd => ({ value: opd, text: opd })));
    document.getElementById('rekapFilterStatus').value = 'semua';
}

function selectAllOpdFilter() {
    const allOptions = Object.keys(rekapFilterOpdSelect.options);
    rekapFilterOpdSelect.setValue(allOptions);
}
async function terapkanFilterRekap() {
    const selectedOpds = rekapFilterOpdSelect.getValue();
    const selectedStatus = document.getElementById('rekapFilterStatus').value;
    const selectedView = document.getElementById('rekapFilterView').value;
    const searchInput = document.getElementById('rekapSearchInput').value;

    const tbody = document.getElementById('rekapTableBody');
    const tableView = document.getElementById('rekapTableView');
    const photoGridView = document.getElementById('rekapPhotoGridView');
    const btnDownload = document.getElementById('btnDownloadExcel');
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
    btnDownload.classList.add('d-none');

    try {
        const result = await fetchWithAuth(`${API_BASE_URL}/admin/rekap/details/${currentRekapData.jadwal.kode_akses}`, {
            method: 'POST',
            body: JSON.stringify({
                opd_list: selectedOpds,
                status_kehadiran: selectedStatus,
                search: searchInput
            })
        });

        if (result.status) {
            currentRekapData.filtered_pegawai = result.data;
            if (selectedView === 'table') {
                renderRekapTable(currentRekapData.filtered_pegawai);
            } else {
                renderFotoKehadiranGrid(currentRekapData.filtered_pegawai);
            }

            // Tampilkan tombol download jika ada data
            if (result.data.length > 0) {
                btnDownload.classList.remove('d-none');
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
            renderOpdTable(result.data);
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

    header.className = 'modal-header bg-success text-white border-0';
    title.innerHTML = '<i class="bi bi-building"></i> Tambah OPD Baru';
    button.className = 'btn btn-success w-100 fw-bold py-2';
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
    } catch (error) {
        Swal.fire('Koneksi Gagal', 'Gagal menyimpan data OPD. Periksa koneksi internet Anda.', 'error');
    } finally {
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
        } catch (error) {
            Swal.fire('Koneksi Gagal', 'Gagal menghapus OPD. Periksa koneksi internet Anda.', 'error');
        }
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
                Swal.fire({toast: true, position: 'top-end', showConfirmButton: false, timer: 2500, icon: 'success', title: res.message});
            } else {
                Swal.fire('Gagal', res.message, 'error');
            }
        } catch (error) {
            showAdminLoading(false);
            Swal.fire('Koneksi Gagal', 'Gagal memicu sinkronisasi. Periksa koneksi internet Anda.', 'error');
        }
    }
}

function renderRekapTable(filteredPegawai) {
    const tbody = document.getElementById('rekapTableBody');
    document.getElementById('rekapTableView').classList.remove('d-none');
    document.getElementById('rekapPhotoGridView').classList.add('d-none');
    
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
                
                switch(statusHadir) {
                    case 'Hadir':
                        kehadiranBadge = `<span class="badge bg-success">Hadir</span>`;
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

            switch(statusVerif) {
                case 'Terverifikasi Oleh Admin':
                    verifikasiBadge = `<span class="badge bg-primary">Disahkan Admin</span>`;
                    break;
                case 'Terverifikasi Sistem':
                    verifikasiBadge = `<span class="badge bg-success">Terverifikasi Sistem</span>`;
                    break;
                case 'Ditolak Oleh Admin':
                    verifikasiBadge = `<span class="badge bg-danger">Ditolak Admin</span>`;
                    break;
                case 'ALPA':
                default:
                    verifikasiBadge = `<span class="badge bg-secondary">Alpa</span>`;
                    break;
            }

            const fotoLink = (p.nama_file_foto && p.nama_file_foto !== 'MANUAL_INPUT.jpg') 
                ? `<a href="${ORIGIN_SERVER_URL}/uploads/foto_absensi/${p.nama_file_foto}" target="_blank" class="d-block small text-decoration-none mt-1"><i class="bi bi-camera-fill"></i> Lihat Foto</a>` 
                : '';
            
            const keteranganText = p.keterangan ? `<div class="small text-muted mt-1 fst-italic" title="Keterangan">"${p.keterangan}"</div>` : '';

            const statusKeteranganInfo = `${verifikasiBadge}${fotoLink}${keteranganText}`;

            const pegawaiData = JSON.stringify(p).replace(/"/g, '&quot;');

            return `<tr>
                <td class="text-center align-middle"><input class="form-check-input rekap-pilih-checkbox" type="checkbox" value="${p.nip}" onchange="updateTombolHapusMassal()"></td>
                <td class="text-center">${i + 1}</td>
                <td>${pegawaiInfo}</td>
                <td>${p.perangkat_daerah}</td>
                <td>${detailAbsensiInfo}</td>
                <td>${statusKeteranganInfo}</td>
                <td class="text-center">
                    <div class="btn-group btn-group-sm" role="group">
                        <button class="btn btn-outline-primary" onclick='bukaModalVerifikasi(${pegawaiData})' title="Edit Status">
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
        switch(p.status_kehadiran) {
            case 'Hadir':
                statusKehadiranBadge = `<span class="badge bg-success">Hadir</span>`;
                break;
            case 'Hadir Terlambat':
                statusKehadiranBadge = `<span class="badge bg-warning text-dark">Hadir Terlambat</span>`;
                break;
            case 'Hadir Diluar Lokasi':
                statusKehadiranBadge = `<span class="badge bg-info text-dark">Hadir Diluar Lokasi</span>`;
                break;
            case 'Hadir Terlambat Diluar Lokasi':
                statusKehadiranBadge = `<span class="badge bg-danger">Terlambat &amp; Diluar Lokasi</span>`;
                break;
            default:
                statusKehadiranBadge = `<span class="badge bg-secondary">${p.status_kehadiran}</span>`;
        }

        // Tambahkan badge untuk status verifikasi agar lebih informatif
        let verifStatusBadge = '';
        switch (p.status_verifikasi) {
            case 'Terverifikasi Oleh Admin':
                verifStatusBadge = `<span class="badge bg-primary">Disahkan Admin</span>`;
                break;
            case 'Ditolak Oleh Admin':
                verifStatusBadge = `<span class="badge bg-warning text-dark">Ditolak Admin</span>`;
                break;
        }

        const pegawaiData = JSON.stringify(p).replace(/"/g, '&quot;');

        const cardHtml = `
            <div class="col">
                <div class="card h-100 shadow-sm">
                    <img src="${ORIGIN_SERVER_URL}/uploads/foto_absensi/${p.nama_file_foto}" class="card-img-top" alt="Foto Absensi ${p.nama_pegawai}" style="height: 200px; object-fit: cover; cursor: pointer;" onclick="Swal.fire({ title: 'Foto Kehadiran: ${p.nama_pegawai.replace(/'/g, `\\'`)}', imageUrl: '${ORIGIN_SERVER_URL}/uploads/foto_absensi/${p.nama_file_foto}', imageWidth: '90vw', imageHeight: 'auto', showCloseButton: true, confirmButtonText: 'Tutup' })">
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
                            <button class="btn btn-sm btn-outline-primary w-100" onclick='bukaModalVerifikasi(${pegawaiData})'>
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
        } catch (error) {
            Swal.fire('Koneksi Gagal', 'Gagal menghapus data. Periksa koneksi internet Anda.', 'error');
        }
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

    if (pegawai.nama_file_foto && pegawai.nama_file_foto !== 'MANUAL_INPUT.jpg') {
        verifLinkFoto.href = `${ORIGIN_SERVER_URL}/uploads/foto_absensi/${pegawai.nama_file_foto}`;
        verifLinkFoto.classList.remove('d-none');
        verifTanpaFoto.classList.add('d-none');
    } else {
        verifLinkFoto.classList.add('d-none');
        verifTanpaFoto.classList.remove('d-none');
    }

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

    const payload = {
        kode_akses: document.getElementById('verifKodeAkses').value,
        nip: document.getElementById('verifNip').value,
        status_verifikasi: document.getElementById('verifStatus').value,
        keterangan: document.getElementById('verifKeterangan').value,
        opd: document.getElementById('verifOpd').value,
        jabatan: document.getElementById('verifJabatan').value
    };

    const btn = document.getElementById('btnSimpanVerif');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Menyimpan...';

    try {
        const result = await fetchWithAuth(`${API_BASE_URL}/admin/verifikasi`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (result.status) {
            modalVerifikasi.hide();
            Swal.fire({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2000, icon: 'success', title: 'Status berhasil diperbarui!' });
            
            // Ambil daftar OPD terbaru untuk filter, karena mungkin berubah setelah edit.
            try {
                const opdResult = await fetchWithAuth(`${API_BASE_URL}/admin/rekap/opd-list/${payload.kode_akses}`);
                if (opdResult.status) {
                    const currentSelection = rekapFilterOpdSelect.getValue();
                    rekapFilterOpdSelect.clear();
                    rekapFilterOpdSelect.clearOptions();
                    rekapFilterOpdSelect.addOption(opdResult.data.map(opd => ({ value: opd, text: opd })));
                    // Coba pulihkan pilihan filter sebelumnya jika masih valid
                    const validSelection = currentSelection.filter(opd => opdResult.data.includes(opd));
                    rekapFilterOpdSelect.setValue(validSelection, true); // `true` untuk silent
                }
            } catch (e) { console.error("Gagal refresh list OPD filter:", e); }

            terapkanFilterRekap();
            refreshRekapSummary(); // Refresh juga modal ringkasan
        } else {
            alert('Gagal memperbarui: ' + result.message);
        }
    } catch (error) {
        console.error('Error submitting verification:', error);
        alert('Koneksi Gagal: Gagal menyimpan verifikasi. Periksa koneksi internet Anda.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-floppy"></i> Simpan Status';
    }
}

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

    // Inisialisasi filter OPD jika belum ada
    if (!tambahPesertaOpdFilterSelect) {
        tambahPesertaOpdFilterSelect = new TomSelect("#tambahPesertaFilterOpd", { create: false });
    }
    tambahPesertaOpdFilterSelect.clear();
    tambahPesertaOpdFilterSelect.clearOptions();
    
    await loadAllOpdList(); // Memastikan allOpdList terisi
    tambahPesertaOpdFilterSelect.addOption(allOpdList.map(opd => ({ value: opd, text: opd })));

    // Tambahkan event listener untuk search input (Enter key)
    searchInput.onkeypress = (e) => {
        if (e.key === 'Enter') {
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

    const filterText = searchInput.value;
    const selectedOpds = tambahPesertaOpdFilterSelect.getValue();

    availableContainer.innerHTML = '<div class="list-group-item text-center text-muted"><div class="spinner-border spinner-border-sm"></div> Mencari pegawai...</div>';
    
    try {
        const result = await fetchWithAuth(`${API_BASE_URL}/admin/rekap/eligible-pegawai/${kodeAkses}`, {
            method: 'POST',
            body: JSON.stringify({
                search: filterText,
                opd_list: selectedOpds
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
                p.nip.toLowerCase().includes(filter)
            )
            .map(p => {
                const action = isSelectedList ? 'deselect' : 'select';
                const btnClass = isSelectedList ? 'list-group-item-success' : '';
                const onClickAction = `movePegawai('${p.nip}', '${action}')`;

                return `
                    <button type="button" class="list-group-item list-group-item-action py-1 px-2 ${btnClass}" onclick="${onClickAction}">
                        <strong class="d-block">${p.nama_pegawai}</strong>
                        <small class="text-muted">NIP: ${p.nip}</small>
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

async function submitTambahPesertaBulk() {
    const btn = document.getElementById('btnSimpanTambahPeserta');
    const kodeAkses = document.getElementById('tambahPesertaKodeAkses').value;
    
    if (tambahPesertaState.selected.length === 0) {
        Swal.fire('Tidak Ada yang Dipilih', 'Silakan centang minimal satu pegawai untuk ditambahkan.', 'warning');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Menambahkan...';

    const payload = tambahPesertaState.selected.map(p => ({ nip: p.nip }));

    try {
        const result = await fetchWithAuth(`${API_BASE_URL}/admin/rekap/entry/bulk/${kodeAkses}`, {
            method: 'POST',
            body: JSON.stringify(payload)
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
                    const currentSelection = rekapFilterOpdSelect.getValue();
                    rekapFilterOpdSelect.clear();
                    rekapFilterOpdSelect.clearOptions();
                    rekapFilterOpdSelect.addOption(opdResult.data.map(opd => ({ value: opd, text: opd })));
                    rekapFilterOpdSelect.setValue(currentSelection, true);
                }
            } catch (e) { console.error("Gagal refresh list OPD filter:", e); }

            terapkanFilterRekap(); // Refresh the main table
            refreshRekapSummary(); // Refresh the summary modal
        } else {
            Swal.fire('Gagal', result.message, 'error');
        }
    } catch (error) {
        console.error('Error adding participant:', error);
        Swal.fire('Koneksi Gagal', 'Gagal menambahkan peserta. Periksa koneksi internet Anda.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-plus-circle"></i> Tambahkan Peserta Terpilih';
    }
}

async function tampilkanModalRingkasan() {
    const modalBody = document.getElementById('rekapPerOpdContainerModal');
    modalBody.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-primary"></div><p class="mt-2">Memuat ringkasan...</p></div>';
    modalRingkasan.show();

    try {
        const result = await fetchWithAuth(`${API_BASE_URL}/admin/rekap/summary/${currentRekapData.jadwal.kode_akses}`);
        if (result.status) {
            renderRekapSummary(result.data, 'rekapPerOpdContainerModal');
        } else {
            modalBody.innerHTML = `<div class="alert alert-danger">Gagal memuat ringkasan: ${result.message}</div>`;
        }
    } catch (error) {
        modalBody.innerHTML = `<div class="alert alert-danger">Gagal terhubung ke server.</div>`;
    }
}

async function refreshRekapSummary() {
    const kodeAkses = currentRekapData.jadwal.kode_akses;
    const modalBody = document.getElementById('rekapPerOpdContainerModal');
    const originalHtml = modalBody.innerHTML;
    modalBody.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-primary"></div><p class="mt-2">Memuat ulang data...</p></div>';

    try {
        const result = await fetchWithAuth(`${API_BASE_URL}/admin/rekap/summary/${kodeAkses}`);
        if (result.status) {
            renderRekapSummary(result.data, 'rekapPerOpdContainerModal');
            // Tidak perlu panggil terapkanFilterRekap() lagi, ini memperbaiki bug
        } else {
            alert('Gagal refresh: ' + result.message);
            modalBody.innerHTML = originalHtml;
        }
    } catch (error) {
        console.error('Error refreshing summary:', error);
        alert('Koneksi Gagal: Gagal memuat ulang ringkasan. Periksa koneksi internet Anda.');
        modalBody.innerHTML = originalHtml;
    }
}

async function exportRekapToExcel() {
    // 1. Dapatkan nilai filter saat ini
    const selectedOpds = rekapFilterOpdSelect.getValue();
    const selectedStatus = document.getElementById('rekapFilterStatus').value;

    // 2. Validasi: Pastikan filter OPD dipilih
    if (selectedOpds.length === 0) {
        alert('Silakan pilih minimal satu OPD untuk diunduh.');
        return;
    }

    // 3. Panggil API detail untuk mendapatkan data yang akan diexport
    try {
        const result = await fetchWithAuth(`${API_BASE_URL}/admin/rekap/details/${currentRekapData.jadwal.kode_akses}`, {
            method: 'POST',
            body: JSON.stringify({
                opd_list: selectedOpds,
                status_kehadiran: selectedStatus // Use status_kehadiran for consistency
            })
        });

        if (!result.status || result.data.length === 0) {
            alert('Tidak ada data untuk diunduh berdasarkan filter yang dipilih.');
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
        const statusFile = selectedStatus.charAt(0).toUpperCase() + selectedStatus.slice(1);
        const fileName = `Rekap_${judulKegiatan}_${statusFile}.xlsx`;
        XLSX.writeFile(wb, fileName);

    } catch (error) {
        alert('Terjadi kesalahan saat menyiapkan data untuk diunduh.');
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
        } catch (error) {
            Swal.fire('Koneksi Gagal', 'Gagal menghapus data. Periksa koneksi internet Anda.', 'error');
        }
    }
}

/**
 * =================================================
 * FUNGSI-FUNGSI UNTUK HALAMAN MANAJEMEN PEGAWAI
 * =================================================
 */

async function loadPegawaiStats() {
    // Reset stats
    document.getElementById('totalPegawaiStat').innerText = '...';
    document.getElementById('installedPegawaiStat').innerText = '...';
    document.getElementById('notInstalledPegawaiStat').innerText = '...';

    try {
        const result = await fetchWithAuth(`${API_BASE_URL}/admin/pegawai/stats`);
        if (result.status) {
            document.getElementById('totalPegawaiStat').innerText = result.data.total.toLocaleString('id-ID');
            document.getElementById('installedPegawaiStat').innerText = result.data.installed.toLocaleString('id-ID');
            document.getElementById('notInstalledPegawaiStat').innerText = result.data.not_installed.toLocaleString('id-ID');
        }
    } catch (error) {
        console.error('Error loading pegawai stats:', error);
        document.getElementById('totalPegawaiStat').innerText = 'Error';
        document.getElementById('installedPegawaiStat').innerText = 'Error';
        document.getElementById('notInstalledPegawaiStat').innerText = 'Error';
    }
}

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

async function loadPegawai() {
    const opd = document.getElementById('pegawaiFilterOpd').value;
    const installStatus = document.getElementById('pegawaiFilterInstall').value;
    const syncStatus = document.getElementById('pegawaiFilterSync').value;
    const search = document.getElementById('pegawaiSearchInput').value;
    const tbody = document.getElementById('pegawaiTableBody');

    tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm"></div> Memuat data pegawai...</td></tr>';

    try {
        const result = await fetchWithAuth(`${API_BASE_URL}/admin/pegawai?opd=${encodeURIComponent(opd)}&search=${encodeURIComponent(search)}&install=${encodeURIComponent(installStatus)}&sync=${encodeURIComponent(syncStatus)}`);
        if (result.status) {
            renderPegawaiTable(result.data);
        } else {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger py-4">Gagal memuat data: ${result.message}</td></tr>`;
        }
    } catch (error) {
        console.error('Error loading pegawai:', error);
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger py-4">Terjadi kesalahan koneksi.</td></tr>`;
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
        tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4">Tidak ada data pegawai yang ditemukan.</td></tr>';
        return;
    }

    tbody.innerHTML = pegawaiList.map((p, i) => {
        const pegawaiData = JSON.stringify(p).replace(/"/g, '&quot;');

        let syncStatusHtml = '';
        if (p.kv_sync_status == 1) {
            syncStatusHtml = '<span class="badge bg-success"><i class="bi bi-check-circle-fill"></i> Sinkron</span>';
        } else {
            syncStatusHtml = `
                <div class="d-flex flex-column align-items-center gap-1">
                    <span class="badge bg-warning text-dark"><i class="bi bi-exclamation-triangle-fill"></i> Belum Sinkron</span>
                    <button class="btn btn-sm btn-outline-primary" onclick="syncPegawaiKv('${p.nip}', '${p.nama_pegawai.replace(/'/g, `\\'`)}')" title="Sinkronkan data ke cache KV">
                        <i class="bi bi-arrow-repeat"></i> Sinkronkan
                    </button>
                </div>
            `;
        }

        return `
            <tr>
                <td class="text-center">${i + 1}</td>
                <td>${p.nama_pegawai}</td>
                <td>${p.nip}</td>
                <td>${p.perangkat_daerah}</td>
                <td>${p.jabatan || '-'}</td>
                <td>${p.nik}</td>
                <td><span class="badge ${p.jenis_asn === 'PNS' ? 'bg-primary' : 'bg-success'}">${p.jenis_asn}</span></td>
                <td>${formatIndonesianDateTime(p.last_login)}</td>
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
        title: 'Sinkronkan Cache?',
        html: `Anda akan memicu sinkronisasi cache untuk pegawai:<br><b>${nama}</b> (NIP: ${nip}).<br><br>Ini akan menghapus data lama dari cache Cloudflare KV.`,
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
                Swal.fire({toast: true, position: 'top-end', showConfirmButton: false, timer: 2500, icon: 'success', title: res.message});
                loadPegawai(); // Muat ulang data tabel untuk melihat status baru
            } else {
                Swal.fire('Gagal', res.message, 'error');
            }
        } catch (error) {
            showAdminLoading(false);
            Swal.fire('Koneksi Gagal', 'Gagal memicu sinkronisasi. Periksa koneksi internet Anda.', 'error');
        }
    }
}

async function syncJadwalKv(kodeAkses, judul) {
    const confirmation = await Swal.fire({
        title: 'Sinkronkan Cache?',
        html: `Anda akan memicu sinkronisasi cache untuk jadwal:<br><b>${judul}</b> (Kode: ${kodeAkses}).<br><br>Ini akan memperbarui data di cache Cloudflare KV.`,
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
                Swal.fire({toast: true, position: 'top-end', showConfirmButton: false, timer: 2500, icon: 'success', title: res.message});
                loadJadwalKegiatan(); // Muat ulang data tabel untuk melihat status baru
            } else {
                Swal.fire('Gagal', res.message, 'error');
            }
        } catch (error) {
            showAdminLoading(false);
            Swal.fire('Koneksi Gagal', 'Gagal memicu sinkronisasi. Periksa koneksi internet Anda.', 'error');
        }
    }
}

async function loadAllOpdList() {
    if (allOpdList.length > 0) return; // Already loaded
    try {
        const result = await fetchWithAuth(`${API_BASE_URL}/admin/opd/list`);
        if (result.status) {
            allOpdList = result.data;
        } else {
            console.error('Gagal memuat daftar OPD global.');
        }
    } catch (error) {
        console.error('Error loading global OPD list:', error);
    }
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

    const header = document.getElementById('modalPegawaiHeader');
    const title = document.getElementById('modalPegawaiTitle');
    const button = document.getElementById('btnSimpanPegawai');

    header.className = 'modal-header bg-success text-white border-0';
    title.innerHTML = '<i class="bi bi-person-plus-fill"></i> Tambah Pegawai Baru';
    button.className = 'btn btn-success w-100 fw-bold py-2';
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
    document.getElementById('pegawaiNik').value = pegawai.nik;
    document.getElementById('pegawaiJabatan').value = pegawai.jabatan || '';
    document.getElementById('pegawaiJenisAsn').value = pegawai.jenis_asn;
    
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
    } catch (error) {
        Swal.fire('Koneksi Gagal', 'Gagal menyimpan data pegawai. Periksa koneksi internet Anda.', 'error');
    } finally {
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
        } catch (error) {
            Swal.fire('Koneksi Gagal', 'Gagal menghapus pegawai. Periksa koneksi internet Anda.', 'error');
        }
    }
}