const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rupiah=v=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(v||0));
const number=v=>Number(String(v??0).replace(/[^\d.-]/g,''))||0;
const moneyFmt='"Rp" #,##0;[Red]-"Rp" #,##0';
const navy='FF17365D',blue='FFDCE6F1',pale='FFF4F7FA',line='FFB8C4D0',gold='FFC5A45A',white='FFFFFFFF';
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
 try{const response=await fetch(data.signedUrl);if(!response.ok)return null;const blob=await response.blob();return {buffer:await blob.arrayBuffer(),extension:blob.type.includes('jpeg')||blob.type.includes('jpg')?'jpeg':'png'};}catch{return null;}
}
function parseJson(value){try{return JSON.parse(value||'{}')}catch{return {}}}
function parseProductMeta(item){const raw=String(item.keterangan||'');if(!raw.startsWith('__PBJ_META__:'))return {catatan:raw};return {...parseJson(raw.slice(13))};}
function styleTitle(ws,title,subtitle,opd,rup,lastCol){
 const end=ws.getColumn(lastCol).letter;
 ws.mergeCells('A1:'+end+'1');ws.getCell('A1').value=title.toUpperCase();ws.getCell('A1').font={name:'Aptos Display',size:16,bold:true,color:{argb:navy}};ws.getCell('A1').alignment={horizontal:'center',vertical:'middle'};ws.getRow(1).height=32;
 ws.mergeCells('A2:'+end+'2');ws.getCell('A2').value=subtitle||'';ws.getCell('A2').font={name:'Aptos',size:11,bold:true,color:{argb:'FF34465A'}};ws.getCell('A2').alignment={horizontal:'center',vertical:'middle',wrapText:true};ws.getRow(2).height=25;
 ws.mergeCells('A3:'+end+'3');ws.getCell('A3').value=(opd||'')+(rup?'  |  Kode RUP: '+rup:'');ws.getCell('A3').font={name:'Aptos',size:9,color:{argb:'FF657487'}};ws.getCell('A3').alignment={horizontal:'center',vertical:'middle'};ws.getRow(3).height=21;
 ws.mergeCells('A4:'+end+'4');ws.getCell('A4').value='LEMBAR KERJA PENGADAAN  •  UKPBJ KABUPATEN LABUHANBATU SELATAN';ws.getCell('A4').font={name:'Aptos',size:8,bold:true,color:{argb:'FFC5A45A'}};ws.getCell('A4').alignment={horizontal:'center',vertical:'middle'};ws.getRow(4).height=18;
}
function styleHeader(row){
 row.height=34;row.eachCell(c=>{c.font={name:'Aptos',size:10,bold:true,color:{argb:navy}};c.alignment={horizontal:'center',vertical:'middle',wrapText:true};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:blue}};c.border={top:{style:'medium',color:{argb:navy}},bottom:{style:'medium',color:{argb:navy}},left:{style:'thin',color:{argb:line}},right:{style:'thin',color:{argb:line}}};});
}
function styleDataRow(row,index,{height=30,moneyCols=[],centerCols=[],leftCols=[]}={}){
 row.height=height;row.eachCell(c=>{c.font={name:'Aptos',size:10,color:{argb:'FF263445'}};c.alignment={vertical:'middle',horizontal:centerCols.includes(c.col)?'center':moneyCols.includes(c.col)?'right':'left',wrapText:true,indent:leftCols.includes(c.col)?1:0};c.border={top:{style:'thin',color:{argb:line}},bottom:{style:'thin',color:{argb:line}},left:{style:'thin',color:{argb:line}},right:{style:'thin',color:{argb:line}}};if(index%2===1)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:pale}};});
 moneyCols.forEach(i=>row.getCell(i).numFmt=moneyFmt);
}
function addTableSheet(wb,name,title,subtitle,opd,rup,headers,rows,widths,opts={}){
 const ws=wb.addWorksheet(name,{views:[{state:'frozen',ySplit:5,showGridLines:false,zoomScale:85}],pageSetup:{paperSize:9,orientation:opts.orientation||'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:.25,right:.25,top:.45,bottom:.45,header:.2,footer:.2}}});
 ws.columns=widths.map(width=>({width}));styleTitle(ws,title,subtitle,opd,rup,headers.length);
 const h=ws.getRow(5);h.values=headers;styleHeader(h);
 rows.forEach((values,i)=>{const row=ws.addRow(values);styleDataRow(row,i,{height:opts.rowHeight||34,moneyCols:opts.moneyCols||[],centerCols:opts.centerCols||[],leftCols:opts.leftCols||[]});if(opts.rowStyle)opts.rowStyle(row,i);});
 if(rows.length){ws.autoFilter={from:{row:5,column:1},to:{row:5+rows.length,column:headers.length}};ws.pageSetup.printTitleRows='1:5';}
 ws.pageSetup.printArea='A1:'+ws.getColumn(headers.length).letter+Math.max(5+rows.length,5);
 ws.pageSetup.horizontalCentered=true;
 return ws;
}
export async function downloadHpsExcel(db,id){
 const ExcelJS=await loadExcelJS();
 const [s,g,p,r,v,h]=await Promise.all([
  db.from('surat').select('*').eq('id',id).single(),
  db.from('detail_barang').select('*').eq('surat_id',id).order('nomor_urut'),
  db.from('surat_pejabat').select('*').eq('surat_id',id),
  db.from('reviu').select('*').eq('surat_id',id).order('created_at',{ascending:false}).limit(1).maybeSingle(),
  db.from('penyedia').select('*').eq('surat_id',id).order('created_at'),
  db.from('referensi_harga').select('*').eq('surat_id',id).order('created_at')
 ]);
 for(const q of [s,g,p,r,v,h])if(q.error)throw q.error;
 const d=s.data,goods=(g.data||[]).filter(x=>String(x.nama_barang||'').trim()),officials=p.data||[],review=r.data||{},vendors=(v.data||[]).map(x=>({...x,detail:parseJson(x.keterangan)})),refs=h.data||[];
 if(!goods.length)throw new Error('Belum ada rincian barang untuk dibuatkan lembar kerja.');
 const reviewArray=Array.isArray(review.hasil_reviu)?review.hasil_reviu:[],reviewMeta=reviewArray.find(x=>x&&x.judul===undefined)||reviewArray[0]||{},selectedIndex=Math.max(0,Number(reviewMeta.produk_usulan_index||0));
 const meta=goods.map(parseProductMeta);
 const vendorPrices=goods.map((item,i)=>vendors.filter(x=>Number(x.detail.product_index||0)===i).map(x=>number(x.detail.harga_satuan)).filter(x=>x>0));
 const hpsUnit=goods.map((item,i)=>vendorPrices[i].length?Math.round(vendorPrices[i].reduce((a,b)=>a+b,0)/vendorPrices[i].length):number(item.harga_satuan));
 const wb=new ExcelJS.Workbook();wb.creator='Generator Dokumen PBJ';wb.subject='Lembar Kerja Pengadaan';wb.created=new Date();wb.company='UKPBJ Kabupaten Labuhanbatu Selatan';
 // 01 — HPS
 const ws=wb.addWorksheet('01 HPS',{views:[{state:'normal',showGridLines:false,zoomScale:85,activeCell:'A1',topLeftCell:'A1',selection:[{sqref:'A1'}]}],pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:1,margins:{left:.25,right:.25,top:.45,bottom:.45,header:.2,footer:.2}}});
 ws.columns=[{width:7},{width:29},{width:11},{width:9},{width:21},{width:12},{width:22},{width:38},{width:18,hidden:true}];
 styleTitle(ws,'Harga Perkiraan Sendiri',d.nama_paket,d.nama_opd_snapshot,d.kode_rup,8);
 const hpsHeaders=['No.','Jenis Barang/Jasa','Satuan','Vol','Harga (Sebelum Pajak × Vol.)','Pajak (%)','Total HPS','Keterangan'];
 const hh=ws.getRow(5);hh.values=hpsHeaders;styleHeader(hh);
 goods.forEach((item,i)=>{
  const volume=number(item.volume),inclusiveUnit=hpsUnit[i],inclusiveTotal=inclusiveUnit*volume,baseTotal=Math.round(inclusiveTotal*100/111);
  const note=[meta[i].merek_produk,meta[i].tipe_produk,meta[i].catatan].filter(Boolean).join(' / ')+(i===selectedIndex?' • Produk pilihan reviu PPBJ':'');
  const row=ws.addRow([i+1,item.nama_barang,item.satuan||'',volume,baseTotal,11,null,note,inclusiveTotal]);
  styleDataRow(row,i,{height:42,moneyCols:[5,7],centerCols:[1,3,4,6],leftCols:[2,8]});
  row.getCell(7).value={formula:'I'+row.number};row.getCell(7).numFmt=moneyFmt;row.getCell(5).numFmt=moneyFmt;row.getCell(6).numFmt='0"%"';
 });
 const totalRow=ws.addRow(['','','','','','TOTAL',{formula:'SUM(G6:G'+(5+goods.length)+')'},'']);ws.mergeCells(totalRow.number,1,totalRow.number,6);totalRow.getCell(1).value='TOTAL HPS';totalRow.height=34;totalRow.getCell(1).alignment={horizontal:'center',vertical:'middle'};totalRow.getCell(7).numFmt=moneyFmt;totalRow.getCell(7).alignment={horizontal:'right',vertical:'middle'};totalRow.eachCell(c=>{c.font={name:'Aptos',size:11,bold:true,color:{argb:navy}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEAF0F6'}};c.border={top:{style:'medium',color:{argb:navy}},bottom:{style:'double',color:{argb:navy}},left:{style:'thin',color:{argb:line}},right:{style:'thin',color:{argb:line}}};});
 const signRow=totalRow.number+3;ws.mergeCells(signRow,1,signRow,4);ws.mergeCells(signRow,5,signRow,8);ws.getCell(signRow,1).value='PPTK';ws.getCell(signRow,5).value='Mengetahui,\nPPK';[1,5].forEach(col=>{const c=ws.getCell(signRow,col);c.font={name:'Aptos',size:10,bold:true};c.alignment={horizontal:'center',vertical:'middle',wrapText:true};});ws.getRow(signRow).height=28;
 ws.mergeCells(signRow+1,1,signRow+1,4);ws.mergeCells(signRow+1,5,signRow+1,8);ws.getRow(signRow+1).height=58;
 ws.mergeCells(signRow+2,1,signRow+2,4);ws.mergeCells(signRow+2,5,signRow+2,8);ws.getRow(signRow+2).height=28;
 for(const [role,col] of [['PPTK',1],['PPK',5]]){const person=officials.find(x=>String(x.peran||'').toUpperCase()===role);ws.getCell(signRow+2,col).value=(person?.nama_snapshot||'................................')+(person?.nip_snapshot?'\nNIP. '+person.nip_snapshot:'');ws.getCell(signRow+2,col).font={name:'Aptos',size:10,bold:true};ws.getCell(signRow+2,col).alignment={horizontal:'center',vertical:'middle',wrapText:true};if(person?.tanda_tangan_path_snapshot){const img=await signedImage(db,person.tanda_tangan_path_snapshot,'tanda-tangan');if(img){const imageId=wb.addImage({buffer:img.buffer,extension:img.extension});ws.addImage(imageId,{tl:{col:col-1,row:signRow},br:{col:col===1?4:8,row:signRow+2},editAs:'oneCell'});}}}
 ws.pageSetup.printArea='A1:H'+(signRow+2);ws.pageSetup.printTitleRows='1:5';ws.pageSetup.horizontalCentered=true;
 // 02 — Rincian Produk
 const productRows=goods.map((x,i)=>[i+1,x.nama_barang||'',meta[i].merek_produk||'',meta[i].tipe_produk||'',x.spesifikasi||'',x.satuan||'',number(x.volume),number(x.harga_satuan),number(x.pagu_dpa_rka),meta[i].catatan||'',x.produk_dalam_negeri?'Ya':'Tidak',x.umkm?'Ya':'Tidak',x.sesuai_spesifikasi===false?'Tidak':'Ya']);
 const productWs=addTableSheet(wb,'02 Rincian Produk','Rincian Produk','Data teknis yang diinput pada formulir',d.nama_opd_snapshot,d.kode_rup,['No.','Nama Barang','Merek','Tipe / Model','Spesifikasi Teknis','Satuan','Volume','Harga Form (Termasuk Pajak)','Pagu DPA / RKA','Catatan','Produk Dalam Negeri','UMKM','Sesuai Spesifikasi'],productRows,[7,24,20,22,42,11,10,22,22,28,16,12,17],{moneyCols:[8,9],centerCols:[1,6,7,11,12,13],rowHeight:48});
 for(let i=0;i<goods.length;i++){if(goods[i].foto_produk_path){const img=await signedImage(db,goods[i].foto_produk_path,'foto-produk');if(img){productWs.getColumn(14).width=20;productWs.getCell(5,14).value='Foto Produk';productWs.getCell(5,14).font={name:'Aptos',size:10,bold:true,color:{argb:navy}};productWs.getCell(5,14).fill={type:'pattern',pattern:'solid',fgColor:{argb:blue}};productWs.getCell(5,14).alignment={horizontal:'center',vertical:'middle',wrapText:true};productWs.getCell(5,14).border={top:{style:'thin',color:{argb:line}},bottom:{style:'thin',color:{argb:line}},left:{style:'thin',color:{argb:line}},right:{style:'thin',color:{argb:line}}};const imageId=wb.addImage({buffer:img.buffer,extension:img.extension});productWs.addImage(imageId,{tl:{col:13,row:5+i},br:{col:14,row:6+i},editAs:'oneCell'});productWs.getRow(6+i).height=Math.max(productWs.getRow(6+i).height||30,66);}}}
 // 03 — Produk Pembanding
 const comparisonRows=[];
 goods.forEach((item,i)=>refs.filter(x=>x.detail_barang_id===item.id&&String(x.sumber_referensi||'').trim()==='Produk sejenis berdasarkan spesifikasi').forEach((ref,j)=>{const parts=String(ref.nama_produk||'').split(' — ');const brand=parts.shift()||'';comparisonRows.push([i+1,item.nama_barang,j+1,brand,parts.join(' — '),number(ref.harga)]);}));
 addTableSheet(wb,'03 Produk Pembanding','Produk Pembanding','Produk sejenis berdasarkan spesifikasi setiap barang',d.nama_opd_snapshot,d.kode_rup,['No. Barang','Nama Barang','No. Pembanding','Merek / Model','Spesifikasi Produk Sejenis','Harga Satuan'],comparisonRows,[12,25,15,27,48,22],{moneyCols:[6],centerCols:[1,3],rowHeight:44});
 // 04 — Data Penyedia
 const providerRows=[];
 vendors.forEach(v=>{const pi=Math.max(0,Math.min(goods.length-1,Number(v.detail.product_index||0)));const item=goods[pi];const link=String(v.detail.link_produk||'');providerRows.push([pi+1,item?.nama_barang||'',v.nama_penyedia||'',v.detail.lokasi||'',number(v.detail.harga_satuan),v.detail.kesesuaian||'',v.detail.prioritas||'',v.detail.jenis_produk||'',v.detail.nilai_tkdn??'',v.detail.nilai_bmp??'',link]);});
 const providerWs=addTableSheet(wb,'04 Data Penyedia','Data Penyedia','Data penyedia dan tautan produk e-Katalog INAPROC',d.nama_opd_snapshot,d.kode_rup,['No. Barang','Nama Barang','Nama Penyedia','Lokasi','Harga E-Katalog','Kesesuaian','Prioritas','Jenis Produk','TKDN (%)','BMP (%)','Link Produk INAPROC'],providerRows,[12,24,30,20,22,16,14,20,12,12,48],{moneyCols:[5],centerCols:[1,9,10],rowHeight:44});
 providerRows.forEach((r,i)=>{const cell=providerWs.getCell(6+i,11);if(r[10]&&/^https?:\/\//i.test(r[10])){cell.value={text:r[10],hyperlink:r[10]};cell.font={name:'Aptos',size:9,color:{argb:'FF0563C1'},underline:true};}});
 // 05 — Perbandingan Harga
 const priceRows=[];
 goods.forEach((item,i)=>{const group=vendors.filter(v=>Number(v.detail.product_index||0)===i);group.forEach((v,j)=>{priceRows.push([i+1,item.nama_barang,j+1,v.nama_penyedia||'',number(v.detail.harga_satuan),v.detail.lokasi||'',v.detail.kesesuaian||'',v.detail.prioritas||'']);});if(group.length){priceRows.push(['','HPS Satuan Produk','','',hpsUnit[i],'','','']);priceRows.push(['','Jumlah HPS','','',hpsUnit[i]*number(item.volume),'Volume: '+number(item.volume),'','']);priceRows.push(['','','','','','','','']);}});
 const priceWs=addTableSheet(wb,'05 Perbandingan Harga','Perbandingan Harga dan Perhitungan HPS','Perbandingan harga penyedia per barang',d.nama_opd_snapshot,d.kode_rup,['No. Barang','Nama Barang','No.','Nama Penyedia','Harga Hasil Survei','Lokasi','Kesesuaian','Prioritas'],priceRows,[12,25,8,30,23,20,18,16],{moneyCols:[5],centerCols:[1,3],rowHeight:34});
 priceRows.forEach((r,i)=>{if(r[1]==='HPS Satuan Produk'||r[1]==='Jumlah HPS'){const row=priceWs.getRow(6+i);row.eachCell(c=>{c.font={name:'Aptos',size:10,bold:true,color:{argb:navy}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEAF0F6'}};c.border={top:{style:'thin',color:{argb:line}},bottom:{style:'thin',color:{argb:line}}};});}});
 // 06 — Hasil Reviu
 const reviewRows=(Array.isArray(reviewMeta.items)?reviewMeta.items:reviewArray.filter(x=>x&&x.judul!==undefined)).map((x,i)=>[i+1,x.judul||'',x.pertanyaan||'',({sesuai:'Sesuai',tidak_sesuai:'Tidak sesuai',perlu_dilengkapi:'Perlu dilengkapi',tidak_diperiksa:'Tidak diperiksa',belum_diperiksa:'Belum diperiksa'})[x.status]||x.status||'',x.catatan||'']);
 const reviewWs=addTableSheet(wb,'06 Hasil Reviu','Hasil Reviu PPBJ','Catatan pemeriksaan dan rekomendasi hasil reviu',d.nama_opd_snapshot,d.kode_rup,['No.','Aspek Reviu','Uraian / Pertanyaan','Hasil','Catatan PPBJ'],reviewRows,[8,32,48,22,54],{centerCols:[1,4],rowHeight:48});
 const summaryStart=6+reviewRows.length+2;
 const summaries=[['Tanggal Reviu',review.tanggal_reviu||''],['Produk yang Diusulkan PPK',goods[selectedIndex]?.nama_barang||'Belum dipilih'],['Rekomendasi PPBJ',review.rekomendasi||''],['Catatan PPBJ',review.catatan||''],['Daftar Hitam',reviewMeta.daftar_hitam||''],['SIKaP',reviewMeta.sikap||''],['Pendokumentasian',reviewMeta.pendokumentasian||''],['Lain-lain',reviewMeta.lain_lain||'']];
 summaries.forEach((x,i)=>{const row=reviewWs.getRow(summaryStart+i);reviewWs.mergeCells(summaryStart+i,1,summaryStart+i,2);reviewWs.mergeCells(summaryStart+i,3,summaryStart+i,5);row.getCell(1).value=x[0];row.getCell(1).font={name:'Aptos',size:10,bold:true,color:{argb:navy}};row.getCell(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:blue}};row.getCell(3).value=x[1];row.getCell(3).alignment={vertical:'middle',wrapText:true};row.height=42;for(let col=1;col<=5;col++)row.getCell(col).border={top:{style:'thin',color:{argb:line}},bottom:{style:'thin',color:{argb:line}},left:{style:'thin',color:{argb:line}},right:{style:'thin',color:{argb:line}}};});
 reviewWs.pageSetup.printArea='A1:E'+(summaryStart+summaries.length-1);
 // workbook-wide polish
 wb.eachSheet(sheet=>{sheet.views=[{state:sheet.name==='01 HPS'?'normal':'frozen',ySplit:sheet.name==='01 HPS'?0:5,showGridLines:false,zoomScale:sheet.name==='01 HPS'?85:80,activeCell:'A1',topLeftCell:'A1',selection:[{sqref:'A1'}]}];sheet.properties.defaultRowHeight=22;sheet.pageSetup.horizontalCentered=true;sheet.pageSetup.fitToPage=true;sheet.pageSetup.fitToWidth=1;sheet.pageSetup.fitToHeight=0;});
 ws.pageSetup.fitToHeight=1;ws.pageSetup.printArea='A1:H'+(signRow+2);
 const buffer=await wb.xlsx.writeBuffer();const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='LEMBAR_KERJA_PENGADAAN_'+String(d.nama_paket||'Paket').replace(/[^a-z0-9-_ ]/gi,'').trim().replace(/\s+/g,'_')+'.xlsx';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}
