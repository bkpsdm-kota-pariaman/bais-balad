const fs = require('fs');
let js = fs.readFileSync('d:/public_html/bais-balad/src/Views/admin/js/admin.js', 'utf8');

// 1. Add global variables
if (!js.includes('let currentJadwalData = [];')) {
    js = 'let currentJadwalData = [];\nlet currentPegawaiData = [];\nlet currentOpdData = [];\n' + js;
}

// 2. loadJadwal
js = js.replace('renderJadwalTable(result.data.data);', 'currentJadwalData = result.data.data;\n            renderJadwalTable(currentJadwalData);');

// 3. loadPegawai
js = js.replace('renderPegawaiTable(result.data.data);', 'currentPegawaiData = result.data.data;\n            renderPegawaiTable(currentPegawaiData);');

// 4. loadPegawai URL fix
js = js.replace(
    'const result = await fetchWithAuth(`${API_BASE_URL}/admin/pegawai?page=${paginasiState.page}&limit=${paginasiState.limit}`);',
    'const result = await fetchWithAuth(`${API_BASE_URL}/admin/pegawai?page=${paginasiState.page}&limit=${paginasiState.limit}&opd=${encodeURIComponent(opd === \'semua\' ? \'\' : opd)}&install=${installStatus}&sync=${syncStatus}&search=${encodeURIComponent(search)}`);'
);

// 5. loadOpd
js = js.replace('renderOpdTable(result.data);', 'currentOpdData = result.data;\n            renderOpdTable(currentOpdData);');

fs.writeFileSync('d:/public_html/bais-balad/src/Views/admin/js/admin.js', js);
fs.writeFileSync('d:/public_html/bais-balad/src/Views/admin/js/admin.min.js', js.replace(/\n/g, '').replace(/\s+/g, ' '));
console.log('Fixed currentData variables and pegawai URL params');
