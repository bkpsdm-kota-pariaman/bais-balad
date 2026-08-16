const fs = require('fs');

const code = `

// --- VALIDATION FUNCTIONS ---
function validateAndSubmitKegiatanBaru(event) {
    if (event) event.preventDefault();
    const judul = document.getElementById('newJudul').value.trim();
    const kategori = document.getElementById('newKategori').value.trim();
    const tanggal = document.getElementById('newTanggal').value.trim();
    const jamMulai = document.getElementById('newJamMulai').value.trim();
    const jamSelesai = document.getElementById('newJamSelesai').value.trim();

    if (!judul || !kategori || !tanggal || !jamMulai || !jamSelesai) {
        Swal.fire('Input Tidak Lengkap', 'Silakan lengkapi semua kolom wajib (Judul, Kategori, Tanggal, Jam Mulai, Jam Selesai).', 'warning');
        return;
    }
    submitKegiatanBaru(event);
}

function validateAndSubmitEditKegiatan(event) {
    if (event) event.preventDefault();
    const judul = document.getElementById('editJudul').value.trim();
    const kategori = document.getElementById('editKategori').value.trim();
    const tanggal = document.getElementById('editTanggal').value.trim();
    const jamMulai = document.getElementById('editJamMulai').value.trim();
    const jamSelesai = document.getElementById('editJamSelesai').value.trim();

    if (!judul || !kategori || !tanggal || !jamMulai || !jamSelesai) {
        Swal.fire('Input Tidak Lengkap', 'Silakan lengkapi semua kolom wajib (Judul, Kategori, Tanggal, Jam Mulai, Jam Selesai).', 'warning');
        return;
    }
    submitEditKegiatan(event);
}

function validateAndSubmitPegawai(event) {
    if (event) event.preventDefault();
    const nip = document.getElementById('pegawaiNip').value.trim();
    const nama = document.getElementById('pegawaiNama').value.trim();
    const nik = document.getElementById('pegawaiNik').value.trim();
    const opd = document.getElementById('pegawaiOpd').value.trim();
    // jabatan can be empty based on html, but user said 'semua input wajib', let's enforce it
    const jabatan = document.getElementById('pegawaiJabatan').value.trim();
    const jenisAsn = document.getElementById('pegawaiJenisAsn').value.trim();
    const role = document.getElementById('pegawaiRole').value.trim();

    if (!nip || !nama || !nik || !opd || !jabatan || !jenisAsn || !role) {
        Swal.fire('Input Tidak Lengkap', 'Silakan lengkapi semua kolom wajib (NIP, Nama, NIK, OPD, Jabatan, Jenis ASN, Role).', 'warning');
        return;
    }
    submitPegawai(event);
}
`;

fs.appendFileSync('d:/public_html/bais-balad/src/Views/admin/js/admin.js', code);
fs.appendFileSync('d:/public_html/bais-balad/src/Views/admin/js/admin.min.js', code.replace(/\n/g, '').replace(/\s+/g, ' '));
console.log('Appended to files');
