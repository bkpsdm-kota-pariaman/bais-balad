const fs = require('fs');

let index = fs.readFileSync('d:/public_html/bais-balad/src/Views/admin/index.html', 'utf8');

// 1. Data Kegiatan (Jadwal)
index = index.replace(
    '<button class="btn btn-danger fw-bold px-4 shadow-sm" onclick="bukaModalBuatKegiatan()"><i',
    '<button id="btnDownloadExcelJadwal" class="btn btn-outline-success fw-bold px-4 shadow-sm me-2 d-none" onclick="exportJadwalToExcel()"><i class="bi bi-file-earmark-excel-fill"></i> Download Excel</button>\n        <button class="btn btn-danger fw-bold px-4 shadow-sm" onclick="bukaModalBuatKegiatan()"><i'
);

// 2. Data Pegawai
index = index.replace(
    '<button class="btn btn-danger fw-bold px-4 shadow-sm" onclick="bukaModalTambahPegawai()"><i',
    '<button id="btnDownloadExcelPegawai" class="btn btn-outline-success fw-bold px-4 shadow-sm me-2 d-none" onclick="exportPegawaiToExcel()"><i class="bi bi-file-earmark-excel-fill"></i> Download Excel</button>\n          <button class="btn btn-danger fw-bold px-4 shadow-sm" onclick="bukaModalTambahPegawai()"><i'
);

// 3. Data OPD
index = index.replace(
    '<button class="btn btn-info text-white fw-bold px-4 shadow-sm" onclick="syncOpdList()"><i',
    '<button id="btnDownloadExcelOpd" class="btn btn-outline-success fw-bold px-4 shadow-sm d-none" onclick="exportOpdToExcel()"><i class="bi bi-file-earmark-excel-fill"></i> Download Excel</button>\n            <button class="btn btn-info text-white fw-bold px-4 shadow-sm" onclick="syncOpdList()"><i'
);

// 4. Rekap Keseluruhan
index = index.replace(
    '<button id="btnDownloadExcelKeseluruhan" class="btn btn-outline-danger d-none"\n            onclick="exportRekapKeseluruhanToExcel()"><i class="bi bi-file-earmark-excel-fill"></i> Download\n            Excel</button>',
    '<button id="btnDownloadExcelKeseluruhan" class="btn btn-outline-success fw-bold d-none" onclick="exportRekapKeseluruhanToExcel()"><i class="bi bi-file-earmark-excel-fill"></i> Download Excel</button>'
);

// 5. Rekap Kehadiran (per kegiatan)
index = index.replace(
    '<button id="btnDownloadExcel" class="btn btn-outline-danger ms-2 fw-bold" onclick="exportRekapToExcel()"><i\n                class="bi bi-file-earmark-excel-fill"></i> Download Excel</button>',
    '<button id="btnDownloadExcel" class="btn btn-outline-success ms-2 fw-bold d-none" onclick="exportRekapToExcel()"><i class="bi bi-file-earmark-excel-fill"></i> Download Excel</button>'
);

// 6. Statistik Kehadiran
index = index.replace(
    '<button id="btnDownloadExcelStatistik" class="btn btn-outline-danger d-none"\n          onclick="exportStatistikToExcel()"><i class="bi bi-file-earmark-excel"></i> Export Excel</button>',
    '<button id="btnDownloadExcelStatistik" class="btn btn-outline-success fw-bold d-none" onclick="exportStatistikToExcel()"><i class="bi bi-file-earmark-excel-fill"></i> Download Excel</button>'
);

fs.writeFileSync('d:/public_html/bais-balad/src/Views/admin/index.html', index);
console.log('HTML updated');
