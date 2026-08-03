(()=>{var B="https://api-esdm.pariamankota.go.id/bais-balad",w=`${B}/api`;var m=null;var E=null,f,I,T,y,S,x;var H=new bootstrap.Modal(document.getElementById("modalBuatKegiatan")),D=new bootstrap.Modal(document.getElementById("modalEditKegiatan")),G=new bootstrap.Modal(document.getElementById("modalQrCode")),j=new bootstrap.Modal(document.getElementById("modalVerifikasi")),K=new bootstrap.Modal(document.getElementById("modalRingkasan")),R=new bootstrap.Modal(document.getElementById("modalPegawai")),N=new bootstrap.Modal(document.getElementById("modalTambahPeserta")),F=new bootstrap.Modal(document.getElementById("modalOpd"));function $(){localStorage.removeItem("admin_jwt_token"),window.location.reload()}document.addEventListener("DOMContentLoaded",()=>{localStorage.getItem("admin_jwt_token")&&(document.getElementById("loginOverlay").style.display="none",document.getElementById("dashboardContainer").classList.remove("d-none"),document.getElementById("navButtons").classList.remove("d-none"),_()),flatpickr("#newTanggal",{locale:"id",altInput:!0,altFormat:"j F Y",dateFormat:"Y-m-d"}),flatpickr("#editTanggal",{locale:"id",altInput:!0,altFormat:"j F Y",dateFormat:"Y-m-d"}),E=new TomSelect("#rekapFilterOpd",{create:!1}),document.getElementById("modalBuatKegiatan").addEventListener("shown.bs.modal",()=>h("add")),document.getElementById("modalEditKegiatan").addEventListener("shown.bs.modal",()=>h("edit")),document.getElementById("pegawaiSearchInput").addEventListener("keypress",function(a){a.key==="Enter"&&C()});let l=document.getElementById("modalQrCode");l.addEventListener("shown.bs.modal",()=>{let a=document.getElementById("qrcode"),i=a.dataset.qrText;i&&a&&setTimeout(()=>{a.innerHTML="";try{m=new QRCode(a,{text:i,width:256,height:256,colorDark:"#000000",colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.M})}catch(s){console.error("Error generating QR in modal event:",s),a.innerHTML='<div class="alert alert-danger">Gagal membuat QR Code. Kesalahan internal.</div>'}},50)}),l.addEventListener("hidden.bs.modal",()=>{let a=document.getElementById("qrcode");m&&m.clear(),a&&a.removeAttribute("data-qr-text"),m=null})});async function v(n,t={}){let l={Authorization:`Bearer ${localStorage.getItem("admin_jwt_token")}`,"Content-Type":"application/json",...t.headers},a=await fetch(n,{...t,headers:l});if(a.status===401)throw alert("Sesi Anda telah berakhir. Silakan login kembali."),$(),new Error("Unauthorized");return a.json()}async function _(){let n=document.getElementById("loading"),t=document.getElementById("dashboardContainer");n.classList.remove("d-none"),t.classList.add("d-none");try{let e=await v(`${w}/admin/jadwal?_=${new Date().getTime()}`);e.status?P(e.data):alert("Gagal memuat jadwal: "+e.message)}catch(e){console.error("Error loading jadwal:",e)}finally{n.classList.add("d-none"),t.classList.remove("d-none")}}function P(n){let t=document.getElementById("listKegiatanBody");if(t.innerHTML="",n.length===0){t.innerHTML='<tr><td colspan="5" class="text-center text-muted py-4">Belum ada jadwal kegiatan.</td></tr>';return}n.forEach((e,l)=>{let a="";e.aktifkan_antrian==="1"?a='<span class="badge bg-primary">Antrian: Aktif</span>':e.aktifkan_antrian==="0"&&(a='<span class="badge bg-secondary">Antrian: Non-Aktif</span>');let i="";e.kv_sync_status==1?i=`
                <div class="d-flex flex-column align-items-center gap-1">
                    <span class="badge bg-success"><i class="bi bi-check-circle-fill"></i> Sinkron</span>
                    <button class="btn btn-sm btn-outline-info mt-1" onclick="syncJadwalKv('${e.kode_akses}', '${e.judul.replace(/'/g,"\\'")}')" title="Sinkron Ulang Cache"><i class="bi bi-arrow-repeat"></i> Sinkron Ulang</button>
                </div>
            `:i=`
                <div class="d-flex flex-column align-items-center gap-1">
                    <span class="badge bg-warning text-dark"><i class="bi bi-exclamation-triangle-fill"></i> Belum Sinkron</span>
                    <button class="btn btn-sm btn-outline-primary mt-1" onclick="syncJadwalKv('${e.kode_akses}', '${e.judul.replace(/'/g,"\\'")}')" title="Sinkronkan Cache"><i class="bi bi-arrow-repeat"></i> Sinkronkan</button>
                </div>
            `;let s=`
            <tr>
                <td class="text-center">${l+1}</td>
                <td>
                    <strong class="d-block">${e.judul}</strong>
                    <small class="text-muted d-block">${new Date(e.tanggal).toLocaleDateString("id-ID",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</small>
                    ${a?`<div class="mt-1">${a}</div>`:""}
                </td>
                <td class="text-center"><span class="badge bg-info">${e.kategori}</span></td>
                <td>${e.jam_mulai} - ${e.jam_selesai} WIB</td>
                <td class="text-center">${i}</td>
                <td class="text-center" style="min-width: 160px;">
                    <div class="d-flex flex-column gap-2">
                        <button class="btn btn-primary btn-sm" onclick="lihatRekap('${e.kode_akses}')"><i class="bi bi-pie-chart-fill"></i> Lihat Rekap</button>
                        <div class="btn-group btn-group-sm w-100">
                            <button class="btn btn-outline-success" onclick="cetakQrCode('${e.kode_akses}', '${e.judul.replace(/'/g,"\\'")}', '${e.tanggal}', '${e.jam_mulai}', '${e.jam_selesai}')" title="Cetak QR Code"><i class="bi bi-qr-code"></i> QR</button>
                            <button class="btn btn-outline-warning" onclick="bukaModalEdit('${e.kode_akses}')" title="Edit Jadwal"><i class="bi bi-pencil-fill"></i> Edit</button>
                            <button class="btn btn-outline-danger" onclick="hapusKegiatan('${e.kode_akses}')" title="Hapus Jadwal"><i class="bi bi-trash-fill"></i> Hapus</button>
                        </div>
                    </div>
                </td>
            </tr>
        `;t.innerHTML+=s})}function h(n){let t=[-.6276,100.1209],e=n==="add",l=e?"mapGeofence":"editMapGeofence",a=e?"geoLatLang":"editGeoLatLang",i=e?"geoRadius":"editGeoRadius",s=e?f:y;if(s){s.invalidateSize();return}s=L.map(l).setView(t,13),L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(s);let u=t,g=document.getElementById(a),k=g.value;k&&(u=k.split(",").map(Number),s.setView(u,16));let o=L.marker(u,{draggable:!0}).addTo(s),d=L.circle(u,{radius:Number(document.getElementById(i).value)}).addTo(s);e?(f=s,T=o,I=d):(y=s,x=o,S=d),o.on("dragend",function(){let r=o.getLatLng();g.value=`${r.lat.toFixed(6)},${r.lng.toFixed(6)}`,d.setLatLng(r),s.panTo(r)}),document.getElementById(i).addEventListener("input",function(){d.setRadius(Number(this.value))}),g.addEventListener("input",function(){let r=this.value.trim();if(/^-?\d{1,3}(\.\d+)?\s*,\s*-?\d{1,3}(\.\d+)?$/.test(r)){let[p,b]=r.split(",").map(c=>parseFloat(c.trim()));if(p>=-90&&p<=90&&b>=-180&&b<=180){let c=[p,b];o.setLatLng(c),d.setLatLng(c),s.panTo(c)}}})}async function C(){let n=document.getElementById("pegawaiFilterOpd").value,t=document.getElementById("pegawaiFilterInstall").value,e=document.getElementById("pegawaiFilterSync").value,l=document.getElementById("pegawaiSearchInput").value,a=document.getElementById("pegawaiTableBody");a.innerHTML='<tr><td colspan="11" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm"></div> Memuat data pegawai...</td></tr>';try{let i=await v(`${w}/admin/pegawai?opd=${encodeURIComponent(n)}&search=${encodeURIComponent(l)}&install=${encodeURIComponent(t)}&sync=${encodeURIComponent(e)}`);i.status?M(i.data):a.innerHTML=`<tr><td colspan="11" class="text-center text-danger py-4">Gagal memuat data: ${i.message}</td></tr>`}catch(i){console.error("Error loading pegawai:",i),a.innerHTML='<tr><td colspan="11" class="text-center text-danger py-4">Terjadi kesalahan koneksi.</td></tr>'}}function A(n){if(!n)return"-";try{return new Date(n).toLocaleString("id-ID",{day:"2-digit",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}).replace(/\./g,":")}catch(t){return n}}function M(n){let t=document.getElementById("pegawaiTableBody");if(n.length===0){t.innerHTML='<tr><td colspan="11" class="text-center text-muted py-4">Tidak ada data pegawai yang ditemukan.</td></tr>';return}t.innerHTML=n.map((e,l)=>{let a=JSON.stringify(e).replace(/"/g,"&quot;"),i="";e.kv_sync_status==1?i=`
                <div class="d-flex flex-column align-items-center gap-1">
                    <span class="badge bg-success"><i class="bi bi-check-circle-fill"></i> Sinkron</span>
                    <button class="btn btn-sm btn-outline-info mt-1" onclick="syncPegawaiKv('${e.nip}', '${e.nama_pegawai.replace(/'/g,"\\'")}')" title="Sinkron Ulang Cache"><i class="bi bi-arrow-repeat"></i> Sinkron Ulang</button>
                </div>
            `:i=`
                <div class="d-flex flex-column align-items-center gap-1">
                    <span class="badge bg-warning text-dark"><i class="bi bi-exclamation-triangle-fill"></i> Belum Sinkron</span>
                    <button class="btn btn-sm btn-outline-primary mt-1" onclick="syncPegawaiKv('${e.nip}', '${e.nama_pegawai.replace(/'/g,"\\'")}')" title="Sinkronkan Cache"><i class="bi bi-arrow-repeat"></i> Sinkronkan</button>
                </div>
            `;let s=e.role==="Admin"?`<span class="badge bg-danger">${e.role}</span>`:`<span class="badge bg-secondary">${e.role}</span>`;return`
            <tr>
                <td class="text-center">${l+1}</td>
                <td>${e.nama_pegawai}</td>
                <td>${e.nip}</td>
                <td>${e.perangkat_daerah}</td>
                <td>${e.jabatan||"-"}</td>
                <td>${e.nik}</td>
                <td><span class="badge ${e.jenis_asn==="PNS"?"bg-primary":"bg-success"}">${e.jenis_asn}</span></td>
                <td>${s}</td>
                <td>${A(e.last_login)}</td>
                <td class="text-center">${i}</td>
                <td class="text-center">
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-warning" onclick='bukaModalEditPegawai(${a})' title="Edit Pegawai"><i class="bi bi-pencil-fill"></i></button>
                        <button class="btn btn-outline-danger" onclick="hapusPegawai('${e.nip}', '${e.nama_pegawai.replace(/'/g,"\\'")}')" title="Hapus Pegawai"><i class="bi bi-trash-fill"></i></button>
                    </div>
                </td>
            </tr>
        `}).join("")}})();
