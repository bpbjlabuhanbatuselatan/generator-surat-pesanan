export async function openProcurementPrint(db, id) {
  const [s, items, providers, refs, docs, officials] = await Promise.all([
    db.from('surat').select('*').eq('id', id).single(),
    db.from('detail_barang').select('*').eq('surat_id', id).order('nomor_urut'),
    db.from('penyedia').select('*').eq('surat_id', id).order('created_at'),
    db.from('referensi_harga').select('*').eq('surat_id', id).order('created_at'),
    db.from('dokumen_pendukung').select('*').eq('surat_id', id).order('nomor_urut'),
    db.from('surat_pejabat').select('*').eq('surat_id', id).order('created_at')
  ]);
  const error = [s, items, providers, refs, docs, officials].find(x => x.error);
  if (error) throw error.error;
  const d = s.data, goods = items.data || [], vendors = providers.data || [], prices = refs.data || [], files = docs.data || [], signers = officials.data || [];
  for (const signer of signers) {
    if (signer.tanda_tangan_path_snapshot) {
      const signed = await db.storage.from('tanda-tangan').createSignedUrl(signer.tanda_tangan_path_snapshot, 300);
      signer.signature_url = signed.data?.signedUrl || '';
    }
  }
  const signatureBlock = role => {
    const p = signers.find(x => x.peran === role);
    if (!p) return '<div>'+role+'<div class="blank"></div><b>(................................)</b></div>';
    return '<div>'+esc(p.jabatan || p.peran)+'<div class="blank">'+(p.signature_url?'<img src="'+p.signature_url+'" style="max-width:145px;max-height:65px;object-fit:contain">':'')+'</div><b>'+esc(p.nama)+'</b><br>NIP. '+esc(p.nip)+'</div>';
  };
  const esc = v => String(v ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rp = v => v == null || v === '' ? '—' : new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(v));
  const rows = goods.map((x,i) => '<tr><td>'+(i+1)+'</td><td>'+esc(x.nama_barang)+'</td><td>'+esc(x.spesifikasi)+'</td><td>'+esc(x.volume)+'</td><td>'+esc(x.satuan)+'</td><td>'+rp(x.harga_satuan)+'</td><td>'+rp(Number(x.volume)*Number(x.harga_satuan))+'</td></tr>').join('');
  const priceRows = goods.map((x,i) => {
    const list = prices.filter(p => p.detail_barang_id === x.id);
    return '<tr><td>'+(i+1)+'</td><td>'+esc(x.nama_barang)+'</td><td>'+rp(x.harga_satuan)+'</td><td>'+list.map(p=>esc(p.sumber_referensi)+' '+rp(p.harga)).join('<br>')+'</td><td>'+list.map(p=>rp(p.harga_katalog)).join('<br>')+'</td><td>'+ (list.some(p=>p.sesuai_spesifikasi)?'Sesuai':'—')+'</td><td>'+ (list.some(p=>p.produk_dalam_negeri)?'PDN':'—')+'</td></tr>';
  }).join('');
  const vendorRows = vendors.map((v,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(v.nama_penyedia)+'</td><td>'+esc(v.nama_penanggung_jawab)+'</td><td>'+esc(v.alamat)+'</td><td>'+esc(v.nib)+'</td><td>'+esc(v.status_umkm)+'</td></tr>').join('');
  const fileRows = files.map((f,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(f.nama_file)+'</td><td>'+esc(f.kategori)+'</td><td>'+esc(f.mime_type)+'</td></tr>').join('');
  const meta = [['Program',d.program],['Kegiatan',d.kegiatan],['Sub Kegiatan',d.subkegiatan],['Kode Rekening',d.kode_rekening],['Uraian Belanja',d.uraian_belanja],['Nilai Pagu',rp(d.nilai_pagu)],['Nilai HPS',rp(d.nilai_hps)],['Waktu Pengadaan',d.waktu_pengadaan],['Kualifikasi Penyedia',d.kualifikasi_penyedia],['Kode RUP',d.kode_rup]].map(x=>'<tr><th>'+esc(x[0])+'</th><td>'+esc(x[1])+'</td></tr>').join('');
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>Dokumen '+esc(d.nama_paket)+'</title><style>@page{size:A4;margin:18mm}body{font:11pt Arial;color:#111;line-height:1.45}h1,h2{text-align:center}h1{font-size:16pt}h2{font-size:13pt}h3{font-size:12pt;margin-top:20px}table{width:100%;border-collapse:collapse;font-size:9pt;margin:10px 0 18px}td,th{border:1px solid #555;padding:6px;vertical-align:top}th{background:#eee}.head{text-align:center;border-bottom:2px solid #111;padding-bottom:10px}.page{page-break-after:always}.page:last-child{page-break-after:auto}.sign{display:flex;justify-content:space-around;text-align:center;margin-top:55px}.sign div{width:45%}.blank{height:75px}.note{font-size:9pt}.placeholder{border:1px dashed #777;padding:12px;margin-top:15px}</style></head><body>'+
  '<section class="page"><div class="head"><b>PEMERINTAH KABUPATEN LABUHANBATU SELATAN</b><br><b>'+esc(d.nama_opd_snapshot)+'</b><br>'+esc(d.alamat_opd_snapshot)+'</div><h1>SURAT PESANAN</h1><h2>NOMOR : '+esc(d.nomor_surat)+'</h2><p>Lampiran : '+goods.length+' rincian barang</p><p>Perihal : Permohonan Pengadaan '+esc(d.nama_paket)+'</p><p>Kepada Yth.<br>Pejabat Pengadaan Barang/Jasa<br>Kabupaten Labuhanbatu Selatan<br>Di Tempat</p><p>Dengan hormat,</p><p>Dalam rangka mendukung pelaksanaan kegiatan operasional, kami bermaksud mengajukan permohonan pengadaan <b>'+esc(d.nama_paket)+'</b> melalui '+esc(d.metode_pengadaan)+'.</p><p>Adapun pengadaan ini telah dialokasikan dalam:</p><table>'+meta+'</table><p>Jenis barang beserta spesifikasi teknis yang dibutuhkan tercantum dalam lampiran.</p><p>Demikian permohonan ini disampaikan. Atas kerja sama yang baik diucapkan terima kasih.</p><p style="text-align:right">Kotapinang, '+esc(d.tanggal_surat)+'</p><div class="sign">'+signatureBlock('PPTK')+''+signatureBlock('PPK')+'</div></section>'+
  '<section class="page"><h2>LAMPIRAN PERMOHONAN PESANAN</h2><h3>A. Spesifikasi Teknis</h3><table><tr><th>No.</th><th>Nama Barang</th><th>Spesifikasi</th><th>Volume</th><th>Satuan</th><th>Harga Satuan</th><th>Jumlah</th></tr>'+rows+'</table><h3>B. Prioritas Produk Dalam Negeri dan UMKM</h3><p>Produk dalam negeri ditandai pada referensi harga: '+(prices.some(p=>p.produk_dalam_negeri)?'Ada':'Belum ada data')+'.</p><p>Kualifikasi penyedia: '+esc(d.kualifikasi_penyedia)+'</p><h3>C. Data Penyedia</h3><table><tr><th>No.</th><th>Nama</th><th>Penanggung Jawab</th><th>Alamat</th><th>NIB</th><th>Status UMKM</th></tr>'+vendorRows+'</table></section>'+
  '<section class="page"><h2>PENGUMPULAN REFERENSI HARGA</h2><table><tr><th>No.</th><th>Nama Barang</th><th>Harga Satuan</th><th>Harga Pembanding</th><th>Harga e-Katalog</th><th>Kesesuaian</th><th>Prioritas</th></tr>'+priceRows+'</table><p class="note">Data pada tabel merupakan referensi yang diinput ke aplikasi. Verifikasi, negosiasi, dan penetapan akhir dilakukan oleh pejabat berwenang.</p><div class="sign">'+signatureBlock('PPTK')+''+signatureBlock('PPK')+'</div></section>'+
  '<section><h2>DAFTAR DOKUMEN PENDUKUNG</h2><table><tr><th>No.</th><th>Nama File</th><th>Kategori</th><th>Jenis File</th></tr>'+fileRows+'</table><div class="placeholder">Lampiran screenshot katalog/penawaran, data SIRUP, DPA, serta berita acara reviu harus dilengkapi dan diverifikasi sebelum dokumen ini menjadi paket final.</div><h3>Catatan</h3><p>'+esc(d.catatan)+'</p></section></body></html>';
  const w = window.open('', '_blank');
  if (!w) throw new Error('Izinkan pop-up browser untuk mencetak dokumen.');
  w.document.open(); w.document.write(html); w.document.close();
  w.onload = () => { w.focus(); w.print(); };
}
