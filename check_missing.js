const fs = require('fs');
const content = fs.readFileSync('d:/public_html/bais-balad/src/Views/pwa/js/app.js', 'utf8');
const functions = [
  'adminCepatCekJadwal',
  'adminCepatMulaiPindai',
  'ambilFoto',
  'batalAbsen',
  'batalPilihMetode',
  'batalScan',
  'bukaAbsenkanPegawai',
  'bukaModalEditProfil',
  'bukaPilihMetode',
  'bukaScanner',
  'cekLokasiOtomatis',
  'checkIzinForm',
  'generateUserQrToken',
  'kembaliKeEditProfil',
  'kirimAbsensi',
  'lanjutTanpaLokasiValid',
  'logout',
  'pilihOpsiKehadiran',
  'prosesKodeManualDariPilihMetode',
  'prosesLogin',
  'refreshProfil',
  'sembunyikanTutorialManual',
  'simpanProfil',
  'tampilkanTutorialManual',
  'tutupModalEditProfil',
  'tutupModalUserQr',
  'ulangFoto'
];
const missing = [];
functions.forEach(fn => {
  const isFound = content.includes('function ' + fn) || content.includes(fn + ' = async') || content.includes(fn + ' = function') || content.includes('async function ' + fn) || content.includes(fn + '(') && !content.includes('.' + fn);
  // Actually, a robust check is looking for "function fn" or "fn = "
  const regex = new RegExp('(function\\\\s+' + fn + '\\\\b|\\\\b' + fn + '\\\\s*=)');
  if (!regex.test(content)) {
    missing.push(fn);
  }
});
console.log("MISSING:", missing);
