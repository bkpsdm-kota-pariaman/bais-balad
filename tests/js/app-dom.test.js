const { switchView, toggleTipeKehadiran, batalAbsen } = require('../../src/Views/pwa/js/app.js');

describe('PWA DOM Functions', () => {

  beforeAll(() => {
    // Mock scrollTo to prevent JSDOM 'not implemented' error
    window.scrollTo = jest.fn();
  });

  describe('switchView', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div id="view-dashboard" class="view-section"></div>
        <div id="view-login" class="view-section hidden-view"></div>
        <div id="view-form" class="view-section hidden-view"></div>
      `;
    });

    it('should show the target view and hide others', () => {
      switchView('view-login');

      expect(document.getElementById('view-login').classList.contains('hidden-view')).toBe(false);
      expect(document.getElementById('view-dashboard').classList.contains('hidden-view')).toBe(true);
      expect(document.getElementById('view-form').classList.contains('hidden-view')).toBe(true);
    });

    it('should do nothing if target view does not exist', () => {
      // It won't crash, but it won't unhide anything because the target is missing
      switchView('view-unknown');
      expect(document.getElementById('view-dashboard').classList.contains('hidden-view')).toBe(true);
    });
  });

  describe('toggleTipeKehadiran', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <select id="tipeKehadiran">
          <option value="hadir" selected>Hadir</option>
          <option value="izin">Izin/Keterangan</option>
        </select>
        
        <div id="flowHadir"></div>
        <div id="flowIzin" class="hidden-view"></div>
        
        <input type="text" id="alasanIzin" value="">
        <input type="text" id="keteranganIzin" value="">
        <input type="file" id="buktiIzin">
        
        <button id="btnKirim"></button>
      `;
      // Mock File object properties if needed, but we start with empty files
    });

    it('should show flowHadir and hide flowIzin when hadir is selected', () => {
      const select = document.getElementById('tipeKehadiran');
      select.value = 'hadir';
      
      toggleTipeKehadiran();
      
      expect(document.getElementById('flowHadir').classList.contains('hidden-view')).toBe(false);
      expect(document.getElementById('flowIzin').classList.contains('hidden-view')).toBe(true);
      expect(document.getElementById('btnKirim').disabled).toBe(true); // Always disabled in hadir flow initially
    });

    it('should show flowIzin and hide flowHadir when izin is selected', () => {
      const select = document.getElementById('tipeKehadiran');
      select.value = 'izin';
      
      toggleTipeKehadiran();
      
      expect(document.getElementById('flowIzin').classList.contains('hidden-view')).toBe(false);
      expect(document.getElementById('flowHadir').classList.contains('hidden-view')).toBe(true);
      // btnKirim will be disabled because form is empty
      expect(document.getElementById('btnKirim').disabled).toBe(true);
    });
  });

});
