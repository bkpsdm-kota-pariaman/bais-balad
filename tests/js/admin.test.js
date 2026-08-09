// Setup global mocks and DOM *before* requiring admin.js
global.bootstrap = {
  Modal: class {
    constructor() {}
    show() {}
    hide() {}
  }
};

document.body.innerHTML = `
  <div id="modalBuatKegiatan"></div>
  <div id="modalEditKegiatan"></div>
  <div id="modalQrCode"></div>
  <div id="modalVerifikasi"></div>
  <div id="modalRingkasan"></div>
  <div id="modalPegawai"></div>
  <div id="modalTambahPeserta"></div>
  <div id="modalOpd"></div>
`;

const { formatIndonesianDateTime, selectAllOpd, deselectAllOpd } = require('../../src/Views/admin/js/admin.js');

describe('Admin Panel Functions', () => {

  describe('formatIndonesianDateTime (Utility)', () => {
    it('should format ISO datetime string to Indonesian locale format correctly', () => {
      // Menggunakan contoh zona waktu UTC agar seragam, atau kita cek substring
      const isoString = '2025-08-17T08:30:00Z';
      
      const formatted = formatIndonesianDateTime(isoString);
      
      // Karena eksekusi jest bisa berada di zona waktu berbeda, 
      // kita setidaknya memastikan formatnya tidak "Invalid Date"
      expect(formatted).not.toBe('Invalid Date');
      expect(typeof formatted).toBe('string');
      // Format lokal Indonesia umumnya memuat tahun, dan kata hubung waktu, contoh: 17 Agustus 2025
      expect(formatted).toMatch(/2025/);
    });

    it('should handle invalid date string gracefully', () => {
      const formatted = formatIndonesianDateTime('not-a-date');
      // toLocaleString() pada Invalid Date mengembalikan "Invalid Date"
      expect(formatted).toBe('Invalid Date');
    });
  });



});
