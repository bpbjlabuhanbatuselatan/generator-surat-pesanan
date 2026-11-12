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
    if (!p) return '<div class="signature-cell">'+esc(role)+'<div class="signature-space"></div><b>(................................)</b></div>';
    return '<div class="signature-cell"><div class="signature-role">'+esc(p.jabatan_snapshot || p.peran)+'</div><div class="signature-space">'+(p.signature_url?'<img src="'+p.signature_url+'" alt="Tanda tangan '+esc(p.nama_snapshot)+'">':'')+'</div><b>'+esc(p.nama_snapshot)+'</b>'+(p.nip_snapshot?'<br>NIP. '+esc(p.nip_snapshot):'')+'</div>';
  };
  const esc = v => String(v ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rp = v => v == null || v === '' ? '—' : new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(v));
  const rows = goods.map((x,i) => '<tr><td>'+(i+1)+'</td><td>'+esc(x.nama_barang)+'</td><td>'+esc(x.spesifikasi)+(x.foto_signed_url?'<div class="product-photo-wrap"><img class="product-photo" src="'+x.foto_signed_url+'" alt="Foto '+esc(x.nama_barang)+'"></div>':'')+'</td><td>'+esc(x.volume)+'</td><td>'+esc(x.satuan)+'</td><td>'+rp(x.harga_satuan)+'</td><td>'+rp(Number(x.volume)*Number(x.harga_satuan))+'</td></tr>').join('');
  const providerSummaryRows = vendors.map((v,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(v.nama_penyedia)+'</td><td>'+rp(v.reference_detail?.harga_satuan)+'</td><td>'+esc(v.reference_detail?.lokasi||'—')+'</td><td>'+esc(v.reference_detail?.kesesuaian||'Belum diisi')+'</td><td>'+esc(v.reference_detail?.prioritas||'Belum diisi')+'</td></tr>').join('');
  const vendorRows = vendors.map((v,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(v.nama_penyedia)+'</td><td>'+rp(v.reference_detail?.harga_satuan)+'</td><td>'+(v.reference_detail?.link_produk?'<a href="'+esc(v.reference_detail.link_produk)+'">Lihat produk INAPROC</a>':'—')+'</td></tr>').join('');
  const vendorPhotoPages=vendors.filter(v=>v.reference_photo_url).map(v=>'<section class="page vendor-evidence"><h2>LAMPIRAN REFERENSI PENYEDIA</h2><h3>'+esc(v.nama_penyedia)+'</h3><p>Harga satuan referensi: '+rp(v.reference_detail?.harga_satuan)+'</p><p>Sumber: '+(v.reference_detail?.link_produk?'<a href="'+esc(v.reference_detail.link_produk)+'">'+esc(v.reference_detail.link_produk)+'</a>':'—')+'</p><img src="'+v.reference_photo_url+'" alt="Referensi '+esc(v.nama_penyedia)+'"></section>').join('');
  const attachmentItems = files.filter(f=>f.signed_url&&(/^image\//i.test(f.mime_type||'')||/\.(jpe?g|png|webp)$/i.test(f.nama_file||'')));
  const attachmentPages = [];
  for(let i=0;i<attachmentItems.length;i+=2){
    const pair=attachmentItems.slice(i,i+2);
    const slots=pair.map(f=>'<div class="attachment-slot"><h2 class="attachment-label">LAMPIRAN '+esc(String(f.kategori||'DOKUMEN PENDUKUNG').toUpperCase())+'</h2><img src="'+esc(f.signed_url)+'" alt="'+esc(f.nama_file)+'"></div>').join('');
    attachmentPages.push('<section class="page attachment-page '+(pair.length===1?'single':'double')+'">'+slots+'</section>');
  }
  const attachmentPagesHtml=attachmentPages.join('');
  const reviewData = review.data;
  const reviewRows = (Array.isArray(reviewData?.hasil_reviu)?reviewData.hasil_reviu:[]).map((x,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(x.judul)+'<br><small>'+esc(x.pertanyaan)+'</small></td><td>'+esc(({sesuai:'Sesuai',tidak_sesuai:'Tidak sesuai',perlu_dilengkapi:'Perlu dilengkapi',tidak_diperiksa:'Tidak diperiksa',belum_diperiksa:'Belum diperiksa'})[x.status]||x.status)+'</td><td>'+esc(x.catatan)+'</td></tr>').join('');
  const meta = [['Program',d.program],['Kegiatan',d.kegiatan],['Sub Kegiatan',d.subkegiatan],['Kode Rekening',d.kode_rekening],['Uraian Belanja',d.uraian_belanja],['Nilai Pagu',rp(d.nilai_pagu)],['Nilai HPS',rp(d.nilai_hps)],['Waktu Pengadaan',d.waktu_pengadaan],['Kualifikasi Penyedia',d.kualifikasi_penyedia],['Kode RUP',d.kode_rup]].map(x=>'<tr><th>'+esc(x[0])+'</th><td>'+esc(x[1])+'</td></tr>').join('');
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>Dokumen '+esc(d.nama_paket)+'</title><style>@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#111}body{font-family:"Bookman Old Style","Bookman",serif;font-size:11pt;line-height:1.18}.page{width:210mm;height:297mm;min-height:297mm;margin:0 auto;padding:12mm 17mm 14mm;page-break-after:always;break-after:page;position:relative;background:#fff;overflow:hidden}.page:last-child{page-break-after:auto;break-after:auto}h1,h2{text-align:center;margin:0 0 8mm;font-weight:bold}h1{font-size:16pt}h2{font-size:14pt}h3{font-size:12pt;margin:7mm 0 3mm}p{margin:0 0 4mm;text-align:justify}.head{display:block;width:100%;margin:0 0 5mm;padding:0;border:0;text-align:center;font-size:10pt;line-height:1.1}.head-image{display:block;width:100%;margin:0 0 5mm}.head-image img{display:block;width:100%;height:auto;max-height:48mm;object-fit:fill;margin:0 auto}.head-fallback{width:100%;text-align:center;border-bottom:1.2mm double #111;padding:0 0 3mm;margin:0 0 5mm}.head-fallback b{font-size:12pt}.head-fallback .agency{font-size:16pt;font-weight:bold}.letter-title{text-align:center;font-size:11pt;margin:0 0 0.5mm}.letter-no{text-align:center;font-weight:bold;font-size:10pt;margin:0 0 5mm}.letter-meta{margin:0 0 5mm}.letter-meta p{text-align:left;margin:0 0 1mm}.address{margin:0 0 5mm;line-height:1.08}.body-copy{text-indent:10mm}.meta{width:100%;border-collapse:collapse;margin:1mm 0 4mm;font-size:11pt}.meta td,.meta th{border:0;padding:0.35mm 0.5mm;vertical-align:top;background:transparent;line-height:1.08}.meta th{width:27%;font-weight:normal;text-align:left}.meta th:after{content:" :";} .data-table{width:100%;max-width:100%;table-layout:fixed;border-collapse:collapse;font-size:11pt;margin:3mm 0 7mm;overflow-wrap:anywhere;word-break:break-word}.data-table td,.data-table th{overflow-wrap:anywhere;word-break:break-word}.provider-summary-table th,.provider-summary-table td{padding:2.2mm 1.5mm;font-size:11pt;line-height:1.15}.provider-summary .sign{margin-top:10mm}.data-table td,.data-table th{border:1px solid #333;padding:2mm;vertical-align:top}.data-table th{background:#f2f2f2;text-align:center} .product-photo-wrap{width:100%;margin:4mm 0 1mm;text-align:center;break-inside:avoid}.product-photo{display:block;width:100%;max-width:100%;height:auto;max-height:110mm;object-fit:contain;margin:0 auto;break-inside:avoid}.sign{display:flex;justify-content:space-between;align-items:flex-start;gap:18mm;text-align:center;margin:10mm 0 0;break-inside:avoid}.sign .signature-cell{width:50%;min-width:0;font-size:11pt;line-height:1.2}.signature-role{min-height:8mm}.signature-space{height:27mm;display:flex;align-items:center;justify-content:center}.signature-space{width:48mm;height:27mm;margin:0 auto;display:flex;align-items:center;justify-content:center;overflow:hidden}.signature-space img{display:block!important;width:48mm!important;height:25mm!important;max-width:none!important;max-height:none!important;object-fit:contain!important;object-position:center center;margin:0 auto}.note{font-size:9pt}.placeholder{border:1px dashed #777;padding:12px;margin-top:15px}.attachment-page{display:flex;flex-direction:column;align-items:stretch;justify-content:space-evenly;gap:5mm;padding:12mm 17mm 14mm}.attachment-page .attachment-slot{width:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;break-inside:avoid}.attachment-page .attachment-label{width:100%;font-size:13pt;text-align:center;font-weight:bold;margin:0 0 4mm;padding:0 0 2mm;border-bottom:1px solid #333}.attachment-page.double .attachment-slot{height:132mm}.attachment-page.double .attachment-slot img{display:block;width:100%;height:112mm;object-fit:contain;object-position:center;margin:0 auto}.attachment-page.single .attachment-slot{height:271mm}.attachment-page.single .attachment-slot img{display:block;width:100%;height:250mm;object-fit:contain;object-position:center;margin:0 auto}@media screen{body{background:#e8ebef}.page{margin:10mm auto;box-shadow:0 2px 12px #0002}}@media print{body{background:#fff}.page{margin:0;box-shadow:none;min-height:297mm}}</style></head><body>'+
  '<section class="page">'+(letterheadUrl?'<div class="head-image"><img src="'+letterheadUrl+'" alt="Kop surat '+esc(d.nama_opd_snapshot)+'"></div>':'<div class="head-fallback"><b>PEMERINTAH KABUPATEN LABUHANBATU SELATAN</b><br><span class="agency">'+esc(d.nama_opd_snapshot)+'</span><br>'+esc(d.alamat_opd_snapshot)+'</div>')+'<h1 class="letter-title">SURAT PESANAN</h1><div class="letter-no">NOMOR : '+esc(d.nomor_surat)+'</div><div class="letter-meta"><p>Lampiran : 1 (Satu) Lembar</p><p>Perihal&nbsp;&nbsp;: Permohonan '+esc(d.uraian_belanja||d.nama_paket)+'</p></div><div class="address">Kepada Yth :<br>Sdr. Pejabat Pengadaan '+esc(d.nama_opd_snapshot)+'<br>Kabupaten Labuhanbatu Selatan<br>Di_<br>Tempat</div><p>Dengan Hormat,</p><p class="body-copy">Dalam rangka mendukung pelaksanaan kegiatan operasional, kami bermaksud untuk melakukan Permohonan Pengadaan : '+esc(d.uraian_belanja||d.nama_paket)+' melalui belanja '+esc(d.metode_pengadaan||'e-katalog')+'.</p><p class="body-copy">Adapun Permohonan Pengadaan : '+esc(d.uraian_belanja||d.nama_paket)+' ini telah dialokasikan dalam:</p><table class="meta">'+meta+'</table><p class="body-copy">Adapun jenis barang beserta spesifikasi teknis yang dibutuhkan (terlampir)</p><p class="body-copy">Demikian permohonan pesanan ini diperbuat untuk dilaksanakan dan dipenuhi, atas kerjasamanya yang baik kami ucapkan terima kasih.</p><p style="text-align:center;margin-top:4mm">Kotapinang, '+esc(d.tanggal_surat)+'</p><div class="sign">'+signatureBlock('PPTK')+''+signatureBlock('PPK')+'</div></section>'+
  '<section class="page"><h2>LAMPIRAN PERMOHONAN PESANAN</h2><h3>A. Spesifikasi Teknis</h3><table class="data-table"><tr><th>No.</th><th>Nama Barang</th><th>Spesifikasi</th><th>Volume</th><th>Satuan</th><th>Harga Satuan</th><th>Jumlah</th></tr>'+rows+'</table><h3>B. Prioritas Produk Dalam Negeri dan UMKM</h3><p>Produk dalam negeri ditandai pada referensi harga: '+(prices.some(p=>p.produk_dalam_negeri)?'Ada':'Belum ada data')+'.</p><p>Kualifikasi penyedia: '+esc(d.kualifikasi_penyedia)+'</p><h3>C. Data Penyedia</h3><table class="data-table"><tr><th>No.</th><th>Nama Penyedia</th><th>Harga Satuan</th><th>Link Produk E-Katalog INAPROC</th></tr>'+vendorRows+'</table></section>'+
  '<section class="page provider-summary"><h2>RINGKASAN REFERENSI PENYEDIA</h2><table class="data-table provider-summary-table"><colgroup><col style="width:7%"><col style="width:23%"><col style="width:17%"><col style="width:19%"><col style="width:17%"><col style="width:17%"></colgroup><tr><th>No.</th><th>Nama Penyedia</th><th>Harga E-Katalog</th><th>Lokasi</th><th>Kesesuaian</th><th>Prioritas</th></tr>'+providerSummaryRows+'</table><p class="note">Daftar ini merupakan ringkasan referensi penyedia dan bukan penetapan pemenang. Verifikasi, evaluasi, negosiasi, dan penetapan akhir dilakukan oleh pejabat berwenang.</p><div class="sign">'+signatureBlock('PPTK')+''+signatureBlock('PPK')+'</div></section>'+
  attachmentPagesHtml+vendorPhotoPages+'</body></html>';
  return html;
}

export async function buildReviewHtml(db,id){
  const [s,review,officials,items,providers,documents]=await Promise.all([
    db.from('surat').select('*').eq('id',id).single(),
    db.from('reviu').select('*').eq('surat_id',id).order('created_at',{ascending:false}).limit(1).maybeSingle(),
    db.from('surat_pejabat').select('*').eq('surat_id',id).order('created_at'),
    db.from('detail_barang').select('*').eq('surat_id',id).order('nomor_urut'),
    db.from('penyedia').select('*').eq('surat_id',id).order('created_at'),
    db.from('dokumen_pendukung').select('*').eq('surat_id',id).order('nomor_urut')
  ]);
  for(const q of [s,review,officials,items,providers,documents])if(q.error)throw q.error;
  if(!review.data)throw new Error('Berita Acara Reviu belum tersimpan untuk surat ini.');
  const esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rp=v=>v==null||v===''?'—':new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(v));
  const d=s.data,r=review.data,goods=items.data||[],vendors=providers.data||[],signers=officials.data||[];
  for(const x of goods)if(x.foto_produk_path){const q=await db.storage.from('foto-produk').createSignedUrl(x.foto_produk_path,300);x.foto_signed_url=q.data?.signedUrl||'';}
  for(const x of signers)if(x.tanda_tangan_path_snapshot){const q=await db.storage.from('tanda-tangan').createSignedUrl(x.tanda_tangan_path_snapshot,300);x.signature_url=q.data?.signedUrl||'';}
  const supporting=documents.data||[];for(const x of supporting)if(x.storage_path){const q=await db.storage.from('dokumen-pendukung').createSignedUrl(x.storage_path,300);x.signed_url=q.data?.signedUrl||'';}
  const ppbjSignature='<div class="signature-cell"><div class="signature-role">PEJABAT PENGADAAN BARANG/JASA</div><div class="signature-space"></div><b>ALI AKBAR, SE</b><br>NIP. 199203032022031004</div>';
  const signatureBlock=role=>{
    const p=signers.find(x=>x.peran===role);
    if(!p)return '<div class="signature-cell">'+esc(role)+'<div class="signature-space"></div><b>(................................)</b></div>';
    return '<div class="signature-cell"><div class="signature-role">'+esc(p.jabatan_snapshot||p.peran)+'</div><div class="signature-space">'+(p.signature_url?'<img src="'+esc(p.signature_url)+'" alt="Tanda tangan '+esc(p.nama_snapshot)+'">':'')+'</div><b>'+esc(p.nama_snapshot)+'</b>'+(p.nip_snapshot?'<br>NIP. '+esc(p.nip_snapshot):'')+'</div>';
  };
  const date=v=>{if(!v)return '—';const x=new Date(v+'T00:00:00');return Number.isNaN(x.getTime())?esc(v):x.toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'});};
  const category=(title)=>'<tr class="section-row"><th colspan="4">'+title+'</th></tr>';
  const reviewNumbers=Array.isArray(checks.nomor_tinjauan)?checks.nomor_tinjauan:[];const reviewRow=(no,title,question,response)=>'<tr><td class="center">'+esc(reviewNumbers[Number(no)-1]??no)+'</td><td>'+title+'</td><td>'+question+'</td><td>'+response+'</td></tr>';
  const contract=d.bentuk_kontrak||'Surat Pesanan';
  const method=d.metode_pengadaan||'E-purchasing';
  const rows=[
    category('SPESIFIKASI TEKNIS'),
    category('REVIU UMUM SPESIFIKASI TEKNIS'),
    reviewRow('1','Spesifikasi Teknis','Spesifikasi teknis sudah terdefinisikan dengan jelas? Mohon tanggapannya','Sudah sesuai dengan kebutuhan paket.'),
    reviewRow('2','Sumber informasi dalam penetapan spesifikasi teknis','Mohon dijelaskan sumber informasi apa saja yang digunakan dalam penetapan spesifikasi teknis','Mengacu pada surat permohonan pesanan dan kebutuhan yang telah ditetapkan.'),
    reviewRow('3','Barang ber-TKDN dan PDN','Apakah saat perencanaan pengadaan PPK telah menyusun spesifikasi yang mengacu kepada PDN dan mengutamakan produk ber-TKDN?','Mengutamakan Produk Dalam Negeri dan produk ber-TKDN sesuai ketersediaan pada katalog.'),
    reviewRow('4','Surat pernyataan teknis (apabila diperlukan)','Adakah surat pernyataan teknis yang dibutuhkan pada paket ini?','Tidak diperlukan, kecuali dipersyaratkan sesuai karakteristik barang.'),
    reviewRow('5','Tingkat ketersediaan barang dan penyedia','Bagaimana potensi ketersediaan barang dan penyedia yang dibutuhkan pada paket ini?','Ketersediaan barang dan penyedia ditelusuri melalui Katalog Elektronik.'),
    category('REVIU SPESIFIKASI TEKNIS'),
    reviewRow('6','Kesesuaian ketentuan','Reviu spesifikasi teknis mengacu pada ketentuan pengadaan yang berlaku.','Sesuai dengan Perlem LKPP No. 2 Tahun 2026 dan Kepka LKPP No. 122 Tahun 2022 sebagaimana dicantumkan dalam template.'),
    category('HARGA PERKIRAAN SENDIRI'),
    category('REVIU UMUM HPS'),
    reviewRow('7','Nilai HPS (digunakan jika HPS > Rp100 juta)','Apakah HPS telah cukup dan sesuai dengan spesifikasi teknis dan ruang lingkup pekerjaan?',Number(d.nilai_hps||0)>100000000?rp(d.nilai_hps):'Nilai paket di bawah Rp100.000.000,00.'),
    reviewRow('8','Dasar penyusunan HPS','Apakah HPS disusun berdasarkan RAB perencanaan, informasi pasar terkini, dan/atau pembanding pekerjaan sejenis?','Mengacu pada dokumen perencanaan dan informasi/pembanding harga yang tersedia.'),
    reviewRow('9','Ketersediaan anggaran','Apakah paket ini sudah tersedia pada DPA TA 2026 revisi terakhir?',''+(d.nilai_pagu?'Sudah, sesuai data paket yang diinput.':'Perlu dikonfirmasi pada DPA TA 2026 revisi terakhir.')),
    reviewRow('10','Pencatatan SIRUP','Apakah paket ini sudah terdaftar dan diumumkan pada SIRUP? Mohon disebutkan ID RUP.',''+(d.kode_rup?'Sudah. ID RUP: '+esc(d.kode_rup):'Perlu dilengkapi ID RUP.')),
    reviewRow('11','Waktu pemanfaatan','Apakah proses pengadaan dapat selesai sesuai rencana penggunaan/pemanfaatan barang/jasa?','Diperkirakan dapat diselesaikan sesuai rencana penggunaan/pemanfaatan barang.'),
    reviewRow('12','Harga pembanding','Apakah ada harga pembanding untuk produk yang sama?',''+(vendors.length?'Ada, berdasarkan referensi penyedia yang dicatat pada dokumen.':'Perlu dilengkapi bukti harga pembanding.')),
    reviewRow('13','Tempat tujuan akhir','Mohon klarifikasi tempat tujuan akhir pengiriman barang.',''+esc(d.tujuan_pengiriman||d.alamat_opd_snapshot)),
    reviewRow('14','Pembayaran','Mohon diisikan metode pembayaran seperti pada rancangan kontrak.',''+esc(d.metode_pembayaran||'Pembayaran sekaligus setelah barang diterima dan diperiksa, sesuai ketentuan kontrak.')),
    category('RANCANGAN KONTRAK'),
    reviewRow('15','Bentuk kontrak','Mohon klarifikasi bentuk kontrak paket ini.',''+esc(contract)),
    category('PERSIAPAN PEMILIHAN OLEH PEJABAT PENGADAAN'),
    reviewRow('16','Penetapan metode pemilihan penyedia','Ditetapkan oleh Pejabat Pengadaan dengan diketahui PPK.',''+esc(method))
  ].join('');
  
  const checkText=(v,fallback)=>v&&String(v).trim()?esc(v):(fallback||'<span class="muted">Belum diisi — lengkapi berdasarkan hasil pemeriksaan aktual.</span>');
  const productRows=goods.map((x,i)=>'<tr><td class="center">'+(i+1)+'</td><td><b>'+esc(x.nama_barang)+'</b><br><span class="muted">Spesifikasi: '+esc(x.spesifikasi||'—')+'</span>'+(x.foto_signed_url?'<div class="product-photo"><img src="'+esc(x.foto_signed_url)+'" alt="Produk '+esc(x.nama_barang)+'"></div>':'')+'</td></tr>').join('');
  const vendorRows=vendors.map((v,i)=>{let info={};try{info=JSON.parse(v.keterangan||'{}')}catch{}return '<tr><td class="center">'+(i+1)+'</td><td><b>'+esc(v.nama_penyedia)+'</b><br>Alamat/lokasi: '+esc(info.lokasi||v.alamat||'—')+'<br>Link produk: '+(info.link_produk?'<a href="'+esc(info.link_produk)+'">'+esc(info.link_produk)+'</a>':'—')+'</td></tr>'}).join('');
  const meta=[
    ['Nomor',d.nomor_surat||'—'],
    ['Tanggal',date(r.tanggal_reviu||d.tanggal_surat)],
    ['Nama Paket',d.nama_paket],
    ['OPD',d.nama_opd_snapshot],
    ['Alamat OPD',d.alamat_opd_snapshot],
    ['Kode RUP',d.kode_rup],
    ['Nilai HPS',rp(d.nilai_hps)]
  ].map(x=>'<tr><th>'+esc(x[0])+'</th><td>'+esc(x[1])+'</td></tr>').join('');
  const extra=Array.isArray(r.hasil_reviu)?r.hasil_reviu:[];
  const recommendation=r.rekomendasi||'Dokumen persiapan pengadaan dapat dilanjutkan sesuai hasil reviu dan pemenuhan ketentuan yang berlaku.';
  const notes=r.catatan||'—';
  return '<!doctype html><html><head><meta charset="utf-8"><title>Berita Acara Reviu '+esc(d.nama_paket)+'</title><style>@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#17243a}body{font-family:"Cambria",serif;font-size:11pt;line-height:1.18}.page{width:210mm;min-height:297mm;margin:0 auto;padding:13mm 16mm 14mm;page-break-after:always;break-after:page;position:relative;background:#fff;overflow:hidden}.page:last-child{page-break-after:auto;break-after:auto}.doc-title{text-align:center;font-size:14pt;line-height:1.25;font-weight:bold;color:#17365d;margin:0 0 7mm}.meta{width:100%;border-collapse:collapse;margin:0 0 5mm;font-size:11pt}.meta th,.meta td{border:0;padding:1.2mm 1mm;text-align:left;vertical-align:top}.meta th{width:24%;font-weight:normal}.meta th:after{content:" :"}.data-table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:11pt;margin:3mm 0 5mm}.data-table th,.data-table td{border:1px solid #52647a;padding:2mm;vertical-align:top;overflow-wrap:anywhere}.data-table thead th{background:#17365d;color:#fff;text-align:center;font-weight:bold}.data-table .section-row th{background:#dce6f1;color:#17365d;text-align:left;font-weight:bold}.center{text-align:center}.muted{color:#52647a}.product-photo{margin:2mm auto 0;text-align:left}.product-photo img{display:block;max-width:68mm;max-height:48mm;object-fit:contain;object-position:left center}.sign{display:flex;justify-content:space-between;gap:16mm;text-align:center;margin:13mm 0 0;break-inside:avoid}.signature-cell{width:50%;font-size:11pt;line-height:1.2}.signature-role{min-height:8mm}.signature-space{width:48mm;height:27mm;margin:0 auto;display:flex;align-items:center;justify-content:center;overflow:hidden}.signature-space img{display:block!important;width:48mm!important;height:25mm!important;max-width:none!important;max-height:none!important;object-fit:contain!important;object-position:center;margin:0 auto}.review-attachment{height:245mm;display:flex;align-items:center;justify-content:center;overflow:hidden}.review-attachment img{max-width:100%;max-height:100%;object-fit:contain}.attachment-page{page-break-after:always;break-after:page}.small-note{font-size:9pt}.avoid-break{break-inside:avoid}h3{font-size:11pt;color:#17365d;margin:5mm 0 2mm}@media screen{body{background:#e8ebef}.page{margin:10mm auto;box-shadow:0 2px 12px #0002}}@media print{body{background:#fff}.page{margin:0;box-shadow:none}}</style></head><body>'+
  '<section class="page"><h1 class="doc-title">BERITA ACARA REVIU DOKUMEN PERSIAPAN PENGADAAN E-PURCHASING</h1><table class="meta">'+meta+'</table><table class="data-table"><colgroup><col style="width:6%"><col style="width:23%"><col style="width:43%"><col style="width:28%"></colgroup><thead><tr><th>No.</th><th>Tinjauan</th><th>Hasil rekomendasi Pejabat Pengadaan</th><th>Tanggapan</th></tr></thead><tbody>'+rows+'</tbody></table><h3>Rekomendasi Hasil Reviu</h3><p>'+esc(recommendation)+'</p><h3>Catatan</h3><p>'+esc(notes)+'</p></section>'+
  '<section class="page"><h2 class="doc-title">PRODUK PADA KATALOG SAAT DILAKUKAN REVIU</h2><table class="data-table"><colgroup><col style="width:9%"><col style="width:91%"></colgroup><thead><tr><th>No.</th><th>Hal-hal Pembahasan / Catatan dan Hasil Pembahasan</th></tr></thead><tbody><tr><td class="center">1</td><td><b>Nama dan Identitas Pelaku Usaha</b><br>Nama: '+esc(vendors[0]?.nama_penyedia||'—')+'<br>Alamat: '+esc((()=>{try{return JSON.parse(vendors[0]?.keterangan||'{}').lokasi||vendors[0]?.alamat||'—'}catch{return '—'}})())+'</td></tr><tr><td class="center">2</td><td><b>Produk</b><table class="data-table"><tbody>'+productRows+'</tbody></table></td></tr><tr><td class="center">3</td><td><b>Hasil pemeriksaan Status Daftar Hitam Penyedia</b><br><b>Hasil pemeriksaan:</b> '+checkText(checks.daftar_hitam,supporting.some(x=>x.kategori==='Bukti Reviu - Daftar Hitam')?'Bukti tangkapan layar pemeriksaan terlampir.':null)+'<br><br><span class="muted">Bukti/tangkapan layar pemeriksaan dapat dilampirkan pada dokumen pendukung.</span></td></tr><tr><td class="center">4</td><td><b>Hasil verifikasi data kualifikasi Pelaku Usaha pada aplikasi SIKaP</b><br><b>Hasil verifikasi:</b> '+checkText(checks.sikap,supporting.some(x=>x.kategori==='Bukti Reviu - SIKaP')?'Bukti tangkapan layar verifikasi terlampir.':null)+'<br><br><span class="muted">Bukti/tangkapan layar verifikasi dapat dilampirkan pada dokumen pendukung.</span></td></tr><tr><td class="center">5</td><td><b>Pendokumentasian</b><br>'+checkText(checks.pendokumentasian,supporting.some(x=>x.kategori==='Bukti Reviu - Pendokumentasian')?'Dokumentasi gambar terlampir.':null)+'</td></tr><tr><td class="center">6</td><td><b>Lain-lain</b><br>'+checkText(checks.lain_lain)+'</td></tr></tbody></table><p class="small-note">Catatan: lengkapi hasil pemeriksaan Daftar Hitam dan verifikasi SIKaP berdasarkan bukti pemeriksaan aktual sebelum dokumen ditandatangani.</p><div class="sign">'+signatureBlock('PPK')+ppbjSignature+'</div></section>'+supporting.filter(x=>x.signed_url).map((x,i)=>'<section class="page attachment-page"><h2 class="doc-title">LAMPIRAN DOKUMEN REVIU</h2><p><b>'+esc(x.kategori||'Dokumen pendukung')+'</b> — '+esc(x.nama_file||'Lampiran '+(i+1))+'</p><div class="review-attachment"><img src="'+esc(x.signed_url)+'" alt="'+esc(x.nama_file||'Lampiran')+'"></div></section>').join('')+'</body></html>';
}
export async function openReviewPrint(db,id){
  const html=await buildReviewHtml(db,id),w=window.open('','_blank');
  if(!w)throw new Error('Izinkan pop-up browser untuk mencetak berita acara reviu.');
  w.document.open();w.document.write(html);w.document.close();
  w.onload=()=>{w.focus();w.print();};
}

export async function openProcurementPrint(db, id) {
  const html = await buildProcurementHtml(db, id);
  const w = window.open('', '_blank');
  if (!w) throw new Error('Izinkan pop-up browser untuk mencetak dokumen.');
  w.document.open(); w.document.write(html); w.document.close();
  w.onload = () => { w.focus(); w.print(); };
}
