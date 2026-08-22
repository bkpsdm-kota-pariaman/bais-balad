-- phpMyAdmin SQL Dump
-- version 5.2.3
-- https://www.phpmyadmin.net/
--
-- Host: 103.167.25.37
-- Waktu pembuatan: 03 Agu 2026 pada 08.03
-- Versi server: 10.3.39-MariaDB
-- Versi PHP: 7.2.34

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Basis data: `esdamparkotagopar`
--

-- --------------------------------------------------------

--
-- Struktur dari tabel `app_absensi_data_absensi`
--

CREATE TABLE `app_absensi_data_absensi` (
  `id` int(11) NOT NULL,
  `waktu` datetime DEFAULT NULL,
  `kode_akses` varchar(50) DEFAULT NULL,
  `nip` char(18) DEFAULT NULL,
  `nama_pegawai` varchar(150) DEFAULT NULL,
  `jabatan` varchar(255) DEFAULT NULL,
  `opd` varchar(255) DEFAULT NULL,
  `lokasi` text DEFAULT NULL,
  `lat` decimal(10,8) DEFAULT NULL,
  `lng` decimal(11,8) DEFAULT NULL,
  `nama_file_foto` varchar(255) DEFAULT NULL,
  `kategori` varchar(100) DEFAULT NULL,
  `keterangan` text DEFAULT NULL,
  `status_verifikasi` varchar(100) DEFAULT NULL COMMENT 'Terverifikasi Oleh Sistem, Admin dan Ditolak Oleh Admin',
  `status_kehadiran` varchar(100) DEFAULT NULL COMMENT 'Hadir, Alpa, Dinas Luar Daerah, Dinas Dalam Daerah, Cuti, Sakit, Izin Atasan, Kegiatan lain dengan SPT, Lainnya'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Struktur dari tabel `app_absensi_data_admin`
--

CREATE TABLE `app_absensi_data_admin` (
  `username` char(18) NOT NULL,
  `password` char(16) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Struktur dari tabel `app_absensi_data_pegawai`
--

CREATE TABLE `app_absensi_data_pegawai` (
  `nama_pegawai` varchar(150) NOT NULL,
  `nip` char(18) NOT NULL,
  `perangkat_daerah` varchar(255) NOT NULL,
  `jabatan` varchar(255) DEFAULT NULL,
  `nik` char(16) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `jenis_asn` varchar(4) DEFAULT NULL,
  `role` varchar(255) NOT NULL DEFAULT 'asn' COMMENT 'Comma-separated roles: asn,admin,super admin',
  `last_login` datetime DEFAULT NULL,
  `kv_sync_status` tinyint(1) NOT NULL DEFAULT 0 COMMENT '1=Synced, 0=Stale/Needs Sync',
  `updated_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Struktur dari tabel `app_absensi_jadwal_kegiatan`
--

CREATE TABLE `app_absensi_jadwal_kegiatan` (
  `timestamp` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `kode_akses` varchar(50) NOT NULL,
  `judul` varchar(255) NOT NULL,
  `kategori` varchar(100) DEFAULT NULL,
  `tanggal` date DEFAULT NULL,
  `jam_mulai` time DEFAULT NULL,
  `jam_selesai` time DEFAULT NULL,
  `koordinat` varchar(255) DEFAULT NULL,
  `radius_meter` int(11) DEFAULT 100,
  `aktifkan_antrian` tinyint(4) NOT NULL DEFAULT 0,
  `kv_sync_status` tinyint(4) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Struktur dari tabel `app_absensi_kegiatan_target_opd`
--

CREATE TABLE `app_absensi_kegiatan_target_opd` (
  `kode_akses` varchar(10) NOT NULL,
  `nama_opd` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Indeks untuk tabel yang dibuang
--

--
-- Indeks untuk tabel `app_absensi_data_absensi`
--
ALTER TABLE `app_absensi_data_absensi`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_absen` (`kode_akses`,`nip`),
  ADD KEY `idx_nip` (`nip`),
  ADD KEY `idx_nama_pegawai` (`nama_pegawai`),
  ADD KEY `idx_jabatan` (`jabatan`),
  ADD KEY `idx_opd` (`opd`),
  ADD KEY `idx_lat` (`lat`),
  ADD KEY `idx_lng` (`lng`),
  ADD KEY `idx_nama_file_foto` (`nama_file_foto`),
  ADD KEY `idx_kategori` (`kategori`),
  ADD KEY `idx_kode_akses` (`kode_akses`),
  ADD KEY `idx_kode_akses_nip` (`kode_akses`,`nip`);

--
-- Indeks untuk tabel `app_absensi_data_pegawai`
--
ALTER TABLE `app_absensi_data_pegawai`
  ADD PRIMARY KEY (`nip`),
  ADD KEY `idx_nama_pegawai` (`nama_pegawai`),
  ADD KEY `idx_nik` (`nik`),
  ADD KEY `idx_jenis_asn` (`jenis_asn`);

--
-- Indeks untuk tabel `app_absensi_jadwal_kegiatan`
--
ALTER TABLE `app_absensi_jadwal_kegiatan`
  ADD KEY `idx_kode_akses` (`kode_akses`);

--
-- Indeks untuk tabel `app_absensi_kegiatan_target_opd`
--
ALTER TABLE `app_absensi_kegiatan_target_opd`
  ADD KEY `idx_kode_akses` (`kode_akses`),
  ADD KEY `idx_nama_opd` (`nama_opd`);

--
-- AUTO_INCREMENT untuk tabel yang dibuang
--

--
-- AUTO_INCREMENT untuk tabel `app_absensi_data_absensi`
--
ALTER TABLE `app_absensi_data_absensi`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;

CREATE TABLE `app_absensi_log_absensi` (
  `id_log_absensi` INT NOT NULL AUTO_INCREMENT,
  `kode_akses` VARCHAR(255) NOT NULL,
  `nip` VARCHAR(50) NOT NULL,
  `nama` VARCHAR(255) NOT NULL DEFAULT '-',
  `jenis_aksi` ENUM('tambah','edit','hapus') NOT NULL,
  `nip_pelaku` VARCHAR(50) NOT NULL,
  `nama_pelaku` VARCHAR(255) NOT NULL,
  `ip_address` VARCHAR(45) DEFAULT NULL,
  `user_agent` VARCHAR(255) DEFAULT NULL,
  `waktu_aksi` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `data` TEXT NOT NULL,
  PRIMARY KEY (`id_log_absensi`),
  KEY `idx_nama_pelaku` (`nama_pelaku`),
  KEY `idx_nama` (`nama`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE app_absensi_jadwal_kegiatan ADD COLUMN is_strict_location TINYINT(1) DEFAULT 0;
ALTER TABLE app_absensi_jadwal_kegiatan ADD COLUMN is_strict_time TINYINT(1) DEFAULT 0;
