/**
 * Cloudflare Worker untuk Antrian (Queue) dan Cache Login ASN
 *
 * Worker ini memiliki beberapa fungsi utama:
 * 1. Login Handler (dengan KV Cache): Mencegat request login. Jika data ada di cache (Cache HIT),
 *    langsung memberikan token JWT. Jika tidak ada (Cache MISS), worker akan mengembalikan
 *    error 404 agar PWA bisa mencoba login ke server utama (fallback).
 * 2. Cache Invalidation Handler: Menerima sinyal dari server PHP untuk menghapus cache pegawai di KV.
 * 3. Absen Submit Handler (Producer): Menerima request absensi dari PWA, memasukkannya ke
 *    dalam antrian (Queue), dan memberikan respon sukses ke pengguna.
 * 4. Queue Handler (Consumer): Mengambil data dari antrian dan mengirimkannya ke server PHP.
 *
 * Pastikan Anda sudah mengatur route di Cloudflare Dashboard agar request ke
 * /api/absen/submit diarahkan ke Worker ini.
 */

import { jwtVerify, SignJWT } from 'jose';
import bcrypt from 'bcryptjs';

// Definisikan header CORS di satu tempat agar mudah dikelola.
// Ini mengizinkan semua origin ('*'), yang cukup untuk pengembangan.
const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

// Helper untuk mengubah data URI (base64) menjadi Blob, agar bisa dikirim sebagai file.
function dataURItoBlob(dataURI) {
	const byteString = atob(dataURI.split(',')[1]);
	const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
	const ab = new ArrayBuffer(byteString.length);
	const ia = new Uint8Array(ab);
	for (let i = 0; i < byteString.length; i++) {
		ia[i] = byteString.charCodeAt(i);
	}
	return new Blob([ab], { type: mimeString });
}

