const fs = require('fs');
let js = fs.readFileSync('d:/public_html/bais-balad/src/Views/admin/js/admin.js', 'utf8');

const htmlTopReplacement = `
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
    }

    let htmlTop = \`
        <div class="d-flex flex-wrap gap-3 justify-content-between align-items-center bg-white py-2 px-3 border rounded shadow-sm mb-3">
            <div class="small text-muted mb-2 mb-md-0 d-flex align-items-center">
                <span>Total Data: <span class="fw-bold text-dark">\${totalRows}</span></span>
                \${exportBtnHtml}
            </div>
            <div class="d-flex flex-wrap align-items-center gap-2">
                <span class="small text-muted">Tampilkan</span>
                <select class="form-select form-select-sm" style="width: auto;" onchange="gantiPage('\${onPageChangeName}', 1, this.value)">
                    <option value="10" \${limit == 10 ? 'selected' : ''}>10</option>
                    <option value="25" \${limit == 25 ? 'selected' : ''}>25</option>
                    <option value="50" \${limit == 50 ? 'selected' : ''}>50</option>
                    <option value="100" \${limit == 100 ? 'selected' : ''}>100</option>
                    <option value="999999" \${limit == 999999 ? 'selected' : ''}>Semua Data</option>
                </select>
                <span class="small text-muted">baris</span>
            </div>
        </div>
    \`;
`;

// Find existing htmlTop string definition and replace it
const startIndex = js.indexOf('    let htmlTop = `');
const endIndex = js.indexOf('    `;', startIndex) + 6;

if (startIndex !== -1 && endIndex !== -1) {
    js = js.substring(0, startIndex) + htmlTopReplacement + js.substring(endIndex);
    fs.writeFileSync('d:/public_html/bais-balad/src/Views/admin/js/admin.js', js);
    fs.writeFileSync('d:/public_html/bais-balad/src/Views/admin/js/admin.min.js', js.replace(/\n/g, '').replace(/\s+/g, ' '));
    console.log('admin.js updated with exportBtnHtml in pagination controls.');
} else {
    console.log('Error: htmlTop definition not found in admin.js');
}
