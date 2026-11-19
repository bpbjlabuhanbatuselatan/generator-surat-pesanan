import opdStampFallback from './assets/dinas-perpustakaan-stamp.svg';
async function makeStampTransparent(url){
  if(!url)return '';
  try{
    const response=await fetch(url,{mode:'cors',cache:'no-store'});
    if(!response.ok)throw new Error('Gagal membaca gambar stempel');
    const bitmap=await createImageBitmap(await response.blob());
    const canvas=document.createElement('canvas');
    canvas.width=bitmap.width;canvas.height=bitmap.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(bitmap,0,0);bitmap.close?.();
    const image=ctx.getImageData(0,0,canvas.width,canvas.height);
    const px=image.data;
    for(let i=0;i<px.length;i+=4){
      if(px[i+3]===0)continue;
      const max=Math.max(px[i],px[i+1],px[i+2]);
      const min=Math.min(px[i],px[i+1],px[i+2]);
      const chroma=max-min;
      const light=(px[i]+px[i+1]+px[i+2])/3;
      if(chroma<34&&light>72)px[i+3]=0;
      else if(chroma<52&&light>112)px[i+3]=Math.round(px[i+3]*Math.max(0,Math.min(1,(chroma-34)/18)));
    }
    ctx.putImageData(image,0,0);
    let minX=canvas.width,minY=canvas.height,maxX=-1,maxY=-1;
    for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){const alpha=px[(y*canvas.width+x)*4+3];if(alpha>12){if(x<minX)minX=x;if(y<minY)minY=y;if(x>maxX)maxX=x;if(y>maxY)maxY=y;}}
    if(maxX>=minX&&maxY>=minY){
      const pad=Math.max(2,Math.round(Math.max(maxX-minX+1,maxY-minY+1)*.025));
      const sx=Math.max(0,minX-pad),sy=Math.max(0,minY-pad),sw=Math.min(canvas.width-sx,maxX-minX+1+pad*2),sh=Math.min(canvas.height-sy,maxY-minY+1+pad*2);
      const cropped=document.createElement('canvas');cropped.width=sw;cropped.height=sh;
      cropped.getContext('2d').drawImage(canvas,sx,sy,sw,sh,0,0,sw,sh);
      return cropped.toDataURL('image/png');
    }
    return canvas.toDataURL('image/png');
  }catch(error){console.warn('Stempel tetap memakai gambar asli:',error);return url;}
}
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
  const d = s.data, goods = (items.data || []).filter(x=>String(x.nama_barang||'').trim()), vendors = providers.data || [], prices = refs.data || [], files = (docs.data || []).filter(x=>!String(x.kategori||'').startsWith('Bukti Reviu - ')), signers = officials.data || [];
  let letterheadUrl='',stampUrl='';
  if(d.opd_id){
    const {data:opd,error:opdError}=await db.from('opd').select('kop_surat_path,stempel_path').eq('id',d.opd_id).maybeSingle();
    if(opdError) throw opdError;
    if(opd?.kop_surat_path){const signed=await db.storage.from('kop-surat').createSignedUrl(opd.kop_surat_path,300);letterheadUrl=signed.data?.signedUrl||'';}if(opd?.stempel_path){const signedStamp=await db.storage.from('tanda-tangan').createSignedUrl(opd.stempel_path,300);stampUrl=signedStamp.data?.signedUrl||'';}
  }
  if(!stampUrl&&String(d.nama_opd_snapshot||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim()==='DINAS PERPUSTAKAAN DAN ARSIP')stampUrl=opdStampFallback;
  if(stampUrl)stampUrl=await makeStampTransparent(stampUrl);
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
    const signatureSrc=p.signature_url||defaultOfficialSignature(p);
    const stamped=role==='PPK'&&stampUrl;return '<div class="signature-cell"><div class="signature-role">'+esc(p.jabatan_snapshot || p.peran)+'</div><div class="signature-space'+(stamped?' ppk-stamped':'')+'">'+(signatureSrc?'<img class="signature-ink" src="'+signatureSrc+'" alt="Tanda tangan '+esc(p.nama_snapshot)+'">':'')+(stamped?'<img class="official-stamp" src="'+stampUrl+'" alt="Stempel OPD">':'')+'</div><b>'+esc(p.nama_snapshot)+'</b>'+(p.nip_snapshot?'<br>NIP. '+esc(p.nip_snapshot):'')+'</div>';
  };
  const esc = v => String(v ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rp = v => v == null || v === '' ? '—' : new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(v));
  const rows = goods.map((x,i) => '<tr><td>'+(i+1)+'</td><td>'+esc(x.nama_barang)+'</td><td>'+esc(x.spesifikasi)+(x.foto_signed_url?'<div class="product-photo-wrap"><img class="product-photo" src="'+x.foto_signed_url+'" alt="Foto '+esc(x.nama_barang)+'"></div>':'')+'</td><td>'+esc(x.volume)+'</td><td>'+esc(x.satuan)+'</td><td class="amount-cell">'+rp(x.pagu_dpa_rka)+'</td><td class="amount-cell">'+rp(x.harga_satuan)+'</td><td class="amount-cell">'+rp(Number(x.volume)*Number(x.harga_satuan))+'</td></tr>').join('');
  const similarProductSections=goods.map((g,i)=>{
    const similar=prices.filter(x=>x.detail_barang_id===g.id&&String(x.sumber_referensi||'').trim()==='Produk sejenis berdasarkan spesifikasi').map(x=>{const parts=String(x.nama_produk||'').split(' — ');return {merek:parts.shift()||'',spesifikasi:parts.join(' — '),harga:x.harga};}).filter(x=>[x.merek,x.spesifikasi,x.harga].some(v=>String(v??'').trim()));
    const excluded=/(\\b(atk|alat tulis kantor|pulpen|pena|pensil|kertas|map|ordner|amplop|spidol|stapler|isi staples|tinta isi ulang|konsumsi|makan|minum|makanan|minuman|snack|kudapan|air mineral|kopi|teh|gula|sembako)\\b)/i.test(String(g.nama_barang||''));
    if(!similar.length||excluded)return '';
    const rows=similar.map(x=>'<tr><td class="center">'+(i+1)+'</td><td>'+esc(g.nama_barang)+'</td><td>'+esc(x.merek||'—')+'</td><td>'+esc(x.spesifikasi||'—')+'</td><td class="amount-cell">'+rp(x.harga)+'</td></tr>').join('');
    return '<section class="similar-product-section"><h4>REKOMENDASI PRODUK PEMBANDING BERDASARKAN SPESIFIKASI</h4><p><b>Barang: '+esc(g.nama_barang)+'</b>. Produk berikut merupakan informasi produk sejenis/pembanding berdasarkan spesifikasi dan harga yang diinput, bukan penetapan penyedia maupun pemenang pengadaan.</p><table class="data-table similar-product-table"><colgroup><col style="width:6%"><col style="width:14%"><col style="width:25%"><col style="width:37%"><col style="width:18%"></colgroup><thead><tr><th>No.</th><th>Nama Barang</th><th>Produk Sejenis (Merek/Model)</th><th>Spesifikasi</th><th>Harga Satuan</th></tr></thead><tbody>'+rows+'</tbody></table></section>';
  }).join('');
  const recommendationSections=goods.map((g,i)=>{
    let meta={};
    try{if(String(g.keterangan||'').startsWith('__PBJ_META__:'))meta=JSON.parse(String(g.keterangan).slice(13));}catch{}
    const chosen=g.produk_rekomendasi||meta.rekomendasi_produk;
    if(!chosen||(!String(chosen.merek||'').trim()&&!String(chosen.spesifikasi||'').trim()))return '';
    const recommendedName=String(chosen.merek||'').trim()||String(chosen.spesifikasi||'').trim();
    return '<section class="recommendation-product-section"><h4>PERTIMBANGAN DAN REKOMENDASI PRODUK</h4><p>Berdasarkan kesesuaian spesifikasi teknis dan kewajaran harga, dengan memperhatikan prinsip efisien dan efektif serta ketentuan penggunaan Produk Dalam Negeri dan UMK, direkomendasikan produk <strong class="recommended-product-name">'+esc(recommendedName)+'</strong>.</p><p>Usulan produk tersebut selanjutnya menjadi bahan reviu Pejabat Pengadaan untuk memastikan kesesuaian spesifikasi, harga, dan ketentuan pengadaan barang/jasa sebelum proses pengadaan dilanjutkan.</p></section>';
  }).join('');
  const vendorProductIndex=v=>{const raw=Number.isInteger(v.reference_detail?.product_index)?v.reference_detail.product_index:0;return goods.length?Math.min(Math.max(raw,0),goods.length-1):0;};
  const classifiedProviders=vendors.filter(v=>['PDN','TKDN'].includes(v.reference_detail?.jenis_produk));
  const pdnSummaryHtml=classifiedProviders.length
    ?'<p>Produk dalam negeri berdasarkan referensi harga: '+classifiedProviders.length+' referensi penyedia teridentifikasi sebagai PDN/TKDN.</p><ul class="pdn-detail-list">'+classifiedProviders.map(v=>{const x=v.reference_detail||{};const pi=vendorProductIndex(v);if(x.jenis_produk==='PDN')return '<li><b>'+esc(goods[pi]?.nama_barang||'Produk')+' — '+esc(v.nama_penyedia)+'</b>: PDN.</li>';const hasTkdn=x.nilai_tkdn!==null&&x.nilai_tkdn!==undefined&&x.nilai_tkdn!=='';const hasBmp=x.nilai_bmp!==null&&x.nilai_bmp!==undefined&&x.nilai_bmp!=='';const total=(hasTkdn?Number(x.nilai_tkdn)||0:0)+(hasBmp?Number(x.nilai_bmp)||0:0);const details=[hasTkdn?'TKDN '+esc(x.nilai_tkdn)+'%':'',hasBmp?'BMP '+esc(x.nilai_bmp):'',hasTkdn||hasBmp?'TKDN + BMP '+total.toFixed(2).replace(/\.?0+$/,'')+'%':''].filter(Boolean);return '<li><b>'+esc(goods[pi]?.nama_barang||'Produk')+' — '+esc(v.nama_penyedia)+'</b>: TKDN'+(details.length?' ('+details.join('; ')+')':' (nilai belum diisi)')+'.</li>';}).join('')+'</ul>'
    :'<p>Produk dalam negeri berdasarkan referensi harga: Belum ada penyedia yang ditandai PDN atau TKDN.</p>';
  const providerGroups=goods.map((g,i)=>{
    const group=vendors.filter(v=>vendorProductIndex(v)===i);
    if(!group.length)return '';
    const rows=group.map((v,j)=>{const rawLink=String(v.reference_detail?.link_produk||'').trim();let productUrl='';try{const parsed=new URL(rawLink);if(parsed.protocol==='http:'||parsed.protocol==='https:')productUrl=parsed.href;}catch{}const qrUrl=productUrl?'https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=4&data='+encodeURIComponent(productUrl):'';return '<tr><td>'+(j+1)+'</td><td>'+esc(g.nama_barang)+'</td><td>'+esc(v.nama_penyedia)+'</td><td>'+esc(v.reference_detail?.lokasi||'—')+'</td><td class="qr-cell">'+(qrUrl?'<img class="product-qr" src="'+qrUrl+'" alt="QR Code produk '+esc(v.nama_penyedia)+'">':'—')+'</td><td class="product-link-cell">'+(productUrl?'<a href="'+esc(productUrl)+'">'+esc(productUrl)+'</a>':'—')+'</td></tr>'}).join('');
    return '<div class="vendor-product-group"><h4>Produk '+(i+1)+' — '+esc(g.nama_barang)+'</h4><table class="data-table vendor-list-table"><colgroup><col style="width:5%"><col style="width:17%"><col style="width:18%"><col style="width:16%"><col style="width:10%"><col style="width:34%"></colgroup><thead><tr><th>No.</th><th>Nama Barang</th><th>Nama Penyedia</th><th>Lokasi</th><th>QR Code</th><th>Link Produk E-Katalog INAPROC</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
  }).join('');
  const providerSummaryRows=goods.map((g,i)=>{const group=vendors.filter(v=>vendorProductIndex(v)===i);if(!group.length)return '';const rows=group.map((v,j)=>'<tr><td>'+(j+1)+'</td><td>'+esc(g.nama_barang)+'</td><td>'+esc(v.nama_penyedia)+'</td><td>'+rp(v.reference_detail?.harga_satuan)+'</td><td>'+esc(v.reference_detail?.lokasi||'—')+'</td><td>'+esc(v.reference_detail?.kesesuaian||'Belum diisi')+'</td><td>'+esc(v.reference_detail?.prioritas||'Belum diisi')+'</td></tr>').join('');return '<div class="provider-product-group"><h4>Produk '+(i+1)+' — '+esc(g.nama_barang)+'</h4><table class="data-table provider-summary-table"><thead><tr><th>No.</th><th>Nama Barang</th><th>Nama Penyedia</th><th>Harga E-Katalog</th><th>Lokasi</th><th>Kesesuaian</th><th>Prioritas</th></tr></thead><tbody>'+rows+'</tbody></table></div>'}).join('');
 const priceCalculations=goods.map((g,i)=>{
   const refs=vendors.filter(v=>vendorProductIndex(v)===i);
   const vals=refs.map(v=>Number(v.reference_detail?.harga_satuan||0)).filter(n=>n>0);
   const valid=vals.filter(n=>n>0);
   const unitHps=valid.length?Math.round(valid.reduce((a,b)=>a+b,0)/valid.length):Number(g.harga_satuan||0);
   const quantity=Number(g.volume||0);
   return {refs,vals,unitHps,quantity,lineTotal:unitHps*quantity};
 });
 const totalHps=priceCalculations.reduce((sum,x)=>sum+x.lineTotal,0);
 const priceTable='<h3>D. Perbandingan Harga dan Perhitungan HPS</h3>'+goods.map((g,i)=>{const calc=priceCalculations[i];const rows=calc.refs.map((v,j)=>'<tr><td>'+(j+1)+'</td><td>'+esc(v.nama_penyedia)+'</td><td class="amount-cell">'+rp(v.reference_detail?.harga_satuan)+'</td><td>'+esc(v.reference_detail?.lokasi||'—')+'</td><td>'+esc(v.reference_detail?.kesesuaian||'—')+'</td><td>'+esc(v.reference_detail?.prioritas||'—')+'</td></tr>').join('');return '<div class="price-product-block"><h4>Produk '+(i+1)+' — '+esc(g.nama_barang)+'</h4><table class="data-table price-comparison"><thead><tr><th>No.</th><th>Nama Penyedia</th><th>Harga Hasil Survei E-Katalog</th><th>Lokasi</th><th>Kesesuaian</th><th>Prioritas</th></tr></thead><tbody>'+rows+'</tbody><tfoot><tr><th colspan="2">HPS Satuan Produk</th><th class="amount-cell">'+rp(calc.unitHps)+'</th><th colspan="3">Jumlah HPS ('+esc(g.volume)+' '+esc(g.satuan)+'): '+rp(calc.lineTotal)+'</th></tr></tfoot></table></div>'}).join('')+'<div class="total-hps-block"><table class="data-table total-hps-table"><tbody><tr><th>TOTAL HPS SELURUH PRODUK</th><th class="amount-cell">'+rp(totalHps)+'</th></tr></tbody></table></div>';
  const vendorEvidence=vendors.filter(v=>v.reference_photo_url);
  const vendorPhotoPages=[];
  for(let i=0;i<vendorEvidence.length;i+=2){
    const pair=vendorEvidence.slice(i,i+2);
    const cards=pair.map((v,index)=>'<div class="vendor-evidence-item"><div class="vendor-evidence-info"><b>'+String.fromCharCode(65+i+index)+'. '+esc(goods[vendorProductIndex(v)]?.nama_barang||'Produk')+' — '+esc(v.nama_penyedia)+'</b><span>Harga satuan: '+rp(v.reference_detail?.harga_satuan)+'</span><span>Sumber: '+(v.reference_detail?.link_produk?'<a href="'+esc(v.reference_detail.link_produk)+'">Lihat produk INAPROC</a>':'—')+'</span></div><div class="vendor-evidence-image"><img src="'+esc(v.reference_photo_url)+'" alt="Referensi '+esc(v.nama_penyedia)+'"></div></div>').join('');
    vendorPhotoPages.push('<section class="page vendor-evidence"><h2>LAMPIRAN REFERENSI PENYEDIA</h2><div class="vendor-evidence-grid">'+cards+'</div></section>');
  }
  const vendorPhotoPagesHtml=vendorPhotoPages.join('');
  const priorityAttachmentCategories=['DPA / RKA','Data SIRUP'];
  const priorityAttachmentRank=f=>{const i=priorityAttachmentCategories.indexOf(String(f.kategori||'').trim());return i<0?99:i;};
  const isPriorityAttachment=f=>priorityAttachmentRank(f)<99;
  const isPdnAttachment=f=>/PDN|PRODUK DALAM NEGERI/i.test(String(f.kategori||'')+' '+String(f.nama_file||''));
  const isOtherDocsAttachment=f=>String(f.kategori||'').trim().toLowerCase()==='dokumen lainnya';
  const attachmentItems = files.filter(f=>f.signed_url&&(/^image\//i.test(f.mime_type||'')||/\.(jpe?g|png|webp)$/i.test(f.nama_file||'')));
  const buildImageAttachmentPages=(items)=>{const pages=[];for(let i=0;i<items.length;i+=2){const pair=items.slice(i,i+2);const slots=pair.map(f=>'<div class="attachment-slot"><h2 class="attachment-label">LAMPIRAN '+esc(String(f.kategori||'DOKUMEN PENDUKUNG').toUpperCase())+'</h2><img src="'+esc(f.signed_url)+'" alt="'+esc(f.nama_file)+'"></div>').join('');pages.push('<section class="page attachment-page '+(pair.length===1?'single':'double')+'">'+slots+'</section>');}return pages.join('');};
  const priorityImagePagesHtml=priorityAttachmentCategories.map(category=>buildImageAttachmentPages(attachmentItems.filter(f=>String(f.kategori||'').trim()===category))).join('');
  const attachmentPagesHtml=buildImageAttachmentPages(attachmentItems.filter(f=>!isPriorityAttachment(f)&&!isPdnAttachment(f)&&!isOtherDocsAttachment(f)))+buildImageAttachmentPages(attachmentItems.filter(f=>!isPriorityAttachment(f)&&isPdnAttachment(f)&&!isOtherDocsAttachment(f)))+buildImageAttachmentPages(attachmentItems.filter(f=>!isPriorityAttachment(f)&&isOtherDocsAttachment(f)));
  const pdfAttachmentItems=files.filter(f=>f.signed_url&&((f.mime_type||'').toLowerCase().includes('pdf')||/\.pdf$/i.test(f.nama_file||''))).sort((a,b)=>priorityAttachmentRank(a)-priorityAttachmentRank(b)||(isOtherDocsAttachment(a)?1:0)-(isOtherDocsAttachment(b)?1:0)||(isPdnAttachment(a)?1:0)-(isPdnAttachment(b)?1:0));
  const pdfAttachmentPagesHtml=pdfAttachmentItems.map((f,i)=>'<div class="pdf-attachment-source" data-pdf-url="'+esc(f.signed_url)+'" data-pdf-title="'+esc(f.kategori||'DOKUMEN PENDUKUNG')+'" data-pdf-name="'+esc(f.nama_file||('Lampiran '+(i+1)))+'" data-pdf-priority="'+(isPriorityAttachment(f)?'true':'false')+'"></div>').join('');
  const pdfRendererScript='<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"><\/script><script>(function(){window.__pdfAttachmentReady=(async function(){var sources=Array.from(document.querySelectorAll(".pdf-attachment-source"));if(!sources.length)return true;if(!window.pdfjsLib)throw new Error("Pustaka pembaca PDF tidak berhasil dimuat. Periksa koneksi internet lalu cetak ulang.");pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";var priorityCursor=document.getElementById("priority-attachments-anchor");for(var source of sources){var pdf=await pdfjsLib.getDocument({url:source.dataset.pdfUrl}).promise;for(var pageNo=1;pageNo<=pdf.numPages;pageNo++){var page=await pdf.getPage(pageNo);var base=page.getViewport({scale:1});var viewport=page.getViewport({scale:Math.min(4,2600/base.width,4200/base.height)});var canvas=document.createElement("canvas");var context=canvas.getContext("2d");canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:context,viewport:viewport}).promise;var section=document.createElement("section");section.className="page uploaded-pdf-page";section.setAttribute("aria-label",source.dataset.pdfTitle+" — "+source.dataset.pdfName+" — halaman "+pageNo+" dari "+pdf.numPages);section.appendChild(canvas);var anchor=source.dataset.pdfPriority==="true"?document.getElementById("priority-attachments-anchor"):null;if(anchor&&priorityCursor&&priorityCursor.parentNode){priorityCursor.parentNode.insertBefore(section,priorityCursor.nextSibling);priorityCursor=section;}else document.body.insertBefore(section,source);}}sources.forEach(function(source){source.remove();});return true;})().catch(function(error){document.querySelectorAll(".pdf-attachment-source").forEach(function(source){var warning=document.createElement("section");warning.className="page uploaded-pdf-page";warning.textContent="Gagal menampilkan lampiran PDF: "+(error&&error.message?error.message:String(error));var anchor=source.dataset.pdfPriority==="true"?document.getElementById("priority-attachments-anchor"):null;if(anchor&&anchor.parentNode)anchor.parentNode.insertBefore(warning,anchor.nextSibling);else document.body.insertBefore(warning,source);source.remove();});return false;});})();<\/script>';
  const reviewData = review.data;
  const reviewRows = (Array.isArray(reviewData?.hasil_reviu)?reviewData.hasil_reviu:[]).map((x,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(x.judul)+'<br><small>'+esc(x.pertanyaan)+'</small></td><td>'+esc(({sesuai:'Sesuai',tidak_sesuai:'Tidak sesuai',perlu_dilengkapi:'Perlu dilengkapi',tidak_diperiksa:'Tidak diperiksa',belum_diperiksa:'Belum diperiksa'})[x.status]||x.status)+'</td><td>'+esc(x.catatan)+'</td></tr>').join('');
  const meta = [['Program',d.program],['Kegiatan',d.kegiatan],['Sub Kegiatan',d.subkegiatan],['Kode Rekening',d.kode_rekening],['Uraian Belanja',d.uraian_belanja],['Nilai Pagu',rp(d.nilai_pagu)],['Nilai HPS',rp(d.nilai_hps)],['Waktu Pengadaan',d.waktu_pengadaan],['Kualifikasi Penyedia',d.kualifikasi_penyedia],['Kode RUP',d.kode_rup]].map(x=>'<tr><th>'+esc(x[0])+'</th><td class="meta-colon">:</td><td class="meta-value">'+esc(x[1])+'</td></tr>').join('');
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>Dokumen '+esc(d.nama_paket)+'</title><style>@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#111}body{font-family:"Bookman Old Style","Bookman",serif;font-size:11pt;line-height:1.18}.page{width:210mm;height:297mm;min-height:297mm;margin:0 auto;padding:12mm 17mm 14mm;page-break-after:always;break-after:page;position:relative;background:#fff;overflow:hidden}.page.content-page,.page.provider-summary{height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important;display:block!important;break-inside:auto!important;page-break-inside:auto!important;break-after:page;page-break-after:always}.content-page table,.provider-summary table{width:100%;break-inside:auto!important;page-break-inside:auto!important;border-collapse:collapse}.content-page thead,.provider-summary thead{display:table-header-group}.content-page tfoot,.provider-summary tfoot{display:table-footer-group}.content-page tr,.provider-summary tr{break-inside:avoid!important;page-break-inside:avoid!important}.content-page h2,.content-page h3,.content-page h4,.provider-summary h2{break-after:avoid;page-break-after:avoid}.content-page .similar-product-section,.content-page .vendor-product-group,.provider-summary .provider-product-group{break-inside:avoid!important;page-break-inside:avoid!important;-webkit-column-break-inside:avoid}.content-page .similar-product-section h4,.content-page .vendor-product-group h4,.provider-summary .provider-product-group h4{break-after:avoid!important;page-break-after:avoid!important;margin:3mm 0 2mm}.content-page .price-product-block,.content-page .total-hps-block{break-inside:avoid!important;page-break-inside:avoid!important;-webkit-column-break-inside:avoid}.content-page{ -webkit-box-decoration-break:clone;box-decoration-break:clone}.content-page .price-comparison tfoot{display:table-row-group;break-inside:avoid!important;page-break-inside:avoid!important}.content-page .total-hps-table{margin-top:2mm;break-inside:avoid!important;page-break-inside:avoid!important}.page:last-child{page-break-after:auto;break-after:auto}h1,h2{text-align:center;margin:0 0 8mm;font-weight:bold}h1{font-size:16pt}h2{font-size:14pt}h3{font-size:12pt;margin:7mm 0 3mm}p{margin:0 0 4mm;text-align:justify}.head{display:block;width:100%;margin:0 0 5mm;padding:0;border:0;text-align:center;font-size:10pt;line-height:1.1}.head-image{display:block;width:100%;margin:0 0 5mm}.head-image img{display:block;width:100%;height:auto;max-height:48mm;object-fit:fill;margin:0 auto}.head-fallback{width:100%;text-align:center;border-bottom:1.2mm double #111;padding:0 0 3mm;margin:0 0 5mm}.head-fallback b{font-size:12pt}.head-fallback .agency{font-size:16pt;font-weight:bold}.letter-title{text-align:center;font-size:11pt;margin:0 0 0.5mm}.letter-no{text-align:center;font-weight:bold;font-size:10pt;margin:0 0 5mm;white-space:pre-wrap;word-spacing:normal;letter-spacing:0.3mm;min-height:6mm}.letter-meta{margin:0 0 5mm}.letter-meta p{display:grid;grid-template-columns:22mm 4mm minmax(0,1fr);column-gap:0;text-align:left;margin:0 0 1mm;align-items:start}.letter-meta p span:nth-child(2){text-align:center}.address{margin:0 0 5mm;line-height:1.08}.body-copy{text-indent:10mm}.meta{width:100%;table-layout:fixed;border-collapse:collapse;margin:1mm 0 4mm;font-size:11pt}.meta td,.meta th{border:0;padding:0.35mm 0.5mm;vertical-align:top;background:transparent;line-height:1.08}.meta th{width:31%;font-weight:normal;text-align:left}.meta .meta-colon{width:4mm;text-align:center;padding-left:0;padding-right:0}.meta .meta-value{width:auto;text-align:left;overflow-wrap:anywhere;word-break:normal} .pdn-priority-section{display:block;margin:4mm 0 5mm;break-inside:avoid!important;page-break-inside:avoid!important;-webkit-column-break-inside:avoid}.pdn-priority-section h3{margin:0 0 3mm;break-after:avoid!important;page-break-after:avoid!important}.pdn-priority-section p{margin:0 0 2mm}.pdn-detail-list{margin:2mm 0 3mm 5mm;padding-left:5mm}.pdn-detail-list li{margin:0 0 1.5mm;line-height:1.25}.pdn-detail-list b{font-weight:700}.similar-product-table{font-size:9pt;line-height:1.12}.similar-product-table th,.similar-product-table td{padding:1.6mm 1.4mm;vertical-align:top}.similar-product-table th:first-child,.similar-product-table td:first-child{text-align:center;white-space:nowrap}.similar-product-table th:last-child,.similar-product-table td:last-child{white-space:nowrap;overflow-wrap:normal;word-break:keep-all}.similar-product-table .amount-cell{text-align:right}.recommendation-product-section{margin:4mm 0 5mm;padding:3mm 4mm;border-left:1.2mm solid #173e64;background:#f6f8fb;break-inside:avoid;page-break-inside:avoid}.recommendation-product-section h4{margin:0 0 2mm;font-size:11pt}.recommendation-product-section p{margin:0 0 2mm}.recommendation-product-section p:last-child{margin-bottom:0}.recommended-product-name{font-weight:900;font-size:12pt;letter-spacing:.15px}.data-table{width:100%;max-width:100%;table-layout:fixed;border-collapse:collapse;font-size:11pt;margin:3mm 0 7mm;overflow-wrap:anywhere;word-break:break-word}.data-table td,.data-table th{overflow-wrap:anywhere;word-break:break-word}.provider-summary-table th,.provider-summary-table td{padding:2.2mm 1.5mm;font-size:11pt;line-height:1.15}.provider-summary .sign{margin-top:8mm}.data-table td,.data-table th{border:1px solid #333;padding:2mm;vertical-align:top}.data-table th{background:#f2f2f2;text-align:center}.specification-table{table-layout:fixed}.specification-table th,.specification-table td{padding:1.7mm 1.2mm;font-size:10pt;line-height:1.15}.specification-table th.volume-heading{white-space:nowrap;word-break:keep-all;overflow-wrap:normal}.vendor-list-table{table-layout:fixed}.vendor-list-table th:first-child,.vendor-list-table td:first-child{text-align:center;white-space:nowrap}.vendor-list-table .qr-cell{text-align:center;vertical-align:middle}.product-qr{display:block;width:25mm;height:25mm;max-width:100%;object-fit:contain;margin:0 auto}.product-link-cell{font-size:8.5pt;line-height:1.15;overflow-wrap:anywhere;word-break:break-all}.product-link-cell a{color:#00e;text-decoration:underline}.price-comparison{font-size:9pt;table-layout:fixed}.price-comparison th,.price-comparison td{padding:1.5mm 1mm;font-size:9pt;line-height:1.12}.price-comparison th:first-child,.price-comparison td:first-child{width:7%;text-align:center;white-space:nowrap}.price-comparison th:nth-child(2),.price-comparison td:nth-child(2){width:23%}.price-comparison th:nth-child(3),.price-comparison td:nth-child(3){width:18%}.price-comparison th:nth-child(4),.price-comparison td:nth-child(4){width:17%}.price-comparison th:nth-child(5),.price-comparison td:nth-child(5){width:18%}.price-comparison th:nth-child(6),.price-comparison td:nth-child(6){width:17%}.price-comparison .amount-cell{white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums}.vendor-list-table th,.vendor-list-table td{overflow-wrap:anywhere;word-break:normal}.specification-table .amount-cell{white-space:nowrap;word-break:normal;overflow-wrap:normal;text-align:right;font-size:9pt;font-variant-numeric:tabular-nums}.specification-table td:nth-child(4),.specification-table td:nth-child(5){white-space:nowrap;text-align:center} .product-photo-wrap{width:100%;margin:4mm 0 1mm;text-align:center;break-inside:avoid}.product-photo{display:block;width:100%;max-width:100%;height:auto;max-height:110mm;object-fit:contain;margin:0 auto;break-inside:avoid}.sign{display:flex;justify-content:space-between;align-items:flex-start;gap:18mm;text-align:center;margin:5mm 0 0;break-inside:avoid;page-break-inside:avoid}.sign .signature-cell{width:50%;min-width:0;font-size:11pt;line-height:1.15}.signature-role{min-height:5mm}.signature-space{width:44mm;height:15mm;margin:0 auto;display:flex;align-items:center;justify-content:center;overflow:hidden}.signature-space img{display:block!important;width:42mm!important;height:12mm!important;max-width:none!important;max-height:none!important;object-fit:contain!important;object-position:center center;margin:0 auto}.signature-space.ppk-stamped{position:relative;width:44mm;height:15mm;overflow:visible}.signature-space.ppk-stamped img.signature-ink{position:relative;z-index:2;width:42mm!important;height:12mm!important;object-fit:contain!important}.signature-space.ppk-stamped img.official-stamp{position:absolute!important;z-index:5;left:50%;top:100%;transform:translate(-50%,-50%) rotate(-5deg);width:40mm!important;height:40mm!important;max-width:none!important;max-height:none!important;object-fit:contain!important;opacity:.72;mix-blend-mode:multiply;filter:saturate(1.2) contrast(1.08);pointer-events:none}.signature-space img.ppbj-signature{width:42mm!important;height:15mm!important;object-fit:contain!important}.note{font-size:9pt}.placeholder{border:1px dashed #777;padding:12px;margin-top:15px}.vendor-evidence{padding:12mm 17mm 14mm}.vendor-evidence h2{font-size:13pt;margin:0 0 5mm;padding-bottom:2mm;border-bottom:1px solid #333}.vendor-evidence-grid{height:258mm;display:flex;flex-direction:column;gap:5mm}.vendor-evidence-item{height:calc((258mm - 5mm)/2);min-height:0;display:flex;flex-direction:column;overflow:hidden;border-bottom:1px solid #c7cdd5;padding:0 0 3mm}.vendor-evidence-info{display:flex;flex-direction:column;gap:1.5mm;font-size:9pt;line-height:1.15;margin-bottom:2mm}.vendor-evidence-info b{font-size:10pt}.vendor-evidence-image{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;overflow:hidden}.vendor-evidence-image img{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;margin:auto}.page.uploaded-pdf-page{width:210mm!important;height:297mm!important;min-height:297mm!important;max-height:297mm!important;margin:0 auto!important;padding:0!important;display:flex!important;flex-direction:row!important;align-items:center!important;justify-content:center!important;overflow:hidden!important;box-sizing:border-box!important;break-after:page!important;page-break-after:always!important}.uploaded-pdf-page canvas{display:block;flex:0 0 auto;max-width:210mm!important;max-height:297mm!important;width:auto!important;height:auto!important;object-fit:contain;image-rendering:auto}.attachment-page{display:flex;flex-direction:column;align-items:stretch;justify-content:space-evenly;gap:5mm;padding:12mm 17mm 14mm}.attachment-page .attachment-slot{width:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;break-inside:avoid}.attachment-page .attachment-label{width:100%;font-size:13pt;text-align:center;font-weight:bold;margin:0 0 4mm;padding:0 0 2mm;border-bottom:1px solid #333}.attachment-page.double .attachment-slot{height:132mm}.attachment-page.double .attachment-slot img{display:block;width:100%;height:112mm;object-fit:contain;object-position:center;margin:0 auto}.attachment-page.single .attachment-slot{height:271mm}.attachment-page.single .attachment-slot img{display:block;width:100%;height:250mm;object-fit:contain;object-position:center;margin:0 auto}@media screen{body{background:#e8ebef}.page{margin:10mm auto;box-shadow:0 2px 12px #0002}}@media print{body{background:#fff}.page{margin:0;box-shadow:none;min-height:297mm}}</style></head><body>'+
  '<section class="page">'+(letterheadUrl?'<div class="head-image"><img src="'+letterheadUrl+'" alt="Kop surat '+esc(d.nama_opd_snapshot)+'"></div>':'<div class="head-fallback"><b>PEMERINTAH KABUPATEN LABUHANBATU SELATAN</b><br><span class="agency">'+esc(d.nama_opd_snapshot)+'</span><br>'+esc(d.alamat_opd_snapshot)+'</div>')+'<h1 class="letter-title">SURAT PESANAN</h1><div class="letter-no">NOMOR : '+esc(d.nomor_surat||'       /              /             /              /2026')+'</div><div class="letter-meta"><p><span>Lampiran</span><span>:</span><span>1 (Satu) Lembar</span></p><p><span>Perihal</span><span>:</span><span>Permohonan '+esc(d.uraian_belanja||d.nama_paket)+'</span></p></div><div class="address">Kepada Yth :<br>Sdr. Pejabat Pengadaan '+esc(d.nama_opd_snapshot)+'<br>Kabupaten Labuhanbatu Selatan<br>Di_<br>Tempat</div><p>Dengan Hormat,</p><p class="body-copy">Dalam rangka mendukung pelaksanaan kegiatan operasional, kami bermaksud untuk melakukan Permohonan Pengadaan : '+esc(d.uraian_belanja||d.nama_paket)+' melalui belanja '+esc(d.metode_pengadaan||'e-katalog')+'.</p><p class="body-copy">Adapun Permohonan Pengadaan : '+esc(d.uraian_belanja||d.nama_paket)+' ini telah dialokasikan dalam:</p><table class="meta">'+meta+'</table><p class="body-copy">Adapun jenis barang beserta spesifikasi teknis yang dibutuhkan (terlampir)</p><p class="body-copy">Demikian permohonan pesanan ini diperbuat untuk dilaksanakan dan dipenuhi, atas kerjasamanya yang baik kami ucapkan terima kasih.</p><p style="text-align:center;margin-top:4mm">Kotapinang, '+(d.tanggal_surat?new Date(d.tanggal_surat+'T00:00:00').toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'}):'................................')+'</p><div class="sign">'+signatureBlock('PPTK')+''+signatureBlock('PPK')+'</div></section><div id="priority-attachments-anchor"></div>'+priorityImagePagesHtml+
  '<section class="page content-page"><h2>LAMPIRAN PERMOHONAN PESANAN</h2><h3>A. Spesifikasi Teknis</h3><table class="data-table specification-table"><colgroup><col style="width:6%"><col style="width:13%"><col style="width:17%"><col style="width:10%"><col style="width:8%"><col style="width:16%"><col style="width:16%"><col style="width:14%"></colgroup><tr><th>No.</th><th>Nama Barang</th><th>Spesifikasi</th><th class="volume-heading">Volume</th><th>Satuan</th><th>Pagu DPA/RKA</th><th>Harga Hasil Survei E-Katalog (HPS Satuan)</th><th>Jumlah HPS</th></tr>'+rows+'</table>'+similarProductSections+recommendationSections+'<section class="pdn-priority-section"><h3>B. Prioritas Produk Dalam Negeri dan UMKM</h3>'+pdnSummaryHtml+'<p>Kualifikasi penyedia: '+esc(d.kualifikasi_penyedia)+'</p></section><h3>C. Data Penyedia</h3>'+providerGroups+'</section>'+
  '<section class="page provider-summary content-page"><h2>RINGKASAN REFERENSI PENYEDIA</h2>'+providerSummaryRows+'<p class="note">Daftar ini merupakan ringkasan referensi penyedia dan bukan penetapan pemenang. Verifikasi, evaluasi, negosiasi, dan penetapan akhir dilakukan oleh pejabat berwenang.</p><div class="sign">'+signatureBlock('PPTK')+''+signatureBlock('PPK')+'</div></section>'+
  vendorPhotoPagesHtml+attachmentPagesHtml+pdfAttachmentPagesHtml+pdfRendererScript+'</body></html>';
  return html;
}

const defaultOfficialSignature=signer=>{const base=import.meta.env.BASE_URL||'/';const name=String(signer?.nama_snapshot||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();const key=name.includes('TRY FATRA KHAZANAH')?'try-fatra-signature.svg':name.includes('RINA ERIANTI ARITONANG')?'rina-signature.svg':name.includes('DEWI HAZRIANI')?'dewi-signature.svg':'';return key?base+key:'';};
const ppbjSignatureData=import.meta.env.BASE_URL+'ali-akbar-signature.png';
export async function buildCoordinationHtml(db,id){
  const [s,review,officials]=await Promise.all([
    db.from('surat').select('*').eq('id',id).single(),
    db.from('reviu').select('*').eq('surat_id',id).order('created_at',{ascending:false}).limit(1).maybeSingle(),
    db.from('surat_pejabat').select('*').eq('surat_id',id).order('created_at')
  ]);
  for(const q of [s,review,officials])if(q.error)throw q.error;
  if(!review.data)throw new Error('Data koordinasi belum tersimpan. Simpan formulir terlebih dahulu.');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const d=s.data,raw=Array.isArray(review.data.hasil_reviu)?review.data.hasil_reviu[0]||{}:{};
  const signers=officials.data||[];
  for(const x of signers)if(x.tanda_tangan_path_snapshot){const q=await db.storage.from('tanda-tangan').createSignedUrl(x.tanda_tangan_path_snapshot,300);x.signature_url=q.data?.signedUrl||'';}
  const date=v=>{if(!v)return '................................';const x=new Date(v+'T00:00:00');return Number.isNaN(x.getTime())?esc(v):x.toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'});};
  const weekday=v=>{if(!v)return '........';const x=new Date(v+'T00:00:00');return Number.isNaN(x.getTime())?'........':x.toLocaleDateString('id-ID',{weekday:'long'});};
  const time=(v)=>v?esc(String(v).includes('WIB')?v:v+' WIB'):'........ WIB';
  const number=raw.nomor_berita_acara_koordinasi||'...../E-PURCHAS/PP/.............../......../2026';
  const meetingDate=raw.tanggal_koordinasi||'';
  const opd=esc(d.nama_opd_snapshot||'................................');
  const packageName=esc(d.nama_paket||'................................');
  const signatureBlock=role=>{
    const p=signers.find(x=>String(x.peran||'').toUpperCase()===role);
    if(!p)return '<div class="signature-cell"><div class="signature-role">'+esc(role==='PPK'?'Pejabat Pembuat Komitmen':'Pejabat Pengadaan')+'</div><div class="signature-space"></div><b>(................................)</b></div>';
    const signatureSrc=p.signature_url||defaultOfficialSignature(p);
    return '<div class="signature-cell"><div class="signature-role">'+esc(p.jabatan_snapshot||p.peran)+'</div><div class="signature-space">'+(signatureSrc?'<img src="'+esc(signatureSrc)+'" alt="Tanda tangan '+esc(p.nama_snapshot)+'">':'')+'</div><b>'+esc(p.nama_snapshot||'')+'</b>'+(p.nip_snapshot?'<br>NIP. '+esc(p.nip_snapshot):'')+'</div>';
  };
  const ppbj='<div class="signature-cell"><div class="signature-role">Pejabat Pengadaan<br>Barang/Jasa</div><div class="signature-space"><img class="ppbj-signature" src="'+ppbjSignatureData+'" alt="Tanda tangan Ali Akbar"></div><b>ALI AKBAR, SE</b><br>NIP. 199203032022031004</div>';
  const paragraph='Pada hari ini, '+weekday(meetingDate)+' tanggal '+date(meetingDate)+', bertempat di Bagian Pengadaan Barang dan Jasa Sekretariat Daerah Kompleks Perkantoran Pemerintah Kabupaten Labuhanbatu Selatan Desa Sosopan Kotapinang, pukul '+time(raw.waktu_mulai)+' sampai dengan pukul '+time(raw.waktu_selesai)+', Pejabat Pengadaan bersama PPK/PPTK dan Tim Ahli/Teknis/Pendukung '+opd+' telah melaksanakan rapat koordinasi untuk mereviu dokumen persiapan pengadaan melalui e-purchasing. Reviu dilaksanakan dengan mengacu pada Peraturan Presiden Nomor 16 Tahun 2018 tentang Pengadaan Barang/Jasa Pemerintah beserta perubahannya dan Peraturan LKPP Nomor 2 Tahun 2026 tentang Katalog Elektronik dalam Pengadaan Barang/Jasa Pemerintah, untuk paket '+packageName+'. Hasil Reviu dapat dilihat sebagaimana terlampir.';
  return '<!doctype html><html><head><meta charset="utf-8"><title>Berita Acara Koordinasi - '+esc(d.nama_paket)+'</title><style>@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#111}body{font-family:Cambria,serif;font-size:11pt;line-height:1.25}.page{width:210mm;height:297mm;margin:0 auto;padding:18mm 16mm 17mm;background:#fff;position:relative;page-break-after:always;break-after:page}.page:last-child{page-break-after:auto;break-after:auto}.title{text-align:center;font-size:12pt;font-weight:bold;margin:0 0 1.5mm}.number{text-align:center;font-size:11pt;margin:0 0 12mm}.body{text-align:justify;text-indent:14mm;margin:0 0 7mm;line-height:1.28}.closing{text-align:justify;text-indent:14mm;margin-top:8mm}.sign{display:flex;justify-content:space-between;align-items:flex-start;gap:18mm;text-align:center;margin:10mm 0 0;break-inside:avoid}.signature-cell{width:50%;min-width:0;font-size:11pt;line-height:1.2}.signature-role{min-height:6mm}.signature-space{width:48mm;height:16mm;margin:0 auto;display:flex;align-items:center;justify-content:center;overflow:hidden}.signature-space img{display:block!important;width:48mm!important;height:14mm!important;max-width:none!important;max-height:none!important;object-fit:contain!important;object-position:center center;margin:0 auto}.small{font-size:10pt}@media screen{body{background:#e8ebef}.page{margin:10mm auto;box-shadow:0 2px 12px #0002}}@media print{body{background:#fff}.page{margin:0;box-shadow:none}}</style></head><body><section class="page"><h1 class="title">BERITA ACARA REVIU E-PURCHASING</h1><div class="number">Nomor: '+esc(number)+'</div><p class="body">'+esc(paragraph)+'</p><p class="closing">Demikian Berita Acara ini dibuat dan merupakan satu kesatuan dan bagian yang tidak terpisahkan dari dokumen pengadaan, untuk selanjutnya dapat dipergunakan sebagaimana mestinya.</p><p style="text-align:center;margin-top:8mm">'+ 'Kotapinang, '+date(meetingDate)+'</p><div class="sign">'+signatureBlock('PPK')+ppbj+'</div></section></body></html>';
  return html;
}
export async function openCoordinationPrint(db,id){
  const html=await buildCoordinationHtml(db,id),w=window.open('','_blank');
  if(!w)throw new Error('Izinkan pop-up browser untuk mencetak berita acara koordinasi.');
  w.document.open();w.document.write(html);w.document.close();
  printDocumentWhenReady(w);
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
  let stampUrl='';if(d.opd_id){const {data:opd,error:opdError}=await db.from('opd').select('stempel_path').eq('id',d.opd_id).maybeSingle();if(opdError)throw opdError;if(opd?.stempel_path){const signed=await db.storage.from('tanda-tangan').createSignedUrl(opd.stempel_path,300);stampUrl=signed.data?.signedUrl||'';}}if(!stampUrl&&String(d.nama_opd_snapshot||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim()==='DINAS PERPUSTAKAAN DAN ARSIP')stampUrl=opdStampFallback;
  if(stampUrl)stampUrl=await makeStampTransparent(stampUrl);
  for(const x of goods)if(x.foto_produk_path){const q=await db.storage.from('foto-produk').createSignedUrl(x.foto_produk_path,300);x.foto_signed_url=q.data?.signedUrl||'';}
  for(const v of vendors){try{v.reference_detail=JSON.parse(v.keterangan||'{}');const path=v.reference_detail.foto_path;if(path){const q=await db.storage.from('dokumen-pendukung').createSignedUrl(path,300);v.reference_photo_url=q.data?.signedUrl||'';}}catch{v.reference_detail={};}}
  for(const x of signers)if(x.tanda_tangan_path_snapshot){const q=await db.storage.from('tanda-tangan').createSignedUrl(x.tanda_tangan_path_snapshot,300);x.signature_url=q.data?.signedUrl||'';}
  const supporting=(documents.data||[]).filter(x=>!['Data SIRUP','DPA / RKA','RKA','SIRUP'].includes(String(x.kategori||'').trim()));for(const x of supporting)if(x.storage_path){const q=await db.storage.from('dokumen-pendukung').createSignedUrl(x.storage_path,300);x.signed_url=q.data?.signedUrl||'';}
  const ppbjSignature='<div class="signature-cell"><div class="signature-role">PEJABAT PENGADAAN BARANG/JASA</div><div class="signature-space"><img class="ppbj-signature" src="'+ppbjSignatureData+'" alt="Tanda tangan Ali Akbar"></div><b>ALI AKBAR, SE</b><br>NIP. 199203032022031004</div>';
  const signatureBlock=role=>{
    const p=signers.find(x=>x.peran===role);
    if(!p)return '<div class="signature-cell">'+esc(role)+'<div class="signature-space"></div><b>(................................)</b></div>';
    const signatureSrc=p.signature_url||defaultOfficialSignature(p);
    const stamped=role==='PPK'&&stampUrl;return '<div class="signature-cell"><div class="signature-role">'+esc(p.jabatan_snapshot||p.peran)+'</div><div class="signature-space'+(stamped?' ppk-stamped':'')+'">'+(signatureSrc?'<img class="signature-ink" src="'+esc(signatureSrc)+'" alt="Tanda tangan '+esc(p.nama_snapshot)+'">':'')+(stamped?'<img class="official-stamp" src="'+esc(stampUrl)+'" alt="Stempel OPD">':'')+'</div><b>'+esc(p.nama_snapshot)+'</b>'+(p.nip_snapshot?'<br>NIP. '+esc(p.nip_snapshot):'')+'</div>';
  };
  const date=v=>{if(!v)return '—';const x=new Date(v+'T00:00:00');return Number.isNaN(x.getTime())?esc(v):x.toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'});};
  const category=(title)=>'<tr class="section-row"><th colspan="4">'+title+'</th></tr>';
  const checks=Array.isArray(r.hasil_reviu)?(r.hasil_reviu[0]||{}):{};
  const reviewRow=(no,title,question,response)=>'<tr><td class="center">'+esc(no)+'</td><td>'+title+'</td><td>'+question+'</td><td>'+response+'</td></tr>';
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
  
  const checkText=(v,fallback)=>v&&String(v).trim()?esc(v):(fallback||'-');
  const vendorIndex=v=>Number.isInteger(v.reference_detail?.product_index)?v.reference_detail.product_index:0;
  const productWorkPages=goods.map((g,i)=>{const refs=vendors.filter(v=>vendorIndex(v)===i);const refRows=refs.map((v,j)=>{const x=v.reference_detail||{};const kind=x.jenis_produk||'Belum diverifikasi';const tkdn=kind==='TKDN'?'<br>Nilai TKDN: '+esc(x.nilai_tkdn||'—')+'%<br>Nilai BMP: '+esc(x.nilai_bmp||'—')+'<br>TKDN + BMP: '+((Number(x.nilai_tkdn)||0)+(Number(x.nilai_bmp)||0)).toFixed(2).replace(/\.?0+$/,'')+'%':'';return '<tr><td class="center">'+(j+1)+'</td><td><b>'+esc(v.nama_penyedia||'—')+'</b>'+(v.reference_photo_url?'<div class="work-photo"><img src="'+esc(v.reference_photo_url)+'" alt="Bukti produk katalog"></div>':'')+'</td><td>'+esc(x.lokasi||v.alamat||'—')+'</td><td class="amount-cell">'+rp(x.harga_satuan)+'</td><td>'+esc(x.kesesuaian||'Belum diisi')+'</td><td>'+esc(x.prioritas||'Belum diisi')+'<br>Jenis: '+esc(kind)+tkdn+'</td><td>'+(x.link_produk?'<a href="'+esc(x.link_produk)+'">Buka produk</a>':'—')+'</td></tr>'}).join('');const prices=refs.map(v=>Number(v.reference_detail?.harga_satuan||0)).filter(n=>n>0);const hps=prices.length?Math.round(prices.reduce((a,b)=>a+b,0)/prices.length):Number(g.harga_satuan||0);return '<section class="page work-page"><h2 class="doc-title">KERTAS KERJA REVIU PRODUK KATALOG ELEKTRONIK</h2><p><b>Produk '+(i+1)+' — '+esc(g.nama_barang)+'</b></p><table class="meta"><tr><th>Nama paket</th><td>'+esc(d.nama_paket)+'</td></tr><tr><th>OPD</th><td>'+esc(d.nama_opd_snapshot)+'</td></tr><tr><th>Spesifikasi</th><td>'+esc(g.spesifikasi||'—')+'</td></tr><tr><th>Volume</th><td>'+esc(g.volume)+' '+esc(g.satuan)+'</td></tr><tr><th>Pagu DPA/RKA Produk</th><td>'+rp(g.pagu_dpa_rka)+'</td></tr><tr><th>Harga Hasil Survei E-Katalog (HPS Satuan)</th><td>'+rp(g.harga_satuan)+'</td></tr><tr><th>Foto / tampilan produk</th><td>'+(g.foto_signed_url?'<div class="work-photo product-work-photo"><img src="'+esc(g.foto_signed_url)+'" alt="'+esc(g.nama_barang)+'"></div>':'Tidak ada foto produk yang diunggah.')+'</td></tr></table><h3>Perbandingan referensi penyedia untuk produk ini</h3><table class="data-table work-table"><thead><tr><th>No.</th><th>Nama Penyedia</th><th>Lokasi</th><th>Harga Hasil Survei E-Katalog</th><th>Kesesuaian</th><th>Prioritas / Status PDN-TKDN</th><th>Referensi</th></tr></thead><tbody>'+(refRows||'<tr><td colspan="7">Belum ada referensi penyedia untuk produk ini.</td></tr>')+'</tbody><tfoot><tr><th colspan="3">HPS Satuan (rata-rata referensi harga yang tersedia)</th><th>'+rp(hps)+'</th><th colspan="3">Jumlah HPS: '+rp(hps*Number(g.volume||0))+'</th></tr></tfoot></table><p class="small-note">Catatan reviu produk: hasil kesesuaian spesifikasi, kewajaran harga, prioritas PDN/TKDN, dan ketersediaan penyedia ditetapkan berdasarkan pemeriksaan aktual oleh Pejabat Pengadaan.</p></section>'}).join('');
  const meta=[
    ['Nomor',((Array.isArray(r.hasil_reviu)&&r.hasil_reviu[0]?.nomor_berita_acara)||'—')],
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
  const reviewImageFiles=supporting.filter(x=>x.signed_url&&(/^image\//i.test(x.mime_type||'')||/\.(jpe?g|png|webp)$/i.test(x.nama_file||'')));
  const reviewAttachmentPages=[];
  reviewImageFiles.forEach((x,i)=>{
    const caption=esc(x.nama_file||'Lampiran '+(i+1));
    const category=esc(x.kategori||'Dokumen pendukung');
    reviewAttachmentPages.push('<section class="page attachment-page review-evidence-page"><h2 class="doc-title">LAMPIRAN DOKUMEN REVIU</h2><div class="review-attachment-card"><div class="review-attachment-caption"><b>'+category+'</b><span>'+caption+'</span></div><div class="review-attachment"><img src="'+esc(x.signed_url)+'" alt="'+caption+'"></div></div></section>');
  });
  const reviewAttachmentsHtml=reviewAttachmentPages.join('');
  return '<!doctype html><html><head><meta charset="utf-8"><title>Berita Acara Reviu '+esc(d.nama_paket)+'</title><style>@page{size:A4 portrait;margin:15mm 15mm 18mm 20mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#17243a}body{font-family:"Cambria",serif;font-size:10.5pt;line-height:1.2}.page{width:auto;min-height:0;margin:0;padding:0;page-break-after:always;break-after:page;position:relative;background:#fff;overflow:visible}.page:last-child{page-break-after:auto;break-after:auto}.doc-title{text-align:center;font-size:14pt;line-height:1.25;font-weight:bold;color:#17365d;margin:0 0 7mm}.meta{width:100%;border-collapse:collapse;margin:0 0 5mm;font-size:10.5pt}.meta th,.meta td{border:0;padding:1.2mm 1mm;text-align:left;vertical-align:top}.meta th{width:24%;font-weight:normal}.meta th:after{content:" :"}.data-table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:8.7pt;line-height:1.08;margin:1.5mm 0 2mm}.data-table th,.data-table td{border:1px solid #52647a;padding:1mm 1.1mm;line-height:1.08;vertical-align:top;overflow-wrap:anywhere;word-break:normal}.page:first-child>.data-table{margin-top:1mm;margin-bottom:2mm}.page:first-child>.data-table tbody tr{break-inside:avoid!important;page-break-inside:avoid!important}.page:first-child>h3,.page:first-child>h3+p{break-inside:avoid;page-break-inside:avoid}.page:first-child>.data-table thead{display:table-header-group}.data-table thead th{background:#17365d;color:#fff;text-align:center;font-weight:bold}.data-table .section-row th{background:#dce6f1;color:#17365d;text-align:left;font-weight:bold}.data-table tfoot th{background:#eaf0f6}.center{text-align:center}.muted{color:#52647a}.product-photo{margin:2mm auto 0;text-align:left}.product-photo img{display:block;max-width:68mm;max-height:48mm;object-fit:contain;object-position:left center}.work-photo{margin:1mm 0;line-height:0}.work-photo img{display:block;width:auto;max-width:22mm;max-height:14mm;object-fit:contain;object-position:left center}.product-work-photo img{max-width:70mm;max-height:55mm}.work-table{font-size:8pt;table-layout:fixed;border-collapse:collapse}.work-table th,.work-table td{padding:1.5mm 1.2mm;vertical-align:top;overflow-wrap:anywhere}.work-table tbody tr{break-inside:avoid;page-break-inside:avoid}.work-table .amount-cell{white-space:nowrap;font-size:7.5pt}.work-table td:nth-child(1),.work-table th:nth-child(1){width:5%;text-align:center}.work-table td:nth-child(2),.work-table th:nth-child(2){width:17%}.work-table td:nth-child(3),.work-table th:nth-child(3){width:11%}.work-table td:nth-child(4),.work-table th:nth-child(4){width:13%}.work-table td:nth-child(5),.work-table th:nth-child(5){width:10%}.work-table td:nth-child(6),.work-table th:nth-child(6){width:25%}.work-table td:nth-child(7),.work-table th:nth-child(7){width:19%}.sign{display:flex;justify-content:space-between;align-items:flex-start;gap:18mm;text-align:center;margin:5mm 0 0;break-inside:avoid}.signature-cell{width:50%;min-width:0;font-size:10.5pt;line-height:1.15}.signature-role{min-height:5mm}.signature-space{width:44mm;height:15mm;margin:0 auto;display:flex;align-items:center;justify-content:center;overflow:hidden}.signature-space img{display:block!important;width:42mm!important;height:12mm!important;max-width:none!important;max-height:none!important;object-fit:contain!important;object-position:center;margin:0 auto}.signature-space.ppk-stamped{position:relative;width:44mm;height:15mm;overflow:visible}.signature-space.ppk-stamped img.signature-ink{position:relative;z-index:2;width:42mm!important;height:12mm!important;object-fit:contain!important}.signature-space.ppk-stamped img.official-stamp{position:absolute!important;z-index:5;left:50%;top:100%;transform:translate(-50%,-50%) rotate(-5deg);width:40mm!important;height:40mm!important;max-width:none!important;max-height:none!important;object-fit:contain!important;opacity:.72;mix-blend-mode:multiply;filter:saturate(1.2) contrast(1.08);pointer-events:none}.signature-space img.ppbj-signature{width:42mm!important;height:12mm!important;object-fit:contain!important}.review-evidence-page{break-inside:avoid;page-break-inside:avoid}.review-attachment-card{break-inside:avoid;page-break-inside:avoid;border:1px solid #cbd5e1;padding:3mm;width:100%}.review-attachment-caption{display:flex;flex-direction:column;gap:1.5mm;margin:0 0 3mm;padding:0 0 2mm;border-bottom:1px solid #cbd5e1;font-size:10pt;overflow-wrap:anywhere}.review-attachment-caption span{font-size:9pt;color:#334155}.review-attachment{height:220mm;display:flex;align-items:center;justify-content:center;overflow:hidden}.review-attachment img{display:block;max-width:100%;max-height:216mm;width:auto;height:auto;object-fit:contain;object-position:center}.attachment-page{page-break-after:always;break-after:page}.attachment-page:last-child{page-break-after:auto;break-after:auto}.small-note{font-size:9pt}.avoid-break{break-inside:avoid}h3{font-size:11pt;color:#17365d;margin:5mm 0 2mm}@media screen{body{background:#e8ebef}.page{margin:10mm auto;box-shadow:0 2px 12px #0002}}@media print{html,body{width:auto!important;margin:0!important;padding:0!important;background:#fff!important}body{overflow:visible!important}.page{width:auto!important;min-height:0!important;margin:0!important;padding:0!important;box-shadow:none!important;overflow:visible!important}.data-table{break-inside:auto;page-break-inside:auto}.data-table thead{display:table-header-group}.data-table tfoot{display:table-row-group}.data-table tr{break-inside:avoid!important;page-break-inside:avoid!important}.section-row{break-after:avoid;page-break-after:avoid}h2,h3,p{orphans:3;widows:3}}</style></head><body>'+
  '<section class="page"><h1 class="doc-title">BERITA ACARA REVIU DOKUMEN PERSIAPAN PENGADAAN E-PURCHASING</h1><table class="meta">'+meta+'</table><table class="data-table"><colgroup><col style="width:6%"><col style="width:23%"><col style="width:43%"><col style="width:28%"></colgroup><thead><tr><th>No.</th><th>Tinjauan</th><th>Hasil rekomendasi Pejabat Pengadaan</th><th>Tanggapan</th></tr></thead><tbody>'+rows+'</tbody></table><h3>Rekomendasi Hasil Reviu</h3><p>'+esc(recommendation)+'</p><h3>Catatan</h3><p>'+esc(notes)+'</p></section>'+productWorkPages+'<section class="page"><h2 class="doc-title">HASIL PEMERIKSAAN PENYEDIA</h2><table class="data-table"><colgroup><col style="width:8%"><col style="width:34%"><col style="width:58%"></colgroup><thead><tr><th>No.</th><th>Hal-hal Pemeriksaan</th><th>Catatan / Hasil Pemeriksaan</th></tr></thead><tbody><tr><td class="center">1</td><td><b>Hasil pemeriksaan Status Daftar Hitam Penyedia</b></td><td>'+checkText(checks.daftar_hitam,supporting.some(x=>x.kategori==='Bukti Reviu - Daftar Hitam')?'Bukti tangkapan layar pemeriksaan terlampir.':null)+'</td></tr><tr><td class="center">2</td><td><b>Hasil verifikasi data kualifikasi Pelaku Usaha pada aplikasi SIKaP</b></td><td>'+checkText(checks.sikap,supporting.some(x=>x.kategori==='Bukti Reviu - SIKaP')?'Bukti tangkapan layar verifikasi terlampir.':null)+'</td></tr><tr><td class="center">3</td><td><b>Pendokumentasian</b></td><td>'+checkText(checks.pendokumentasian,supporting.some(x=>x.kategori==='Bukti Reviu - Pendokumentasian')?'Dokumentasi gambar terlampir.':null)+'</td></tr><tr><td class="center">4</td><td><b>Lain-lain</b></td><td>'+checkText(checks.lain_lain)+'</td></tr></tbody></table><p class="small-note">Catatan: hasil pemeriksaan Daftar Hitam dan verifikasi SIKaP harus berdasarkan bukti pemeriksaan aktual sebelum dokumen ditandatangani.</p><div class="sign">'+signatureBlock('PPK')+ppbjSignature+'</div></section>'+reviewAttachmentsHtml+'</body></html>';
  return html;
}
export async function openReviewPrint(db,id){
  const html=await buildReviewHtml(db,id),w=window.open('','_blank');
  if(!w)throw new Error('Izinkan pop-up browser untuk mencetak berita acara reviu.');
  w.document.open();w.document.write(html);w.document.close();
  printDocumentWhenReady(w);
}

async function printDocumentWhenReady(w) {
  const run = async () => {
    try {
      if (w.document.fonts?.ready) await w.document.fonts.ready;
      if (w.__pdfAttachmentReady) await w.__pdfAttachmentReady;
      const images = Array.from(w.document.images || []);
      await Promise.race([
        Promise.all(images.map(img => img.complete ? Promise.resolve() : new Promise(resolve => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        }))),
        new Promise(resolve => w.setTimeout(resolve, 8000))
      ]);
    } catch (_) {}
    w.focus();
    w.print();
  };
  if (w.document.readyState === 'complete') run();
  else w.addEventListener('load', run, { once: true });
}

export async function openProcurementPrint(db, id) {
  const html = await buildProcurementHtml(db, id);
  const w = window.open('', '_blank');
  if (!w) throw new Error('Izinkan pop-up browser untuk mencetak dokumen.');
  w.document.open();
  w.document.write(html);
  w.document.close();
  printDocumentWhenReady(w);
}

export async function openAllDocumentsPrint(db,id){
  const [surat,koordinasi,reviu]=await Promise.all([
    buildProcurementHtml(db,id),
    buildCoordinationHtml(db,id),
    buildReviewHtml(db,id)
  ]);
  const extract=(html)=>{
    const styles=Array.from(html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi),match=>match[1]).join("\n");
    const body=(html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)||[])[1]||"";
    if(!body.trim())throw new Error("Salah satu dokumen tidak memiliki isi. Cetak keseluruhan dibatalkan.");
    return {styles,body};
  };
  const docs=[surat,koordinasi,reviu].map(extract);
  const scopeCss=(css,scope)=>{
    let output="",position=0;
    while(position<css.length){
      const open=css.indexOf("{",position);
      if(open<0){output+=css.slice(position);break;}
      const header=css.slice(position,open).trim();
      let depth=1,cursor=open+1;
      while(cursor<css.length&&depth){if(css[cursor]==="{")depth++;else if(css[cursor]==="}")depth--;cursor++;}
      const inner=css.slice(open+1,cursor-1);
      if(/^@page\b/i.test(header)){}
      else if(/^@(media|supports|container|layer)\b/i.test(header))output+=header+"{"+scopeCss(inner,scope)+"}";
      else if(/^@(font-face|keyframes|-webkit-keyframes|counter-style|property)\b/i.test(header))output+=header+"{"+inner+"}";
      else{
        const selectors=header.split(/,(?![^()]*\))/).map(selector=>{
          const value=selector.trim();
          if(!value)return "";
          if(/^(html|body|:root)$/i.test(value))return scope;
          if(/^(html|body|:root)\s+/.test(value))return scope+value.replace(/^(html|body|:root)/i,"");
          return scope+" "+value;
        }).filter(Boolean).join(",");
        output+=selectors+"{"+inner+"}";
      }
      position=cursor;
    }
    return output;
  };
  const styleText=docs.map((doc,index)=>scopeCss(doc.styles,".combined-part-"+(index+1))).join("\n");
  const bodyText=docs.map((doc,index)=>'<div class="combined-part combined-part-'+(index+1)+'">'+doc.body+'</div>').join("");
  const titleMatch=surat.match(/<title>([\s\S]*?)<\/title>/i);
  const title=(titleMatch?.[1]||"Dokumen Pengadaan").replace(/<[^>]*>/g,"");
  const filename=(title.replace(/^Dokumen\s*/i,"").replace(/[^a-z0-9-_ ]/gi,"").trim().replace(/\s+/g,"_")||"Dokumen_Pengadaan")+"_Lengkap";
  const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+filename+'</title><style>'+styleText+
    '\n@page{size:A4 portrait!important;margin:0!important}*{box-sizing:border-box}html,body{width:210mm!important;margin:0!important;padding:0!important;background:#fff!important}body{overflow:visible!important}.combined-part{display:block;position:relative;width:210mm!important;margin:0!important;padding:0!important;break-before:auto;page-break-before:auto}.combined-part-2,.combined-part-3{break-before:page;page-break-before:always}.combined-part-1 .page:last-of-type,.combined-part-2 .page:last-of-type,.combined-part-3 .page:last-of-type{break-after:auto!important;page-break-after:auto!important}.combined-part-3 .page{width:210mm!important;min-height:0!important;height:auto!important;margin:0!important;padding:18mm 15mm 20mm 20mm!important;-webkit-box-decoration-break:clone!important;box-decoration-break:clone!important;overflow:visible!important;box-shadow:none!important;break-inside:auto!important;page-break-inside:auto!important}.combined-part-3 .page.work-page,.combined-part-3 .page.attachment-page{break-before:auto!important;page-break-before:auto!important}.combined-part-3 table{max-width:100%!important}.combined-part-3 tr{break-inside:avoid;page-break-inside:avoid}@media screen{html,body{width:auto!important;background:#e8ebef!important}.combined-part{margin:10mm auto!important;background:#fff;box-shadow:0 2px 12px #0002}}@media print{html,body,.combined-part{background:#fff!important}.combined-part{margin:0!important}.combined-part-3 .page{margin:0!important}}img{max-width:100%;}</style></head><body>'+bodyText+'</body></html>';
  const w=window.open("","_blank");
  if(!w)throw new Error("Izinkan pop-up browser untuk mencetak seluruh dokumen.");
  w.document.open();w.document.write(html);w.document.close();
  printDocumentWhenReady(w);
}