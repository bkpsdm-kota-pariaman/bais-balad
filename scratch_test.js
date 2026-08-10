const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="rekapPerOpdContainerModal"></div>');
global.document = dom.window.document;

// Mock external dependencies if needed
global.Swal = { fire: () => {} };
global.XLSX = {};
global.bootstrap = { Modal: class { constructor() {} show() {} hide() {} } };

const code = fs.readFileSync('src/Views/admin/js/admin.js', 'utf8');
try {
    eval(code);
    renderRekapSummary({ 
        summary: { total_target: 10, statuses: { 'Hadir': 5, 'Belum Absen': 5 } }, 
        per_opd_summary: [{ opd_name: 'OPD 1', target: 5, statuses: { 'Hadir': 2, 'Belum Absen': 3 } }] 
    }, 'rekapPerOpdContainerModal');
    console.log("SUCCESS");
} catch (e) {
    console.error("ERROR CAUGHT:");
    console.error(e);
}
