export async function buildProcurementHtml(db, id) {
  const [s, items, providers, refs, docs, officials, review] = await Promise.all([
    db.from('surat').select('*').eq('id', id).single(),
    db.from('detail_barang').select('*').eq('surat_id', id).order('nomor_urut'),
    db.from('penyedia').select('*').eq('surat_id', id).order('created_at'),
    db.from('referensi_harga').select('*').eq('surat_id', id).order('created_at'),
    db.from('dokumen_pendukung').select('*').eq('surat_id', id).order('nomor_urut'),
    db.from('surat_pejabat').select('*').eq('surat_id', id).order('created_at'),
    db.from('reviu').select('*').eq('surat_id', id).order('created_at',{ascending:false}).limit(1).maybeSingle()
  ]);
  const error = [s, items, providers, refs, docs, officials, review].find(x => x.error);
  if (error) throw error.error;
  const d = s.data, goods = items.data || [], vendors = providers.data || [], prices = refs.data || [], files = docs.data || [], signers = officials.data || [];
  let letterheadUrl='';
  if(d.opd_id){
    const {data:opd,error:opdError}=await db.from('opd').select('kop_surat_path').eq('id',d.opd_id).maybeSingle();
    if(opdError) throw opdError;
    if(opd?.kop_surat_path){const signed=await db.storage.from('kop-surat').createSignedUrl(opd.kop_surat_path,300);letterheadUrl=signed.data?.signedUrl||'';}
  }
  for (const item of goods) {
    if (item.foto_produk_path) {
      const signed = await db.storage.from('foto-produk').createSignedUrl(item.foto_produk_path, 300);
      item.foto_signed_url = signed.data?.signedUrl || '';
    }
  }
  for (const vendor of vendors) { try { const detail=JSON.parse(vendor.keterangan||'{}'); vendor.reference_detail=detail; if(detail.foto_path){const signed=await db.storage.from('dokumen-pendukung').createSignedUrl(detail.foto_path,300);vendor.reference_photo_url=signed.data?.signedUrl||'';} } catch { vendor.reference_detail={}; } }
  for (const file of files) {
    if (file.storage_path) {
      const signed = await db.storage.from('dokumen-pendukung').createSignedUrl(file.storage_path, 300);
      file.signed_url = signed.data?.signedUrl || '';
    }
  }
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
  const rows = goods.map((x,i) => '<tr><td>'+(i+1)+'</td><td>'+esc(x.nama_barang)+'</td><td>'+esc(x.spesifikasi)+(x.foto_signed_url?'<div class="product-photo-wrap"><img class="product-photo" src="'+x.foto_signed_url+'" alt="Foto '+esc(x.nama_barang)+'"></div>':'')+'</td><td>'+esc(x.volume)+'</td><td>'+esc(x.satuan)+'</td><td>'+rp(x.harga_satuan)+'</td><td>'+rp(Number(x.volume)*Number(x.harga_satuan))+'</td></tr>').join('');
  const priceRows = goods.map((x,i) => {
    const list = prices.filter(p => p.detail_barang_id === x.id);
    return '<tr><td>'+(i+1)+'</td><td>'+esc(x.nama_barang)+'</td><td>'+rp(x.harga_satuan)+'</td><td>'+list.map(p=>esc(p.sumber_referensi)+' '+rp(p.harga)).join('<br>')+'</td><td>'+list.map(p=>rp(p.harga_katalog)).join('<br>')+'</td><td>'+ (list.some(p=>p.sesuai_spesifikasi)?'Sesuai':'—')+'</td><td>'+ (list.some(p=>p.produk_dalam_negeri)?'PDN':'—')+'</td></tr>';
  }).join('');
  const vendorRows = vendors.map((v,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(v.nama_penyedia)+'</td><td>'+rp(v.reference_detail?.harga_satuan)+'</td><td>'+(v.reference_detail?.link_produk?'<a href="'+esc(v.reference_detail.link_produk)+'">Lihat produk INAPROC</a>':'—')+'</td></tr>').join('');
  const vendorPhotoPages=vendors.filter(v=>v.reference_photo_url).map(v=>'<section class="page vendor-evidence"><h2>LAMPIRAN REFERENSI PENYEDIA</h2><h3>'+esc(v.nama_penyedia)+'</h3><p>Harga satuan referensi: '+rp(v.reference_detail?.harga_satuan)+'</p><p>Sumber: '+(v.reference_detail?.link_produk?'<a href="'+esc(v.reference_detail.link_produk)+'">'+esc(v.reference_detail.link_produk)+'</a>':'—')+'</p><img src="'+v.reference_photo_url+'" alt="Referensi '+esc(v.nama_penyedia)+'"></section>').join('');
  const fileRows = files.map((f,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(f.kategori)+'</td><td>'+esc(f.nama_file)+'</td><td>'+esc(f.mime_type)+'</td><td>'+(f.signed_url?'<a href="'+f.signed_url+'">Buka lampiran</a>':'Tidak tersedia')+'</td></tr>').join('');
  const reviewData = review.data;
  const reviewRows = (Array.isArray(reviewData?.hasil_reviu)?reviewData.hasil_reviu:[]).map((x,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(x.judul)+'<br><small>'+esc(x.pertanyaan)+'</small></td><td>'+esc(({sesuai:'Sesuai',tidak_sesuai:'Tidak sesuai',perlu_dilengkapi:'Perlu dilengkapi',tidak_diperiksa:'Tidak diperiksa',belum_diperiksa:'Belum diperiksa'})[x.status]||x.status)+'</td><td>'+esc(x.catatan)+'</td></tr>').join('');
  const meta = [['Program',d.program],['Kegiatan',d.kegiatan],['Sub Kegiatan',d.subkegiatan],['Kode Rekening',d.kode_rekening],['Uraian Belanja',d.uraian_belanja],['Nilai Pagu',rp(d.nilai_pagu)],['Nilai HPS',rp(d.nilai_hps)],['Waktu Pengadaan',d.waktu_pengadaan],['Kualifikasi Penyedia',d.kualifikasi_penyedia],['Kode RUP',d.kode_rup]].map(x=>'<tr><th>'+esc(x[0])+'</th><td>'+esc(x[1])+'</td></tr>').join('');
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>Dokumen '+esc(d.nama_paket)+'</title><style>@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#111}body{font-family:"Times New Roman",serif;font-size:10pt;line-height:1.12}.page{width:210mm;height:297mm;min-height:297mm;margin:0 auto;padding:12mm 17mm 14mm;page-break-after:always;break-after:page;position:relative;background:#fff;overflow:hidden}.page:last-child{page-break-after:auto;break-after:auto}h1,h2{text-align:center;margin:0 0 8mm;font-weight:bold}h1{font-size:16pt}h2{font-size:14pt}h3{font-size:12pt;margin:7mm 0 3mm}p{margin:0 0 4mm;text-align:justify}.head{display:grid;grid-template-columns:25mm 1fr;align-items:center;text-align:center;border-bottom:1.2mm solid #111;padding:0 0 2mm;margin-bottom:3mm;font-size:9pt;line-height:1.05;min-height:22mm}.head img{display:block;width:21mm;height:21mm;object-fit:contain;margin:0 auto}.head b{font-size:10pt}.head .agency{font-size:12pt;font-weight:bold}.head .head-text{padding-right:25mm}.letter-title{text-align:center;font-size:11pt;margin:0 0 0.5mm}.letter-no{text-align:center;font-weight:bold;font-size:10pt;margin:0 0 5mm}.letter-meta{margin:0 0 5mm}.letter-meta p{text-align:left;margin:0 0 1mm}.address{margin:0 0 5mm;line-height:1.08}.body-copy{text-indent:10mm}.meta{width:100%;border-collapse:collapse;margin:1mm 0 4mm;font-size:9.5pt}.meta td,.meta th{border:0;padding:0.35mm 0.5mm;vertical-align:top;background:transparent;line-height:1.08}.meta th{width:27%;font-weight:normal;text-align:left}.meta th:after{content:" :";}data-table{width:100%;border-collapse:collapse;font-size:10pt;margin:3mm 0 7mm}.data-table td,.data-table th{border:1px solid #333;padding:2mm;vertical-align:top}.data-table th{background:#f2f2f2;text-align:center} .product-photo-wrap{width:100%;margin:4mm 0 1mm;text-align:center;break-inside:avoid}.product-photo{display:block;width:100%;max-width:100%;height:auto;max-height:110mm;object-fit:contain;margin:0 auto;break-inside:avoid}.sign{display:flex;justify-content:space-between;gap:12mm;text-align:center;margin:12mm 0 0;break-inside:avoid}.sign div{width:50%;font-size:11pt}.blank{height:22mm}.sign img{max-width:38mm;max-height:18mm;object-fit:contain}.note{font-size:9pt}.placeholder{border:1px dashed #777;padding:12px;margin-top:15px}@media screen{body{background:#e8ebef}.page{margin:10mm auto;box-shadow:0 2px 12px #0002}}@media print{body{background:#fff}.page{margin:0;box-shadow:none;min-height:297mm}}</style></head><body>'+
  '<section class="page"><div class="head">'+(letterheadUrl?'<img src="'+letterheadUrl+'">':'<div></div>')+'<div class="head-text"><b>PEMERINTAH KABUPATEN LABUHANBATU SELATAN</b><br><span class="agency">'+esc(d.nama_opd_snapshot)+'</span><br>'+esc(d.alamat_opd_snapshot)+'</div></div><h1 class="letter-title">SURAT PESANAN</h1><div class="letter-no">NOMOR : '+esc(d.nomor_surat)+'</div><div class="letter-meta"><p>Lampiran : 1 (Satu) Lembar</p><p>Perihal&nbsp;&nbsp;: Permohonan '+esc(d.uraian_belanja||d.nama_paket)+'</p></div><div class="address">Kepada Yth :<br>Sdr. Pejabat Pengadaan '+esc(d.nama_opd_snapshot)+'<br>Kabupaten Labuhanbatu Selatan<br>Di_<br>Tempat</div><p>Dengan Hormat,</p><p class="body-copy">Dalam rangka mendukung pelaksanaan kegiatan operasional, kami bermaksud untuk melakukan Permohonan Pengadaan : '+esc(d.uraian_belanja||d.nama_paket)+' melalui belanja '+esc(d.metode_pengadaan||'e-katalog')+'.</p><p class="body-copy">Adapun Permohonan Pengadaan : '+esc(d.uraian_belanja||d.nama_paket)+' ini telah dialokasikan dalam:</p><table class="meta">'+meta+'</table><p class="body-copy">Adapun jenis barang beserta spesifikasi teknis yang dibutuhkan (terlampir)</p><p class="body-copy">Demikian permohonan pesanan ini diperbuat untuk dilaksanakan dan dipenuhi, atas kerjasamanya yang baik kami ucapkan terima kasih.</p><p style="text-align:center;margin-top:4mm">Kotapinang, '+esc(d.tanggal_surat)+'</p><div class="sign">'+signatureBlock('PPTK')+''+signatureBlock('PPK')+'</div></section>'+
  '<section class="page"><h2>LAMPIRAN PERMOHONAN PESANAN</h2><h3>A. Spesifikasi Teknis</h3><table class="data-table"><tr><th>No.</th><th>Nama Barang</th><th>Spesifikasi</th><th>Volume</th><th>Satuan</th><th>Harga Satuan</th><th>Jumlah</th></tr>'+rows+'</table><h3>B. Prioritas Produk Dalam Negeri dan UMKM</h3><p>Produk dalam negeri ditandai pada referensi harga: '+(prices.some(p=>p.produk_dalam_negeri)?'Ada':'Belum ada data')+'.</p><p>Kualifikasi penyedia: '+esc(d.kualifikasi_penyedia)+'</p><h3>C. Data Penyedia</h3><table class="data-table"><tr><th>No.</th><th>Nama Penyedia</th><th>Harga Satuan</th><th>Link Produk E-Katalog INAPROC</th></tr>'+vendorRows+'</table></section>'+
  '<section class="page"><h2>PENGUMPULAN REFERENSI HARGA</h2><table class="data-table"><tr><th>No.</th><th>Nama Barang</th><th>Harga Satuan</th><th>Harga Pembanding</th><th>Harga e-Katalog</th><th>Kesesuaian</th><th>Prioritas</th></tr>'+priceRows+'</table><p class="note">Data pada tabel merupakan referensi yang diinput ke aplikasi. Verifikasi, negosiasi, dan penetapan akhir dilakukan oleh pejabat berwenang.</p><div class="sign">'+signatureBlock('PPTK')+''+signatureBlock('PPK')+'</div></section>'+
  '<section class="page"><h2>BERITA ACARA REVIU</h2><p>Tanggal reviu: '+esc(reviewData?.tanggal_reviu)+'</p><table class="data-table"><tr><th>No.</th><th>Aspek yang direviu</th><th>Hasil</th><th>Catatan pemeriksaan</th></tr>'+reviewRows+'</table><h3>Rekomendasi</h3><p>'+esc(reviewData?.rekomendasi)+'</p><h3>Catatan</h3><p>'+esc(reviewData?.catatan)+'</p><div class="sign">'+signatureBlock('PPTK')+''+signatureBlock('PPK')+'</div></section>'+
  '<section><h2>DAFTAR DOKUMEN PENDUKUNG</h2><table class="data-table"><tr><th>No.</th><th>Kategori</th><th>Nama File</th><th>Jenis File</th><th>Bukti</th></tr>'+fileRows+'</table><p class="note">Tautan lampiran bersifat sementara dan memerlukan koneksi internet saat dibuka. Pastikan seluruh bukti telah diverifikasi sebelum dokumen ditetapkan final.</p><h3>Catatan</h3><p>'+esc(d.catatan)+'</p></section>'+vendorPhotoPages+'</body></html>';
  return html;
}

export async function openProcurementPrint(db, id) {
  const html = await buildProcurementHtml(db, id);
  const w = window.open('', '_blank');
  if (!w) throw new Error('Izinkan pop-up browser untuk mencetak dokumen.');
  w.document.open(); w.document.write(html); w.document.close();
  w.onload = () => { w.focus(); w.print(); };
}
