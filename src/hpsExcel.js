const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rupiah=v=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(v||0));
async function loadExcelJS(){
 if(window.ExcelJS)return window.ExcelJS;
 await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';s.onload=resolve;s.onerror=()=>reject(new Error('Pustaka Excel tidak dapat dimuat. Periksa koneksi internet.'));document.head.appendChild(s)});
 if(!window.ExcelJS)throw new Error('Pustaka Excel tidak tersedia.');
 return window.ExcelJS;
}
async function signedImage(db,path,bucket){
 if(!path)return null;
 const {data,error}=await db.storage.from(bucket).createSignedUrl(path,300);
 if(error||!data?.signedUrl)return null;
 try{const response=await fetch(data.signedUrl);if(!response.ok)return null;const blob=await response.blob();const buffer=await blob.arrayBuffer();return {buffer,extension:blob.type.includes('jpeg')?'jpeg':'png'};}catch{return null;}
}
export async function downloadHpsExcel(db,id){
 const ExcelJS=await loadExcelJS();
 const [s,g,p,r]=await Promise.all([
  db.from('surat').select('*').eq('id',id).single(),
  db.from('detail_barang').select('*').eq('surat_id',id).order('nomor_urut'),
  db.from('surat_pejabat').select('*').eq('surat_id',id),
  db.from('reviu').select('hasil_reviu').eq('surat_id',id).order('created_at',{ascending:false}).limit(1).maybeSingle()
 ]);
 for(const q of [s,g,p,r])if(q.error)throw q.error;
 const d=s.data,goods=g.data||[],officials=p.data||[],reviewMeta=Array.isArray(r.data?.hasil_reviu)?r.data.hasil_reviu[0]||{}:{},selectedIndex=Math.max(0,Number(reviewMeta.produk_usulan_index||0));
 if(!goods.length)throw new Error('Belum ada rincian barang untuk dibuatkan HPS.');
 const wb=new ExcelJS.Workbook();wb.creator='Generator Dokumen PBJ';wb.subject='Harga Perkiraan Sendiri';wb.created=new Date();
 const ws=wb.addWorksheet('HPS',{pageSetup:{paperSize:wsPaper(),orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:0.25,right:0.25,top:0.45,bottom:0.45,header:0.2,footer:0.2}}});
 function wsPaper(){return 9}
 ws.columns=[{width:7},{width:32},{width:12},{width:9},{width:20},{width:12},{width:22},{width:30},{width:18,hidden:true}];
 ws.properties.defaultRowHeight=24;
 ws.pageSetup.horizontalCentered=true;
 ws.pageSetup.verticalCentered=false;
 ws.mergeCells('A1:H1');ws.getCell('A1').value='HARGA PERKIRAAN SENDIRI';ws.getCell('A1').font={name:'Arial',size:16,bold:true};ws.getCell('A1').alignment={horizontal:'center',vertical:'middle'};ws.getRow(1).height=30;
 ws.mergeCells('A2:H2');ws.getCell('A2').value=d.nama_paket||'';ws.getCell('A2').font={name:'Arial',size:10,bold:true};ws.getCell('A2').alignment={horizontal:'center',vertical:'middle',wrapText:true};ws.getRow(2).height=28;
 ws.mergeCells('A3:H3');ws.getCell('A3').value=(d.nama_opd_snapshot||'')+(d.kode_rup?' | Kode RUP: '+d.kode_rup:'');ws.getCell('A3').font={name:'Arial',size:9};ws.getCell('A3').alignment={horizontal:'center',vertical:'middle'};ws.getRow(3).height=20;
 const headers=['No','Jenis Barang/Jasa','Satuan','Vol','Harga','Pajak (%)','Total','Keterangan'];
 const header=ws.getRow(5);header.values=headers;header.height=36;header.eachCell(c=>{c.font={name:'Arial',size:10,bold:true,color:{argb:'FF17365D'}};c.alignment={horizontal:'center',vertical:'middle',wrapText:true};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFDCE6F1'}};c.border={top:{style:'medium',color:{argb:'FF526579'}},bottom:{style:'medium',color:{argb:'FF526579'}},left:{style:'thin',color:{argb:'FF9AA8B5'}},right:{style:'thin',color:{argb:'FF9AA8B5'}}};});
 goods.forEach((g,i)=>{
  let meta={};try{if(String(g.keterangan||'').startsWith('__PBJ_META__:'))meta=JSON.parse(String(g.keterangan).slice(13));}catch{}
  const brand=[meta.merek_produk,meta.tipe_produk].filter(Boolean).join(' / ');
  const note=brand+(i===selectedIndex?' — Produk yang dipilih untuk reviu PPBJ':'');
  const hargaTermasukPajak=Number(g.harga_satuan||0);
  const volume=Number(g.volume||0);
  const totalTermasukPajak=hargaTermasukPajak*volume;
  const hargaSebelumPajakTotal=Math.round(totalTermasukPajak*100/111);
  const row=ws.addRow([i+1,g.nama_barang||'',g.satuan||'',volume,hargaSebelumPajakTotal,11,null,note,hargaTermasukPajak]);
  row.height=38;row.eachCell(c=>{c.font={name:'Arial',size:10,color:{argb:'FF202A35'}};c.alignment={vertical:'middle',horizontal:[1,2,3,8].includes(c.col)?'left':([5,7,9].includes(c.col)?'right':'center'),wrapText:true,indent:[2,8].includes(c.col)?1:0};c.border={top:{style:'thin',color:{argb:'FFB8C2CC'}},bottom:{style:'thin',color:{argb:'FFB8C2CC'}},left:{style:'thin',color:{argb:'FFB8C2CC'}},right:{style:'thin',color:{argb:'FFB8C2CC'}}};if(i%2===1&&c.col<=8)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF5F8FB'}};});
  row.getCell(1).alignment={horizontal:'center',vertical:'middle'};
  row.getCell(4).alignment={horizontal:'center',vertical:'middle'};
  row.getCell(5).numFmt='"Rp" #,##0';row.getCell(7).value={formula:'D'+row.number+'*I'+row.number};row.getCell(7).numFmt='"Rp" #,##0';row.getCell(7).alignment={horizontal:'right',vertical:'middle'};row.getCell(6).numFmt='0"%"';row.getCell(6).alignment={horizontal:'center',vertical:'middle'};
 });
 const totalRow=ws.addRow(['','','','','','TOTAL',{formula:'SUM(G6:G'+(5+goods.length)+')'},'']);totalRow.height=32;ws.mergeCells(totalRow.number,1,totalRow.number,6);totalRow.getCell(1).value='TOTAL';totalRow.getCell(1).alignment={horizontal:'center',vertical:'middle'};totalRow.getCell(7).numFmt='"Rp" #,##0';totalRow.getCell(7).alignment={horizontal:'right',vertical:'middle',indent:1};totalRow.eachCell(c=>{c.font={name:'Arial',size:11,bold:true,color:{argb:'FF17365D'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEAF0F6'}};c.border={top:{style:'medium',color:{argb:'FF526579'}},bottom:{style:'double',color:{argb:'FF526579'}},left:{style:'thin',color:{argb:'FF9AA8B5'}},right:{style:'thin',color:{argb:'FF9AA8B5'}};});
 const signRow=totalRow.number+3;ws.mergeCells(signRow,1,signRow,4);ws.mergeCells(signRow,5,signRow,8);
 ws.getCell(signRow,1).value='Mengetahui,\nPPK';ws.getCell(signRow,5).value='PPTK';[1,5].forEach(col=>{const c=ws.getCell(signRow,col);c.font={name:'Arial',size:10,bold:true};c.alignment={horizontal:'center',vertical:'middle',wrapText:true};});ws.getRow(signRow).height=34;
 ws.mergeCells(signRow+1,1,signRow+1,4);ws.mergeCells(signRow+1,5,signRow+1,8);ws.getRow(signRow+1).height=62;
 ws.mergeCells(signRow+2,1,signRow+2,4);ws.mergeCells(signRow+2,5,signRow+2,8);ws.getRow(signRow+2).height=24;
 for(const [role,col1,col2] of [['PPTK',1,4],['PPK',5,8]]){
  const person=officials.find(x=>String(x.peran||'').toUpperCase()===role);
  const label=person?.jabatan_snapshot||role;
  ws.getCell(signRow, col1).value=role==='PPK'?'Mengetahui,\n'+label:label;
  ws.getCell(signRow, col1).alignment={horizontal:'center',vertical:'middle',wrapText:true};
  ws.getCell(signRow+2,col1).value=(person?.nama_snapshot||'................................')+(person?.nip_snapshot?'\nNIP. '+person.nip_snapshot:'');
  ws.getCell(signRow+2,col1).font={name:'Arial',size:10,bold:true};ws.getCell(signRow+2,col1).alignment={horizontal:'center',vertical:'middle',wrapText:true};
  if(person?.tanda_tangan_path_snapshot){const img=await signedImage(db,person.tanda_tangan_path_snapshot,'tanda-tangan');if(img){const imageId=wb.addImage({buffer:img.buffer,extension:img.extension});ws.addImage(imageId,{tl:{col:col1-1,row:signRow},br:{col:col2,row:signRow+2},editAs:'oneCell'});}}
 }
 ws.pageSetup.printArea='A1:H'+(signRow+2);ws.views=[{state:'normal'}];
 const buffer=await wb.xlsx.writeBuffer();const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='HPS_'+String(d.nama_paket||'Paket').replace(/[^a-z0-9-_ ]/gi,'').trim().replace(/\s+/g,'_')+'.xlsx';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}
