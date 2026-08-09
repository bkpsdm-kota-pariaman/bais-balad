const fs = require('fs');
const path = require('path');

const appJsPath = path.join(__dirname, '../src/Views/pwa/js/app.js');
const swJsPath = path.join(__dirname, '../src/Views/pwa/sw.js');

// 1. Baca isi saat ini untuk mencari versi terakhir
let appJsContent = fs.readFileSync(appJsPath, 'utf8');

// Cari versi di const APP_VERSION = 'v6.1.0'; atau 'v1786096288655'
let currentVersionMatch = appJsContent.match(/const APP_VERSION = 'v?([0-9\.]+)';/);
let newVersion = 'v6.1.1'; // Default jika tidak ditemukan

if (currentVersionMatch && currentVersionMatch[1]) {
    let versionStr = currentVersionMatch[1];
    
    // Jika versi sebelumnya adalah format panjang (timestamp), ubah ke format semver dasar
    if (versionStr.length > 10) {
        newVersion = 'v6.1.1';
    } else {
        // Asumsikan format adalah X.Y.Z
        let parts = versionStr.split('.');
        if (parts.length === 3) {
            let patch = parseInt(parts[2], 10);
            parts[2] = patch + 1;
            newVersion = 'v' + parts.join('.');
        } else {
            // Jika tidak cocok dengan X.Y.Z, tambahkan .1
            newVersion = 'v' + versionStr + '.1';
        }
    }
}

// Update app.js
appJsContent = appJsContent.replace(/const APP_VERSION = '.*?';/, `const APP_VERSION = '${newVersion}';`);
fs.writeFileSync(appJsPath, appJsContent);
console.log(`[PWA Builder] Diperbarui app.js ke versi: ${newVersion}`);

// Update sw.js
let swJsContent = fs.readFileSync(swJsPath, 'utf8');
swJsContent = swJsContent.replace(/const CACHE_NAME = '.*?';/, `const CACHE_NAME = 'eabsen-${newVersion}';`);
fs.writeFileSync(swJsPath, swJsContent);
console.log(`[PWA Builder] Diperbarui sw.js ke versi: eabsen-${newVersion}`);
