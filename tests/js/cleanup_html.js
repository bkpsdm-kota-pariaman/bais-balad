const fs = require('fs');
let index = fs.readFileSync('d:/public_html/bais-balad/src/Views/admin/index.html', 'utf8');

// 1. Jadwal
index = index.replace('<button id="btnDownloadExcelJadwal" class="btn btn-outline-success fw-bold px-4 shadow-sm me-2 d-none" onclick="exportJadwalToExcel()"><i class="bi bi-file-earmark-excel-fill"></i> Download Excel</button>\n        ', '');

// 2. Pegawai
index = index.replace('<button id="btnDownloadExcelPegawai" class="btn btn-outline-success fw-bold px-4 shadow-sm me-2 d-none" onclick="exportPegawaiToExcel()"><i class="bi bi-file-earmark-excel-fill"></i> Download Excel</button>\n          ', '');

// 3. OPD (Keep but make visible always since OPD has no pagination container)
index = index.replace('<button id="btnDownloadExcelOpd" class="btn btn-outline-success fw-bold px-4 shadow-sm d-none" onclick="exportOpdToExcel()"><i class="bi bi-file-earmark-excel-fill"></i> Download Excel</button>', '<button id="btnDownloadExcelOpd" class="btn btn-outline-success fw-bold px-4 shadow-sm me-2" onclick="exportOpdToExcel()"><i class="bi bi-file-earmark-excel-fill"></i> Download Excel</button>');

// 4. Rekap Keseluruhan
index = index.replace('<button id="btnDownloadExcelKeseluruhan" class="btn btn-outline-success fw-bold d-none" onclick="exportRekapKeseluruhanToExcel()"><i class="bi bi-file-earmark-excel-fill"></i> Download Excel</button>', '');

// 5. Rekap
index = index.replace('<button id="btnDownloadExcel" class="btn btn-outline-success ms-2 fw-bold d-none" onclick="exportRekapToExcel()"><i class="bi bi-file-earmark-excel-fill"></i> Download Excel</button>', '');

// 6. Statistik
index = index.replace('<button id="btnDownloadExcelStatistik" class="btn btn-outline-success fw-bold d-none" onclick="exportStatistikToExcel()"><i class="bi bi-file-earmark-excel-fill"></i> Download Excel</button>', '');

fs.writeFileSync('d:/public_html/bais-balad/src/Views/admin/index.html', index);
console.log('HTML cleanup done');
