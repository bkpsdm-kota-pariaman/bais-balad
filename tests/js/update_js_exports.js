const fs = require('fs');
let js = fs.readFileSync('d:/public_html/bais-balad/src/Views/admin/js/admin.js', 'utf8');

const exportHelper = `
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
    const fileName = \`\${fileNamePrefix}_\${new Date().toISOString().split('T')[0]}.xlsx\`;
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
`;

// Remove existing export functions
js = js.replace(/async function exportRekapToExcel\(\) \{[\s\S]*?\}\n/, '');
js = js.replace(/function exportRekapKeseluruhanToExcel\(\) \{[\s\S]*?\}\n/, '');
js = js.replace(/function exportStatistikToExcel\(\) \{[\s\S]*?\}\n/, '');

// Also add visibility logic in places that render the table
// Jadwal
js = js.replace(
    'renderJadwalTable(currentJadwalData);',
    'renderJadwalTable(currentJadwalData);\n            if (currentJadwalData.length > 0) document.getElementById(\'btnDownloadExcelJadwal\').classList.remove(\'d-none\'); else document.getElementById(\'btnDownloadExcelJadwal\').classList.add(\'d-none\');'
);
// Pegawai
js = js.replace(
    'renderPegawaiTable(currentPegawaiData);',
    'renderPegawaiTable(currentPegawaiData);\n            if (currentPegawaiData.length > 0) document.getElementById(\'btnDownloadExcelPegawai\').classList.remove(\'d-none\'); else document.getElementById(\'btnDownloadExcelPegawai\').classList.add(\'d-none\');'
);
// OPD
js = js.replace(
    'renderOpdTable(currentOpdData);',
    'renderOpdTable(currentOpdData);\n            if (currentOpdData.length > 0) document.getElementById(\'btnDownloadExcelOpd\').classList.remove(\'d-none\'); else document.getElementById(\'btnDownloadExcelOpd\').classList.add(\'d-none\');'
);

js += exportHelper;

fs.writeFileSync('d:/public_html/bais-balad/src/Views/admin/js/admin.js', js);
fs.writeFileSync('d:/public_html/bais-balad/src/Views/admin/js/admin.min.js', js.replace(/\n/g, '').replace(/\s+/g, ' '));

console.log('JS updated and minified');