function haversineDistance(lat1, lon1, lat2, lon2) {
	if (!lat1 || !lon1 || !lat2 || !lon2) return 999999;
	const R = 6371e3; // metres
	const p1 = lat1 * Math.PI / 180;
	const p2 = lat2 * Math.PI / 180;
	const dp = (lat2 - lat1) * Math.PI / 180;
	const dl = (lon2 - lon1) * Math.PI / 180;

	const a = Math.sin(dp / 2) * Math.sin(dp / 2) +
		Math.cos(p1) * Math.cos(p2) *
		Math.sin(dl / 2) * Math.sin(dl / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

	return R * c; // in metres
}

export default {
	/**
	 * Fetch handler: Berperan sebagai PRODUCER untuk queue.
	 * Menerima request absensi awal dari perangkat pengguna.
	 * @param {Request} request
	 * @param {object} env
	 * @param {ExecutionContext} ctx
	 * @returns {Response}
	 */
	async fetch(request, env, ctx) {
		// --- PENANGANAN CORS PREFLIGHT REQUEST (Berlaku untuk semua rute) ---
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				status: 204,
				headers: corsHeaders,
			});
		}

		const url = new URL(request.url);
		const pathname = url.pathname;

		// Helper validasi jadwal
		const validateJadwalAbsen = async (kodeAkses, payload) => {
			if (!kodeAkses || !env.JADWAL_KV) return null;
			const cachedJadwal = await env.JADWAL_KV.get(`jadwal:${kodeAkses}`, 'json');
			if (!cachedJadwal) return null;

			const now = new Date();
			const todayYMD = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
			if (cachedJadwal.tanggal !== todayYMD) {
				return { error: true, code: 403, message: "Gagal: Jadwal ini tidak berlaku untuk hari ini." };
			}

			const startTime = new Date(`${cachedJadwal.tanggal}T${cachedJadwal.jam_mulai}+07:00`);
			if (now < startTime) {
				return { error: true, code: 403, message: `Gagal: Absensi belum dibuka. Silakan tunggu hingga pukul ${cachedJadwal.jam_mulai} WIB.` };
			}

			const status = (payload.status_kehadiran || "hadir").toLowerCase();
			let isTerlambat = false;
			let isLuarRadius = false;

			const endTime = new Date(`${cachedJadwal.tanggal}T${cachedJadwal.jam_selesai}+07:00`);
			if (now > endTime) {
				isTerlambat = true;
			}

			if (cachedJadwal.koordinat && cachedJadwal.koordinat !== "-") {
				const parts = cachedJadwal.koordinat.replace(/'/g, '').split(',');
				if (parts.length === 2) {
					const tLat = parseFloat(parts[0]);
					const tLng = parseFloat(parts[1]);
					const pLat = parseFloat(payload.lat);
					const pLng = parseFloat(payload.lng);
					const radius = parseFloat(cachedJadwal.radius_meter) || 0;

					const jarak = haversineDistance(pLat, pLng, tLat, tLng);
					if (jarak > radius) {
						isLuarRadius = true;
					}
				}
			}

			// Jika pegawai mencoba Hadir murni (bukan Izin/Sakit/Cuti)
			if (status === "hadir") {
				// Validasi Strict Time
				if (cachedJadwal.is_strict_time && cachedJadwal.is_strict_time == 1 && isTerlambat) {
					return { error: true, code: 403, message: "Gagal: Waktu Berakhir. Anda hanya bisa mengirim Izin/Keterangan karena Aturan Waktu Berlaku aktif." };
				}

				// Validasi Strict Location
				if (cachedJadwal.is_strict_location && cachedJadwal.is_strict_location == 1 && isLuarRadius) {
					return { error: true, code: 403, message: `Gagal: Anda di luar lokasi. Anda hanya bisa mengirim Izin/Keterangan karena Aturan Wajib Sesuai Lokasi aktif.` };
				}
			}

			// Jika pegawai terlambat, di luar lokasi, atau tidak hadir (izin dll)
			if (status !== "hadir" || isTerlambat || isLuarRadius) {
				if (payload.status_verifikasi !== "Terverifikasi Oleh Admin") {
					payload.status_verifikasi = "Menunggu Verifikasi Admin";
				}
			}

			return null;
		};

		// =================================================================
		// RUTE LOGIN ASN (DENGAN KV CACHE)
		// =================================================================
		if (pathname.endsWith('/api/login-asn')) {

			if (request.method !== 'POST') {
				return new Response(JSON.stringify({ status: false, code: 405, message: 'Metode request yang diharapkan adalah POST' }), { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}

			// Validasi environment variables yang dibutuhkan untuk rute ini
			if (!env.PEGAWAI_KV || !env.JWT_SECRET || !env.ORIGIN_API_URL || !env.WORKER_SECRET) {
				console.error("Konfigurasi worker tidak lengkap. 'PEGAWAI_KV', 'JWT_SECRET', 'ORIGIN_API_URL', 'WORKER_SECRET' harus diatur.");
				return new Response(JSON.stringify({ status: false, code: 500, message: 'Konfigurasi server worker tidak lengkap.' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}

			try {
				// Clone request SEBELUM membaca body. Ini penting untuk menghindari error "stream disturbed".
				const requestClone = request.clone();
				const { nip, nik } = await request.json(); // Body dibaca di sini.
				if (!nip || !nik) {
					return new Response(JSON.stringify({ status: false, code: 400, message: 'NIP dan NIK wajib diisi' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
				}

				const kvKey = `pegawai:${nip}`;
				const cachedPegawai = await env.PEGAWAI_KV.get(kvKey, 'json');

				// --- CACHE HIT ---
				if (cachedPegawai) {
					// Pengecekan bcrypt NIK secara sinkron (karena bcryptjs mendukung di edge)
					if (bcrypt.compareSync(nik, cachedPegawai.nik)) {
						console.log(`[Login Cache] Cache HIT for NIP: ${nip}`);
						const secret = new TextEncoder().encode(env.JWT_SECRET);
						const issuedAt = Math.floor(Date.now() / 1000);
						const expirationTime = issuedAt + 3600 * 24 * 30; // 30 hari

						const payload = {
							data: {
								nip: cachedPegawai.nip,
								nama: cachedPegawai.nama_pegawai,
								opd: cachedPegawai.perangkat_daerah,
								jabatan: cachedPegawai.jabatan,
								role: cachedPegawai.role || ['asn'],
								jenis_asn: cachedPegawai.jenis_asn
							},
						};

						const jwtToken = await new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt(issuedAt).setExpirationTime(expirationTime).setIssuer('bais-balad-apps').sign(secret);

						const responseData = { token: jwtToken, user: { nama: cachedPegawai.nama_pegawai, jabatan: cachedPegawai.jabatan, opd: cachedPegawai.perangkat_daerah } };

						return new Response(JSON.stringify({ status: true, code: 200, message: 'Login Berhasil (dari Cache)', data: responseData }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
					} else {
						// NIK tidak cocok. Jangan hapus cache, cukup perlakukan sebagai cache miss.
						console.log(`[Login Cache] NIK mismatch for NIP: ${nip}. Treating as Cache MISS.`);
						// Tidak ada 'delete' di sini. Biarkan PWA melakukan fallback ke server utama.
						// Lanjutkan ke logika CACHE MISS di bawah.
					}
				}

				// --- CACHE MISS atau NIK mismatch setelah cache invalidation ---
				console.log(`[Login Cache] Cache MISS or NIK mismatch for NIP: ${nip}. Returning 404 to PWA.`);
				// Explicitly return 404 to signal PWA to try origin
				return new Response(JSON.stringify({ status: false, code: 404, message: 'Data login tidak ditemukan di cache. Mencoba ke server utama.' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

			} catch (error) {
				// Log error yang lebih detail untuk debugging di dashboard Cloudflare
				console.error('Error di login handler worker:', error.message, error.stack);
				return new Response(JSON.stringify({ status: false, code: 500, message: 'Server worker error: Gagal memproses login.' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}
		}

		// =================================================================
		// RUTE GET JADWAL BY KODE (DIPANGGIL OLEH PWA UNTUK INPUT MANUAL)
		// Pola: GET /api/jadwal-by-kode/:kode_akses
		// =================================================================
		const jadwalByKodeMatch = pathname.match(/^\/api\/jadwal-by-kode\/([a-zA-Z0-9_.-]+)\/?$/);
		if (jadwalByKodeMatch && request.method === 'GET') {
			// Validasi environment variables yang dibutuhkan
			if (!env.JADWAL_KV) {
				console.error("Konfigurasi worker tidak lengkap. 'JADWAL_KV' harus diatur.");
				return new Response(JSON.stringify({ status: false, message: 'Konfigurasi server worker tidak lengkap.' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}

			const kodeAkses = jadwalByKodeMatch[1];
			const kvKey = `jadwal:${kodeAkses}`;
			const cachedJadwal = await env.JADWAL_KV.get(kvKey, 'json');

			// --- CACHE HIT ---
			if (cachedJadwal) {
				// Validasi tanggal di sisi worker untuk memberikan feedback cepat.
				// 'sv-SE' locale menghasilkan format YYYY-MM-DD.
				const todayYMD = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });

				if (cachedJadwal.tanggal !== todayYMD) {
					// Jadwal tidak berlaku hari ini. Kembalikan error yang akan ditampilkan di PWA, BUKAN 404.
					// Status 200 dengan `status: false` akan mencegah PWA melakukan fallback yang tidak perlu.
					return new Response(JSON.stringify({ status: false, message: 'Jadwal ini tidak berlaku untuk hari ini.' }), {
						status: 200,
						headers: {
							'Content-Type': 'application/json', ...corsHeaders,
							'Cache-Control': 'no-store' // Jangan cache respons error ini
						}
					});
				}

				// --- LOGIKA BARU: Validasi Waktu Mulai ---
				// Cek apakah waktu saat ini sudah melewati jam mulai.
				const now = new Date(); // Waktu saat ini di UTC
				// Buat objek Date untuk waktu mulai dengan menentukan timezone Asia/Jakarta (UTC+7)
				// Format: YYYY-MM-DDTHH:mm:ss+07:00
				const startTime = new Date(`${cachedJadwal.tanggal}T${cachedJadwal.jam_mulai}+07:00`);

				if (now < startTime) {
					// Jika waktu saat ini belum mencapai waktu mulai, kembalikan error.
					// Status 200 dengan status:false untuk mencegah PWA melakukan fallback.
					return new Response(JSON.stringify({ status: false, message: `Absensi untuk kegiatan ini belum dibuka. Silakan coba lagi pada atau setelah pukul ${cachedJadwal.jam_mulai} WIB.` }), {
						status: 200,
						headers: {
							'Content-Type': 'application/json', ...corsHeaders,
							'Cache-Control': 'no-store' // Jangan cache respons error ini
						}
					});
				}

				// Jadwal valid, kembalikan data.
				return new Response(JSON.stringify({ status: true, message: 'Jadwal ditemukan di cache.', data: cachedJadwal }), {
					status: 200,
					headers: {
						'Content-Type': 'application/json',
						...corsHeaders,
						'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
					},
				});
			}
			// --- CACHE MISS ---
			else {
				// Jadwal tidak ditemukan di cache. Kembalikan 404 untuk memicu fallback di PWA.
				return new Response(JSON.stringify({ status: false, message: 'Jadwal tidak ditemukan.' }), {
					status: 404,
					headers: { 'Content-Type': 'application/json', ...corsHeaders, 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' },
				});
			}
		}

		// =================================================================
		// RUTE OPD LIST (DIPANGGIL OLEH PWA)
		// =================================================================
		if (pathname.endsWith('/api/opd/list')) {
			// Validasi environment variables yang dibutuhkan
			if (!env.OPD_KV) {
				console.error("Konfigurasi worker tidak lengkap. 'OPD_KV' harus diatur.");
				return new Response(JSON.stringify({ status: false, message: 'Konfigurasi server worker tidak lengkap.' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}

			const cachedOpdList = await env.OPD_KV.get('opd_list', 'json');

			if (cachedOpdList) {
				console.log('[OPD Cache] Cache HIT for opd_list.');
				return new Response(JSON.stringify({ status: true, message: 'Daftar OPD dari cache.', data: cachedOpdList }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			} else {
				console.log('[OPD Cache] Cache MISS for opd_list. Returning 404 to PWA.');
				return new Response(JSON.stringify({ status: false, message: 'Daftar OPD tidak ditemukan di cache.' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}
		}

		// =================================================================
		// RUTE SINKRONISASI OPD LIST (DIPANGGIL OLEH ADMIN PANEL VIA PHP)
		// =================================================================
		if (pathname.endsWith('/api/opd-list/sync') && request.method === 'PUT') {
			if (!env.OPD_KV || !env.WORKER_SECRET) {
				return new Response(JSON.stringify({ status: false, message: 'Konfigurasi worker tidak lengkap (OPD_KV, WORKER_SECRET).' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}
			if (request.headers.get('X-Worker-Secret') !== env.WORKER_SECRET) {
				return new Response(JSON.stringify({ status: false, message: 'Akses ditolak.' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}
			const opdList = await request.json();
			await env.OPD_KV.put('opd_list', JSON.stringify(opdList));
			return new Response(JSON.stringify({ status: true, message: 'Daftar OPD berhasil disinkronkan ke KV.' }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
		}

		// =================================================================
		// RUTE CRUD JADWAL (DIPANGGIL OLEH ADMIN PANEL VIA PHP)
		// Pola: /api/jadwal/:kode_akses?
		// =================================================================
		const jadwalMatch = pathname.match(/^\/api\/jadwal\/?([a-zA-Z0-9_.-]+)?\/?$/);
		if (jadwalMatch) {
			// Validasi environment variables yang dibutuhkan untuk rute ini
			if (!env.JADWAL_KV || !env.WORKER_SECRET) {
				console.error("Konfigurasi worker tidak lengkap. 'JADWAL_KV' dan 'WORKER_SECRET' harus diatur.");
				return new Response(JSON.stringify({ status: false, message: 'Konfigurasi server worker tidak lengkap.' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}

			// Validasi secret dari server PHP
			const requestSecret = request.headers.get('X-Worker-Secret');
			if (requestSecret !== env.WORKER_SECRET) {
				return new Response(JSON.stringify({ status: false, message: 'Akses ditolak. Invalid secret.' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}

			const kodeAkses = jadwalMatch[1]; // Bisa undefined jika path-nya hanya /api/jadwal

			// --- CREATE / UPDATE JADWAL (POST atau PUT) ---
			if (request.method === 'POST' || request.method === 'PUT') {
				try {
					const jadwalData = await request.json();
					const effectiveKodeAkses = kodeAkses || jadwalData.kode_akses;
					if (!effectiveKodeAkses) {
						return new Response(JSON.stringify({ status: false, message: 'Kode akses tidak ditemukan di URL atau payload.' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
					}
					const kvKey = `jadwal:${effectiveKodeAkses}`;
					// Lakukan operasi put secara blocking (await) untuk memastikan data benar-benar tersimpan.
					await env.JADWAL_KV.put(kvKey, JSON.stringify(jadwalData));
					return new Response(JSON.stringify({ status: true, message: `Jadwal ${effectiveKodeAkses} berhasil disimpan/diperbarui di cache.` }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
				} catch (e) {
					console.error(`[KV JADWAL PUT Error] Gagal menyimpan jadwal:`, e);
					const status = e instanceof SyntaxError ? 400 : 503;
					const message = status === 400 ? `Gagal memproses request: ${e.message}` : `Gagal menyimpan data jadwal ke KV. Error: ${e.message}`;
					return new Response(JSON.stringify({ status: false, message: message }), { status: status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
				}
			}

			// --- DELETE JADWAL ---
			if (request.method === 'DELETE' && kodeAkses) {
				try {
					const kvKey = `jadwal:${kodeAkses}`;
					await env.JADWAL_KV.delete(kvKey);
					return new Response(JSON.stringify({ status: true, message: `Jadwal ${kodeAkses} berhasil dihapus dari cache.` }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
				} catch (e) {
					console.error(`[KV JADWAL DELETE Error] Gagal menghapus jadwal ${kodeAkses}:`, e);
					return new Response(JSON.stringify({ status: false, message: `Gagal menghapus data jadwal dari KV. Error: ${e.message}` }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
				}
			}

			return new Response(JSON.stringify({ status: false, message: 'Metode tidak valid untuk rute /api/jadwal.' }), { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
		}

		// =================================================================
		// RUTE BARU: REFRESH TOKEN (DIPANGGIL OLEH PWA)
		// =================================================================
		if (pathname.endsWith('/api/profil/refresh-token')) {
			if (request.method !== 'POST') {
				return new Response(JSON.stringify({ status: false, message: 'Metode request yang diharapkan adalah POST' }), { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}

			// 1. Validasi token JWT dari PWA
			const authHeader = request.headers.get('Authorization');
			if (!authHeader || !authHeader.startsWith('Bearer ')) {
				return new Response(JSON.stringify({ status: false, message: "Header otorisasi tidak ada atau format salah." }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}
			const token = authHeader.substring(7);
			const secret = new TextEncoder().encode(env.JWT_SECRET);
			let decodedToken;
			try {
				const { payload } = await jwtVerify(token, secret, { issuer: 'bais-balad-apps' });
				decodedToken = payload;
			} catch (err) {
				return new Response(JSON.stringify({ status: false, message: "Token tidak valid atau telah kedaluwarsa." }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}

			try {
				const nip = decodedToken.data.nip;
				const kvKey = `pegawai:${nip}`;
				const profilKv = await env.PEGAWAI_KV.get(kvKey, 'json');

				// 2. Jika data ada di cache (Cache HIT)
				if (profilKv) {
					console.log(`[Profil Refresh Token] Cache HIT untuk NIP ${nip}. Membuat token baru.`);

					const issuedAt = Math.floor(Date.now() / 1000);
					const expirationTime = issuedAt + 3600 * 24 * 30; // 30 hari
					const payload = {
						data: {
							nip: profilKv.nip,
							nama: profilKv.nama_pegawai,
							opd: profilKv.perangkat_daerah,
							jabatan: profilKv.jabatan,
							role: profilKv.role || ['asn'],
							jenis_asn: profilKv.jenis_asn
						},
					};
					const newJwt = await new SignJWT(payload)
						.setProtectedHeader({ alg: 'HS256' })
						.setIssuedAt(issuedAt)
						.setExpirationTime(expirationTime)
						.setIssuer('bais-balad-apps')
						.sign(secret);

					const responseData = {
						token: newJwt,
					};

					return new Response(JSON.stringify({
						status: true, message: 'Token berhasil diperbarui dari cache.',
						data: responseData
					}), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
				}

				// 3. Jika data tidak ada di cache (Cache MISS), panggil server PHP
				console.log(`[Profil Refresh Token] Cache MISS untuk NIP ${nip}. Memanggil PHP.`);
				const phpResponse = await fetch(`${env.ORIGIN_API_URL}/profil/refresh-token`, {
					method: 'POST',
					headers: { 'Authorization': `Bearer ${token}` },
				});

				const phpResult = await phpResponse.json();

				// Kembalikan hasil dari PHP
				return new Response(JSON.stringify(phpResult), { status: phpResponse.status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

			} catch (error) {
				console.error('Error di worker /api/profil/refresh-token:', error.message, error.stack);
				return new Response(JSON.stringify({ status: false, message: 'Server worker error: Gagal memperbarui token.' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}
		}

		// =================================================================
		// RUTE SINKRONISASI PROFIL (DIPANGGIL OLEH PWA)
		// Sesuai permintaan: PWA "menarik" data terbaru dari cache. Worker akan:
		// 1. Mengambil data dari KV.
		// 2. Jika ada, buat token baru dan kirim kembali.
		// 3. Jika tidak ada (cache miss), fallback ke server PHP, simpan ke KV, lalu kirim kembali.
		// =================================================================
		if (pathname.endsWith('/api/profil/sync')) {
			if (request.method !== 'POST') {
				return new Response(JSON.stringify({ status: false, message: 'Metode request yang diharapkan adalah POST' }), { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}

			// 1. Validasi token JWT dari PWA
			const authHeader = request.headers.get('Authorization');
			if (!authHeader || !authHeader.startsWith('Bearer ')) {
				return new Response(JSON.stringify({ status: false, message: "Header otorisasi tidak ada atau format salah." }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}
			const token = authHeader.substring(7);
			const secret = new TextEncoder().encode(env.JWT_SECRET);
			let decodedToken;
			try {
				const { payload } = await jwtVerify(token, secret, { issuer: 'bais-balad-apps' });
				decodedToken = payload;
			} catch (err) {
				console.error(`[Profil Refresh Token] Gagal validasi token: ${err.message}`);
				return new Response(JSON.stringify({ status: false, message: "Token tidak valid atau telah kedaluwarsa." }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}

			try {
				const nip = decodedToken.data.nip;
				const kvKey = `pegawai:${nip}`;
				const profilKv = await env.PEGAWAI_KV.get(kvKey, 'json');

				// 2. Jika data ada di cache (Cache HIT)
				if (profilKv) {
					console.log(`[Profil Sync] Cache HIT untuk NIP ${nip}. Membuat token baru dari data KV.`);

					// Buat token baru dari data KV
					const issuedAt = Math.floor(Date.now() / 1000);
					const expirationTime = issuedAt + 3600 * 24 * 30; // 30 hari
					const payload = {
						data: {
							nip: profilKv.nip,
							nama: profilKv.nama_pegawai,
							opd: profilKv.perangkat_daerah,
							jabatan: profilKv.jabatan,
							role: profilKv.role || ['asn'],
							jenis_asn: profilKv.jenis_asn
						},
					};
					const newJwt = await new SignJWT(payload)
						.setProtectedHeader({ alg: 'HS256' })
						.setIssuedAt(issuedAt)
						.setExpirationTime(expirationTime)
						.setIssuer('bais-balad-apps')
						.sign(secret);

					const responseData = {
						token: newJwt,
						user: {
							nama: profilKv.nama_pegawai,
							jabatan: profilKv.jabatan,
							opd: profilKv.perangkat_daerah
						}
					};

					return new Response(JSON.stringify({
						status: true, message: 'Profil berhasil disinkronkan dari cache.',
						data: responseData
					}), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
				}

				// 3. Jika data tidak ada di cache (Cache MISS), panggil server PHP
				console.log(`[Profil Sync] Cache MISS untuk NIP ${nip}. Memanggil PHP untuk sinkronisasi.`);
				const cacheBuster = `?v=${Date.now()}`;
				const phpResponse = await fetch(`${env.ORIGIN_API_URL}/profil/refresh${cacheBuster}`, {
					method: 'GET',
					headers: { 'Authorization': `Bearer ${token}` },
				});

				const phpResult = await phpResponse.json();

				// 4. Jika panggilan PHP berhasil dan ada data untuk di-cache, lakukan update KV
				if (phpResponse.ok && phpResult.status && phpResult.data.pegawai_to_cache) {
					ctx.waitUntil(env.PEGAWAI_KV.put(kvKey, JSON.stringify(phpResult.data.pegawai_to_cache)));
					delete phpResult.data.pegawai_to_cache; // Hapus dari respons ke PWA
				}

				return new Response(JSON.stringify(phpResult), { status: phpResponse.status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			} catch (error) {
				console.error('Error di worker /api/profil/sync:', error.message, error.stack);
				return new Response(JSON.stringify({ status: false, message: 'Server worker error: Gagal memproses sinkronisasi profil.' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}
		}

		// =================================================================
		// RUTE BARU: GENERATE TEMPORARY TOKEN (DIPANGGIL OLEH PWA)
		// =================================================================
		if (pathname.endsWith('/api/token/generate-temporary')) {
			if (request.method !== 'POST') {
				return new Response(JSON.stringify({ status: false, code: 405, message: "Metode request yang diharapkan adalah POST" }), { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}

			// Validasi environment variables
			if (!env.JWT_SECRET) {
				console.error("Secret 'JWT_SECRET' belum diatur di Cloudflare.");
				return new Response(JSON.stringify({ status: false, code: 500, message: "Konfigurasi server worker tidak lengkap." }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}

			// Validasi token dari PWA
			const authHeader = request.headers.get('Authorization');
			if (!authHeader || !authHeader.startsWith('Bearer ')) {
				return new Response(JSON.stringify({ status: false, code: 401, message: "Header otorisasi tidak ada atau format salah." }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}

			const token = authHeader.substring(7);
			const secret = new TextEncoder().encode(env.JWT_SECRET);
			let decodedToken;

			try {
				const { payload } = await jwtVerify(token, secret, { issuer: 'bais-balad-apps' });
				decodedToken = payload;
			} catch (err) {
				return new Response(JSON.stringify({ status: false, code: 401, message: "Token tidak valid atau telah kedaluwarsa." }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}

			try {
				// Buat JWT baru dengan masa berlaku singkat
				const issuedAt = Math.floor(Date.now() / 1000);
				const expirationTime = issuedAt + 180; // Berlaku 3 menit (180 detik)
				const pegawaiData = decodedToken.data;

				const tempPayload = {
					data: {
						nip: pegawaiData.nip,
						nama: pegawaiData.nama,
						opd: pegawaiData.opd,
						jabatan: pegawaiData.jabatan,
						role: pegawaiData.role || ['asn'],
						jenis_asn: pegawaiData.jenis_asn
					}
				};

				const tempJwt = await new SignJWT(tempPayload).setProtectedHeader({ alg: 'HS256' }).setExpirationTime(expirationTime).sign(secret);
				const prefixedToken = "BB:" + tempJwt;

				return new Response(JSON.stringify({
					status: true, code: 200, message: "Token sementara berhasil dibuat via worker",
					data: { token: prefixedToken }
				}), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

			} catch (error) {
				console.error('Error di worker /api/token/generate-temporary:', error.message, error.stack);
				return new Response(JSON.stringify({ status: false, message: 'Server worker error: Gagal membuat token sementara.' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}
		}

		// =================================================================
		// RUTE CRUD PEGAWAI (DIPANGGIL OLEH ADMIN PANEL VIA PHP)
		// Pola: /api/pegawai/:nip
		// =================================================================
		const pegawaiMatch = pathname.match(/^\/api\/pegawai\/(\d{18})$/);
		if (pegawaiMatch) {
			// Validasi environment variables
			if (!env.PEGAWAI_KV || !env.WORKER_SECRET) {
				console.error("CRUD Pegawai Error: PEGAWAI_KV or WORKER_SECRET not configured.");
				return new Response('Konfigurasi worker tidak lengkap.', { status: 500, headers: corsHeaders });
			}

			// Validasi secret dari server PHP
			const requestSecret = request.headers.get('X-Worker-Secret');
			if (requestSecret !== env.WORKER_SECRET) {
				return new Response('Akses ditolak. Invalid secret.', { status: 403, headers: corsHeaders });
			}

			const nip = pegawaiMatch[1];
			const kvKey = `pegawai:${nip}`;

			// --- CREATE / UPDATE PEGAWAI (PUT) ---
			if (request.method === 'PUT') {
				try {
					const pegawaiData = await request.json();
					// Lakukan operasi put secara blocking (await) untuk memastikan data benar-benar tersimpan.
					// Jangan gunakan ctx.waitUntil() karena kita butuh konfirmasi sukses/gagal. Hapus TTL agar data permanen.
					await env.PEGAWAI_KV.put(kvKey, JSON.stringify(pegawaiData));
					return new Response(JSON.stringify({ status: true, message: `Cache untuk NIP ${nip} berhasil disimpan/diperbarui.` }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
				} catch (e) {
					console.error(`[KV PEGAWAI PUT Error] Gagal menyimpan NIP ${nip}:`, e);
					const status = e instanceof SyntaxError ? 400 : 503;
					const message = status === 400 ? `Gagal memproses request: ${e.message}` : `Gagal menyimpan data ke KV. Error: ${e.message}`;
					return new Response(JSON.stringify({ status: false, message: message }), { status: status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
				}
			}

			// --- DELETE PEGAWAI (DELETE) ---
			if (request.method === 'DELETE') {
				try {
					await env.PEGAWAI_KV.delete(kvKey);
					return new Response(JSON.stringify({ status: true, message: `Cache untuk NIP ${nip} berhasil dihapus.` }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
				} catch (e) {
					console.error(`[KV PEGAWAI DELETE Error] Gagal menghapus NIP ${nip}:`, e);
					return new Response(JSON.stringify({ status: false, message: `Gagal menghapus data dari KV. Error: ${e.message}` }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
				}
			}

			return new Response(JSON.stringify({ status: false, message: 'Metode tidak valid untuk rute /api/pegawai.' }), { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
		}

		// =================================================================
		// RUTE BULK UPDATE PEGAWAI (DIPANGGIL OLEH SKRIP CLI)
		// Pola: POST /api/pegawai/bulk
		// =================================================================
		if (pathname.endsWith('/api/pegawai/bulk')) {
			// Validasi environment variables
			if (!env.PEGAWAI_KV || !env.WORKER_SECRET) {
				console.error("Bulk Update Pegawai Error: PEGAWAI_KV or WORKER_SECRET not configured.");
				return new Response('Konfigurasi worker tidak lengkap.', { status: 500, headers: corsHeaders });
			}

			// Validasi secret dari server PHP
			const requestSecret = request.headers.get('X-Worker-Secret');
			if (requestSecret !== env.WORKER_SECRET) {
				return new Response('Akses ditolak. Invalid secret.', { status: 403, headers: corsHeaders });
			}

			// Hanya izinkan metode POST
			if (request.method !== 'POST') {
				return new Response(JSON.stringify({ status: false, message: 'Metode tidak valid untuk rute /api/pegawai/bulk. Gunakan POST.' }), { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}

			try {
				const pegawaiList = await request.json();
				if (!Array.isArray(pegawaiList)) {
					return new Response(JSON.stringify({ status: false, message: 'Payload harus berupa array data pegawai.' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
				}

				// Lakukan operasi put secara blocking (await) untuk memastikan data benar-benar tersimpan.
				const bulkPutPromises =
					pegawaiList
						.filter(p => p && p.nip) // Abaikan item yang tidak valid
						.map(pegawaiData => {
							const kvKey = `pegawai:${pegawaiData.nip}`;
							// Simpan secara permanen (tanpa TTL)
							return env.PEGAWAI_KV.put(kvKey, JSON.stringify(pegawaiData));
						});

				await Promise.all(bulkPutPromises);

				return new Response(JSON.stringify({ status: true, message: `${pegawaiList.length} data pegawai berhasil disinkronkan.` }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			} catch (e) {
				console.error(`[KV PEGAWAI BULK PUT Error] Gagal menyimpan batch:`, e);
				return new Response(JSON.stringify({ status: false, message: `Gagal menyimpan sebagian atau semua data ke KV. Error: ${e.message}` }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}
		}

		// =================================================================
		// RUTE 2: ENDPOINT UNTUK MENGUJI KONEKSI KV
		// =================================================================
		if (pathname.endsWith('/api/test-kv')) {
			// Pastikan binding PEGAWAI_KV sudah ada
			if (!env.PEGAWAI_KV) {
				return new Response("KV Namespace 'PEGAWAI_KV' tidak terkonfigurasi.", { status: 500 });
			}

			// Metode POST: untuk menulis data ke KV
			if (request.method === 'POST') {
				try {
					const { key, value } = await request.json();
					// Simpan data ke KV. `put` tidak mengembalikan nilai.
					// Kita gunakan ctx.waitUntil agar proses penyimpanan tidak memblokir response.
					ctx.waitUntil(env.PEGAWAI_KV.put(key, JSON.stringify(value)));
					return new Response(`OK. Data untuk kunci '${key}' sedang disimpan.`, { headers: corsHeaders });
				} catch (e) {
					return new Response(`Gagal memproses request: ${e.message}`, { status: 400, headers: corsHeaders });
				}
			}

			// Metode GET: untuk membaca data dari KV
			if (request.method === 'GET') {
				const key = url.searchParams.get('key');
				if (!key) {
					return new Response("Parameter 'key' dibutuhkan.", { status: 400, headers: corsHeaders });
				}
				// Ambil data dari KV. Parameter kedua 'json' akan otomatis mem-parsing hasilnya.
				const value = await env.PEGAWAI_KV.get(key, 'json');
				if (value) {
					return new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
				} else {
					return new Response(JSON.stringify({ message: `Data untuk kunci '${key}' tidak ditemukan.` }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
				}
			}

			return new Response('Metode tidak diizinkan untuk /api/test-kv. Gunakan GET atau POST.', { status: 405, headers: corsHeaders });
		}

		// =================================================================
		// RUTE BARU: SUBMIT ABSENSI CEPAT (PRODUSER QUEUE)
		// =================================================================
		if (pathname.endsWith('/api/absen-cepat/submit')) {
			if (request.method !== 'POST') {
				return new Response(JSON.stringify({ status: false, code: 405, message: "Metode request yang diharapkan adalah POST" }), { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}

			// Validasi token admin dari header
			if (!env.JWT_SECRET) {
				console.error("Secret 'JWT_SECRET' belum diatur di Cloudflare.");
				return new Response(JSON.stringify({ status: false, code: 500, message: "Konfigurasi server worker tidak lengkap." }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}

			const authHeader = request.headers.get('Authorization');
			if (!authHeader || !authHeader.startsWith('Bearer ')) {
				return new Response(JSON.stringify({ status: false, code: 401, message: "Header otorisasi admin tidak ada atau format salah." }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}

			const adminToken = authHeader.substring(7);
			const secret = new TextEncoder().encode(env.JWT_SECRET);
			let decodedPayload;

			try {
				// Verifikasi token admin
				const { payload } = await jwtVerify(adminToken, secret, { issuer: 'bais-balad-apps' });
				decodedPayload = payload;
			} catch (err) {
				return new Response(JSON.stringify({ status: false, code: 401, message: "Token admin tidak valid atau telah kedaluwarsa." }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}

			// Otorisasi: Pastikan pengguna yang melakukan request memiliki peran 'admin' atau 'super admin'
			const userRoles = Array.isArray(decodedPayload?.data?.role) ? decodedPayload.data.role : (decodedPayload?.data?.role ? [decodedPayload.data.role] : []);
			const hasAdminRole = userRoles.some(r => ['admin', 'super admin'].includes(String(r).trim().toLowerCase()));
			if (!hasAdminRole) {
				return new Response(JSON.stringify({ status: false, code: 403, message: "Akses ditolak. Hanya admin atau super admin yang dapat menggunakan fitur ini." }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}

			try {
				// Ambil payload dari body, yang berisi data absensi dan token user
				const payload = await request.json();
				const userToken = payload.user_token;

				if (!userToken) {
					return new Response(JSON.stringify({ status: false, code: 400, message: "Token pegawai yang diabsenkan tidak ada dalam request body." }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
				}

				// Validasi aturan ketat (waktu dan lokasi)
				const validationError = await validateJadwalAbsen(payload.kode_akses, payload);
				if (validationError) {
					return new Response(JSON.stringify({ status: false, code: validationError.code, message: validationError.message }), { status: validationError.code, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
				}

				// Hapus user_token dari payload utama agar tidak terkirim ke PHP jika ada fallback
				delete payload.user_token;

				// Buat payload untuk antrian, gunakan token user dari body
				const queuePayload = { ...payload, jwt_token: userToken, submittedAt: new Date().toISOString() };
				await env.MY_QUEUE.send(queuePayload);

				return new Response(JSON.stringify({ status: true, code: 202, message: "Absensi Cepat telah diterima dan akan segera diproses." }), { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 202 });
			} catch (error) {
				console.error('Error di fetch handler (producer absen-cepat) worker:', error);
				return new Response(JSON.stringify({ status: false, code: 500, message: "Server worker error: Gagal memproses permintaan Absensi Cepat Anda." }), { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 });
			}
		}

		// =================================================================
		// RUTE 4: SUBMIT ABSENSI (PRODUSER QUEUE) - Logika yang sudah ada
		// =================================================================
		if (pathname.endsWith('/api/absen/submit')) {
			if (request.method !== 'POST') {
				return new Response(JSON.stringify({ status: false, code: 405, message: "Metode request yang diharapkan adalah POST" }), { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}

			if (!env.JWT_SECRET) {
				console.error("Secret 'JWT_SECRET' belum diatur di Cloudflare.");
				return new Response(JSON.stringify({ status: false, code: 500, message: "Konfigurasi server worker tidak lengkap." }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}

			const authHeader = request.headers.get('Authorization');
			if (!authHeader || !authHeader.startsWith('Bearer ')) {
				return new Response(JSON.stringify({ status: false, code: 401, message: "Header otorisasi tidak ada atau format salah." }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}

			const token = authHeader.substring(7);
			const secret = new TextEncoder().encode(env.JWT_SECRET);

			try {
				await jwtVerify(token, secret, { issuer: 'bais-balad-apps' });
			} catch (err) {
				return new Response(JSON.stringify({ status: false, code: 401, message: "Token tidak valid atau telah kedaluwarsa." }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
			}

			try {
				const payload = await request.json();

				// Validasi jadwal (waktu mulai, strict time, strict location)
				const validationError = await validateJadwalAbsen(payload.kode_akses, payload);
				if (validationError) {
					return new Response(JSON.stringify({ status: false, code: validationError.code, message: validationError.message }), { status: validationError.code, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
				}

				const queuePayload = { ...payload, jwt_token: token, submittedAt: new Date().toISOString() };
				await env.MY_QUEUE.send(queuePayload);

				const responsePayload = {
					status: true,
					code: 202,
					message: "Absensi Anda telah diterima dan akan segera diproses.",
					data: { waktu: new Date().toISOString() },
				};
				return new Response(JSON.stringify(responsePayload), { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 202 });
			} catch (error) {
				console.error('Error di fetch handler (producer) worker:', error);
				const errorPayload = { status: false, code: 500, message: "Server worker error: Gagal memproses permintaan Anda." };
				return new Response(JSON.stringify(errorPayload), { headers: { 'Content-Type': 'application/json', ...corsHeaders }, status: 500 });
			}
		}

		// Fallback untuk rute yang tidak dikenal
		return new Response(JSON.stringify({ status: false, code: 404, message: 'Endpoint tidak ditemukan di worker.' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json', ...corsHeaders },
		});
	},

	/**
	 * Queue handler: Berperan sebagai CONSUMER.
	 * Menerima pesan dari antrian dan meneruskannya ke server PHP origin.
	 * @param {MessageBatch} batch
	 * @param {object} env
	 * @param {ExecutionContext} ctx
	 */
	async queue(batch, env) {
		// 1. Validasi environment variables untuk mode bulk
		if (!env.ORIGIN_API_BULK_URL || !env.WORKER_SECRET) {
			console.error("Secrets 'ORIGIN_API_BULK_URL' and 'WORKER_SECRET' must be set for bulk processing.");
			// Coba lagi semua pesan di batch ini nanti, berharap konfigurasi sudah diperbaiki.
			batch.retryAll({ delaySeconds: 300 }); // Coba lagi setelah 5 menit
			return;
		}

		// 2. Kumpulkan semua pesan dari batch untuk dikirim sekaligus.
		const messagesToSend = batch.messages.map(msg => ({
			id: msg.id,
			body: msg.body
		}));

		if (messagesToSend.length === 0) {
			console.log("[Queue Consumer] Batch kosong, tidak ada yang diproses.");
			return;
		}

		console.log(`[Queue Consumer] Memproses batch berisi ${messagesToSend.length} pesan.`);

		try {
			// 3. Kirim seluruh batch sebagai satu request POST.
			const response = await fetch(env.ORIGIN_API_BULK_URL, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Worker-Secret': env.WORKER_SECRET
				},
				body: JSON.stringify(messagesToSend),
				signal: AbortSignal.timeout(60000) // Timeout lebih lama (60 detik) untuk proses bulk
			});

			// 4. Tangani response dari endpoint bulk.
			if (response.ok) {
				// HTTP 200-299: Sukses. Pesan akan otomatis dihapus dari antrian.
				const responseData = await response.json();
				console.log(`[Queue Consumer] Batch SUKSES. Respon server:`, responseData.message);
				// LOGIKA BARU: Tambahkan logging untuk error yang dilaporkan oleh PHP
				if (responseData.errors && responseData.errors.length > 0) {
					console.error(`[Queue Consumer] Detail kegagalan dari server PHP:`, JSON.stringify(responseData.errors, null, 2));
				}
			} else {
				// HTTP 4xx atau 5xx: Gagal. Seluruh batch akan dicoba lagi.
				const errorText = await response.text();
				console.error(`[Queue Consumer] Batch GAGAL. Server merespon dengan status ${response.status}: ${errorText}. Data yang gagal: ${JSON.stringify(messagesToSend)}. Mencoba ulang seluruh batch...`);
				batch.retryAll({ delaySeconds: 120 }); // Coba lagi setelah 2 menit
			}

		} catch (error) {
			// Error jaringan atau exception lain saat fetch.
			console.error(`[Queue Consumer] Error jaringan saat memproses batch:`, error, `Data yang gagal: ${JSON.stringify(messagesToSend)}`);
			// Coba lagi seluruh batch.
			batch.retryAll();
		}
	},
};