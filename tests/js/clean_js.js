const fs = require('fs');
let js = fs.readFileSync('d:/public_html/bais-balad/src/Views/admin/js/admin.js', 'utf8');

// Remove references to btnDownloadExcel (Rekap Kehadiran)
js = js.replace(/document\.getElementById\('btnDownloadExcel'\)\.classList\.add\('d-none'\);/g, '');
js = js.replace(/const btnDownload = document\.getElementById\('btnDownloadExcel'\);\n.*?\n.*?btnDownload\.classList\.add\('d-none'\);/s, '');
js = js.replace(/if \(result\.data\.length > 0\) \{\n.*?btnDownload\.classList\.remove\('d-none'\);\n.*?\}/s, '');
js = js.replace(/btnDownload\.classList\.remove\('d-none'\);/g, '');
js = js.replace(/btnDownload\.classList\.add\('d-none'\);/g, '');
js = js.replace(/const btnDownload = document\.getElementById\('btnDownloadExcel'\);/g, '');

// Remove references to btnDownloadExcelKeseluruhan
js = js.replace(/document\.getElementById\('btnDownloadExcelKeseluruhan'\)\.classList\.add\('d-none'\);/g, '');
js = js.replace(/const btnDownload = document\.getElementById\('btnDownloadExcelKeseluruhan'\);/g, '');

// Remove references to btnDownloadExcelStatistik
js = js.replace(/document\.getElementById\('btnDownloadExcelStatistik'\)\.classList\.add\('d-none'\);/g, '');
js = js.replace(/const btnDownload = document\.getElementById\('btnDownloadExcelStatistik'\);/g, '');

// Remove references to btnDownloadExcelJadwal
js = js.replace(/if \(currentJadwalData\.length > 0\) document\.getElementById\('btnDownloadExcelJadwal'\)\.classList\.remove\('d-none'\); else document\.getElementById\('btnDownloadExcelJadwal'\)\.classList\.add\('d-none'\);/g, '');

// Remove references to btnDownloadExcelPegawai
js = js.replace(/if \(currentPegawaiData\.length > 0\) document\.getElementById\('btnDownloadExcelPegawai'\)\.classList\.remove\('d-none'\); else document\.getElementById\('btnDownloadExcelPegawai'\)\.classList\.add\('d-none'\);/g, '');

// Wait, I used a slightly different replace for btnDownload definition in rekap, let's just do it directly.
// The safe way is to replace lines matching btnDownload with empty strings.
let lines = js.split('\n');
let newLines = [];
let skipNext = false;
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("getElementById('btnDownloadExcel')") || 
        line.includes("getElementById('btnDownloadExcelKeseluruhan')") || 
        line.includes("getElementById('btnDownloadExcelStatistik')") ||
        line.includes("btnDownload.classList.add") ||
        line.includes("btnDownload.classList.remove") ||
        line.includes("getElementById('btnDownloadExcelJadwal')") ||
        line.includes("getElementById('btnDownloadExcelPegawai')")
    ) {
        continue; // skip this line
    }
    
    // Also skip the block:
    // if (result.data.length > 0) {
    //     btnDownload.classList.remove('d-none');
    // }
    // Since we remove the middle line, we'll end up with empty if statements, which is fine, but better to remove.
    // Let's just leave empty if statements to be safe.
    newLines.push(line);
}

fs.writeFileSync('d:/public_html/bais-balad/src/Views/admin/js/admin.js', newLines.join('\n'));
fs.writeFileSync('d:/public_html/bais-balad/src/Views/admin/js/admin.min.js', newLines.join('\n').replace(/\n/g, '').replace(/\s+/g, ' '));
console.log('JS cleaned up');
