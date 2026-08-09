const { getDistanceInMeters, parseJwt } = require('../../src/Views/pwa/js/app.js');

describe('PWA Core Utility Functions', () => {

  describe('getDistanceInMeters', () => {
    it('should calculate distance between two identical points as 0', () => {
      const lat = -0.613329;
      const lng = 100.120723;
      const distance = getDistanceInMeters(lat, lng, lat, lng);
      expect(distance).toBe(0);
    });

    it('should calculate distance correctly between two close points', () => {
      // Titik A: Kantor (misal)
      const lat1 = -0.613329;
      const lng1 = 100.120723;
      
      // Titik B: Bergeser sedikit (sekitar ~111 meter untuk 0.001 derajat)
      const lat2 = -0.612329; 
      const lng2 = 100.120723;
      
      const distance = getDistanceInMeters(lat1, lng1, lat2, lng2);
      expect(distance).toBeGreaterThan(100);
      expect(distance).toBeLessThan(120);
    });
  });

  describe('parseJwt', () => {
    it('should correctly decode a well-formed JWT payload', () => {
      // Struktur JWT: header.payload.signature
      // Payload base64: {"data":{"nip":"123456789","nama":"Test ASN"}} -> eyJkYXRhIjp7Im5pcCI6IjEyMzQ1Njc4OSIsIm5hbWEiOiJUZXN0IEFTTiJ9fQ==
      const fakeJwt = "header.eyJkYXRhIjp7Im5pcCI6IjEyMzQ1Njc4OSIsIm5hbWEiOiJUZXN0IEFTTiJ9fQ.signature";
      
      const decoded = parseJwt(fakeJwt);
      expect(decoded).not.toBeNull();
      expect(decoded.nip).toBe("123456789");
      expect(decoded.nama).toBe("Test ASN");
    });

    it('should return null for malformed JWT', () => {
      const malformedJwt = "just.random.string";
      const decoded = parseJwt(malformedJwt);
      expect(decoded).toBeNull();
    });

    it('should return null for empty string or null input', () => {
      expect(parseJwt("")).toBeNull();
      expect(parseJwt(null)).toBeNull();
    });
  });

});
