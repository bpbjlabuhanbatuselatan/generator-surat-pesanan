import {useEffect,useMemo,useState} from 'react';
import {createClient} from '@supabase/supabase-js';
import {openProcurementPrint,buildProcurementHtml} from './printDocument';
import html2pdf from 'html2pdf.js';
import {FileText,FilePlus2,FolderOpen,LayoutDashboard,LogOut,Search,Save,ChevronRight,Building2,Package,AlertCircle,Plus,Trash2,Truck,Calculator,ArrowLeft,CheckCircle2} from 'lucide-react';
const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_ANON_KEY,db=url&&key?createClient(url,key):null;
const fmt=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
const digits=v=>String(v??'').replace(/\\D/g,'');
const rupiahInput=v=>digits(v).replace(/\\B(?=(\\d{3})+(?!\\d))/g,'.');
const rupiahNumber=v=>Number(digits(v)||0);
const blankItem=()=>({nama_barang:'',spesifikasi:'',volume:'1',satuan:'unit',harga_satuan:'0',keterangan:'',foto:null,sumber_referensi:'',nama_produk_ref:'',harga_ref:'',harga_katalog:'',tkdn:'',produk_dalam_negeri:false,umkm:false,sesuai_spesifikasi:true,bukti:null});
const blankProvider=()=>({nama_penyedia:'',link_produk:'',harga_satuan:'',foto_produk:null});
const blankOfficial=role=>({peran:role,nama:'',nip:'',jabatan:role,tanda_tangan:null});
const attachmentTypes=['Bukti e-Katalog','Penawaran penyedia','Data SIRUP','DPA / RKA','Dokumen lainnya'];
const blankForm=()=>({nama_paket:'',nama_opd_snapshot:'',alamat_opd_snapshot:'',nomor_surat:'',tanggal_surat:new Date().toISOString().slice(0,10),kode_rup:'',program:'',kegiatan:'',subkegiatan:'',kode_rekening:'',uraian_belanja:'',nilai_pagu:'',nilai_hps:'',waktu_pengadaan:'',kualifikasi_penyedia:'',tujuan_pengiriman:'',metode_pembayaran:'',bentuk_kontrak:'',metode_pengadaan:'',catatan:''});
function Login({onLogin,error,busy}){const [email,E]=useState(''),[password,P]=useState('');return <main className="login"><form className="login-card" onSubmit={e=>{e.preventDefault();onLogin(email,password)}}><div className="logo"><FileText size={28}/></div><small>PORTAL PEJABAT PENGADAAN</small><h1>Generator Surat <em>Pesanan PBJ</em></h1><p>Masuk untuk membuat dan mengelola dokumen pengadaan.</p><label>Email<input type="email" value={email} onChange={e=>E(e.target.value)} required/></label><label>Password<input type="password" value={password} onChange={e=>P(e.target.value)} required/></label>{error&&<div className="error">{error}</div>}<button className="primary" disabled={busy}>{busy?'Memproses…':'Masuk'}</button></form></main>}
function Field({label,value,set,type='text',required=false,placeholder='',wide=false}){return <label className={'field'+(wide?' wide':'')}>{label}<input type={type} value={value??''} onChange={e=>set(e.target.value)} required={required} placeholder={placeholder}/></label>}
function Area({label,value,set,wide=false}){return <label className={'field'+(wide?' wide':'')}>{label}<textarea rows="2" value={value??''} onChange={e=>set(e.target.value)}/></label>}
function Table({rows,onExport,onArchive,onHistory}){return !rows.length?<div className="empty"><FolderOpen/><b>Belum ada surat</b><span>Surat yang dibuat akan tampil di sini.</span></div>:<div className="table-wrap"><table><thead><tr><th>Nama paket</th><th>OPD</th><th>Kode RUP</th><th>Tanggal</th><th>Nilai pagu</th><th>Status</th><th>Dokumen</th></tr></thead><tbody>{rows.map(x=><tr key={x.id}><td><b>{x.nama_paket}</b><small>{x.nomor_surat||'Nomor surat belum diisi'}</small></td><td>{x.nama_opd_snapshot||'—'}</td><td>{x.kode_rup||'—'}</td><td>{x.tanggal_surat||'—'}</td><td>{fmt(x.nilai_pagu)}</td><td><span className="badge">{x.status}</span></td><td><div className="table-actions"><button className="outline-btn small-btn" onClick={()=>onExport?.(x.id)}>Cetak</button><button className="outline-btn small-btn" onClick={()=>onArchive?.(x.id)}>Arsipkan PDF</button><button className="outline-btn small-btn" onClick={()=>onHistory?.(x.id)}>Lihat arsip</button></div></td></tr>)}</tbody></table></div>}
function App(){
 const [session,S]=useState(null),[ready,R]=useState(false),[busy,B]=useState(false),[error,Err]=useState(''),[notice,N]=useState(''),[page,Page]=useState('home'),[rows,Rows]=useState([]),[search,Q]=useState('');
 const [form,F]=useState(blankForm()),[items,I]=useState([blankItem()]),[providers,V]=useState([blankProvider(),blankProvider(),blankProvider()]),[attachments,A]=useState([]),[officials,O]=useState([blankOfficial('PPTK'),blankOfficial('PPK')]),[kopFile,K]=useState(null),[reviewDate,RD]=useState(new Date().toISOString().slice(0,10)),[reviewItems,RI]=useState([{judul:'Kesesuaian spesifikasi teknis',status:'sesuai',catatan:''},{judul:'Kewajaran harga',status:'sesuai',catatan:''},{judul:'Prioritas produk dalam negeri / UMKM',status:'perlu_dilengkapi',catatan:''},{judul:'Kelengkapan dokumen pendukung',status:'perlu_dilengkapi',catatan:''}]),[reviewRecommendation,RR]=useState(''),[reviewNotes,RN]=useState('');
 useEffect(()=>{if(!db){R(true);return}db.auth.getSession().then(({data})=>{S(data.session);R(true)});const {data:{subscription}}=db.auth.onAuthStateChange((_,v)=>S(v));return()=>subscription.unsubscribe()},[]);
 useEffect(()=>{if(session)load()},[session]);
 async function load(){const {data,error}=await db.from('surat').select('id,nama_paket,nama_opd_snapshot,nomor_surat,tanggal_surat,kode_rup,nilai_pagu,status,created_at').order('created_at',{ascending:false});if(error)Err(error.message);else Rows(data||[])}
 async function login(email,password){B(true);Err('');const {error}=await db.auth.signInWithPassword({email,password});if(error)Err(error.message);B(false)}
 async function exportPdf(id){B(true);Err('');try{await openProcurementPrint(db,id)}catch(e){Err('Gagal menyiapkan dokumen: '+e.message)}finally{B(false)}}
 async function openArchive(id){
  B(true);Err('');
  try{
   const {data,error}=await db.from('arsip_pdf').select('nama_file,storage_path,versi,dibuat_pada').eq('surat_id',id).order('versi',{ascending:false});
   if(error)throw error;
   if(!data?.length){N('Belum ada PDF yang diarsipkan untuk surat ini.');return}
   const signed=await db.storage.from('arsip-pdf').createSignedUrl(data[0].storage_path,300);
   if(signed.error)throw signed.error;
   window.open(signed.data.signedUrl,'_blank','noopener');
   N('Membuka arsip '+data[0].nama_file+'.');
  }catch(e){Err('Gagal membuka arsip: '+e.message)}
  finally{B(false)}
 }
 async function archivePdf(id){
  B(true);Err('');N('');
  try{
   const html=await buildProcurementHtml(db,id);
   const host=document.createElement('div');host.style.position='fixed';host.style.left='-10000px';host.style.top='0';host.style.width='794px';host.innerHTML=html;
   document.body.appendChild(host);
   const content=host.querySelector('body')||host;
   const blob=await html2pdf().set({margin:0,filename:'surat-pesanan.pdf',image:{type:'jpeg',quality:0.96},html2canvas:{scale:2,useCORS:true,logging:false},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'}}).from(content).outputPdf('blob');
   host.remove();
   const {data:existing,error:lookupError}=await db.from('arsip_pdf').select('versi').eq('surat_id',id).order('versi',{ascending:false}).limit(1);
   if(lookupError)throw lookupError;
   const versi=(existing?.[0]?.versi||0)+1;
   const filename='surat-pesanan-v'+versi+'-'+id.slice(0,8)+'.pdf';
   const path=session.user.id+'/'+id+'/'+Date.now()+'-'+filename;
   const upload=await db.storage.from('arsip-pdf').upload(path,blob,{contentType:'application/pdf',upsert:false});
   if(upload.error)throw upload.error;
   const {error:saveError}=await db.from('arsip_pdf').insert({surat_id:id,nama_file:filename,storage_path:path,versi,ukuran_bytes:blob.size});
   if(saveError){await db.storage.from('arsip-pdf').remove([path]);throw saveError}
   const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
   N('PDF versi '+versi+' berhasil disimpan ke arsip dan diunduh.');
  }catch(e){Err('Gagal membuat arsip PDF: '+(e.message||e))}
  finally{B(false)}
 }
 const set=(k,v)=>F(old=>({...old,[k]:v}));
 const total=useMemo(()=>items.reduce((s,x)=>s+(Number(x.volume)||0)*(Number(x.harga_satuan)||0),0),[items]);
 const filtered=useMemo(()=>rows.filter(x=>[x.nama_paket,x.nama_opd_snapshot,x.kode_rup,x.nomor_surat].some(v=>(v||'').toLowerCase().includes(search.toLowerCase()))),[rows,search]);
 async function save(e){e.preventDefault();B(true);Err('');N('');
  if(!items.some(x=>x.nama_barang.trim())){Err('Tambahkan minimal satu nama barang sebelum menyimpan.');B(false);return}
  let opdId=null;
  const {data:existingOpd,error:opdLookupError}=await db.from('opd').select('id,kop_surat_path').eq('nama_opd',form.nama_opd_snapshot.trim()).limit(1).maybeSingle();
  if(opdLookupError){Err('Data OPD gagal diperiksa: '+opdLookupError.message);B(false);return}
  let kopPath=existingOpd?.kop_surat_path||null;
  if(kopFile){const ext=(kopFile.name.split('.').pop()||'png').replace(/[^a-z0-9]/gi,'').toLowerCase();const path=session.user.id+'/opd-'+Date.now()+'.'+ext;const up=await db.storage.from('kop-surat').upload(path,kopFile,{upsert:false,contentType:kopFile.type||'image/png'});if(up.error){Err('Gagal upload kop surat: '+up.error.message);B(false);return}kopPath=up.data.path}
  if(existingOpd){opdId=existingOpd.id;const {error:oe}=await db.from('opd').update({alamat:form.alamat_opd_snapshot||null,kop_surat_path:kopPath}).eq('id',opdId);if(oe){Err('Data OPD gagal diperbarui: '+oe.message);B(false);return}}
  else {const {data:createdOpd,error:oe}=await db.from('opd').insert({nama_opd:form.nama_opd_snapshot.trim(),alamat:form.alamat_opd_snapshot||null,kop_surat_path:kopPath}).select('id').single();if(oe){Err('Data OPD gagal disimpan: '+oe.message);B(false);return}opdId=createdOpd.id}
  const payload={...form,opd_id:opdId,nilai_pagu:form.nilai_pagu===''?null:rupiahNumber(form.nilai_pagu),nilai_hps:form.nilai_hps===''?null:rupiahNumber(form.nilai_hps)};
  const {data:letter,error}=await db.from('surat').insert(payload).select('id').single();
  if(error){Err(error.message);B(false);return}
  const chosen=items.filter(x=>x.nama_barang.trim());
  const goods=[];
  for(let i=0;i<chosen.length;i++){
   const x=chosen[i];let foto_produk_path=null;
   if(x.foto){const ext=(x.foto.name.split('.').pop()||'jpg').replace(/[^a-z0-9]/gi,'').toLowerCase();const path=session.user.id+'/'+letter.id+'/produk-'+(i+1)+'-'+Date.now()+'.'+ext;const up=await db.storage.from('foto-produk').upload(path,x.foto,{upsert:false,contentType:x.foto.type||'image/jpeg'});if(up.error){Err('Gagal upload foto produk: '+up.error.message);B(false);return}foto_produk_path=up.data.path}
   goods.push({surat_id:letter.id,nomor_urut:i+1,nama_barang:x.nama_barang.trim(),spesifikasi:x.spesifikasi||null,volume:Number(x.volume)||0,satuan:x.satuan||null,harga_satuan:rupiahNumber(x.harga_satuan),keterangan:x.keterangan||null,foto_produk_path});
  }
  const vendors=[];
  for(let i=0;i<providers.length;i++){
   const x=providers[i];if(!x.nama_penyedia.trim())continue;
   let foto_path=null;
   if(x.foto_produk){const ext=(x.foto_produk.name.split('.').pop()||'jpg').replace(/[^a-z0-9]/gi,'').toLowerCase();const path=session.user.id+'/'+letter.id+'/referensi-penyedia-'+(i+1)+'-'+Date.now()+'.'+ext;const up=await db.storage.from('dokumen-pendukung').upload(path,x.foto_produk,{upsert:false,contentType:x.foto_produk.type||'image/jpeg'});if(up.error){Err('Gagal upload foto referensi penyedia: '+up.error.message);B(false);return}foto_path=up.data.path}
   const detail={link_produk:x.link_produk||'',harga_satuan:rupiahNumber(x.harga_satuan),foto_path,urutan:i+1};
   vendors.push({surat_id:letter.id,nama_penyedia:x.nama_penyedia.trim(),nama_penanggung_jawab:null,alamat:null,nib:null,npwp:null,status_umkm:null,keterangan:JSON.stringify(detail)});
  }
  const [g,v]=await Promise.all([db.from('detail_barang').insert(goods).select('id,nomor_urut'),vendors.length?db.from('penyedia').insert(vendors):Promise.resolve({error:null})]);
  if(g.error||v.error){Err('Surat utama tersimpan, tetapi ada bagian detail yang gagal disimpan: '+(g.error?.message||v.error?.message));B(false);await load();return}
  const refs=[];
  for(let i=0;i<chosen.length;i++){const x=chosen[i];if(x.sumber_referensi||x.nama_produk_ref||x.harga_ref||x.harga_katalog){let bukti_path=null;if(x.bukti){const ext=(x.bukti.name.split('.').pop()||'pdf').replace(/[^a-z0-9]/gi,'').toLowerCase();const path=session.user.id+'/'+letter.id+'/bukti-harga-'+(i+1)+'-'+Date.now()+'.'+ext;const up=await db.storage.from('dokumen-pendukung').upload(path,x.bukti,{upsert:false,contentType:x.bukti.type||'application/octet-stream'});if(up.error){Err('Gagal upload bukti harga: '+up.error.message);B(false);return}bukti_path=up.data.path}
   refs.push({surat_id:letter.id,detail_barang_id:g.data[i].id,sumber_referensi:x.sumber_referensi||null,nama_produk:x.nama_produk_ref||null,harga:x.harga_ref===''?null:Number(x.harga_ref),harga_katalog:x.harga_katalog===''?null:Number(x.harga_katalog),sesuai_spesifikasi:x.sesuai_spesifikasi,produk_dalam_negeri:x.produk_dalam_negeri,tkdn:x.tkdn===''?null:Number(x.tkdn),umkm:x.umkm,bukti_path})}}
  if(refs.length){const {error:re}=await db.from('referensi_harga').insert(refs);if(re){Err('Referensi harga gagal disimpan: '+re.message);B(false);return}}
  for(let i=0;i<officials.length;i++){const x=officials[i];if(!x.nama.trim())continue;let tanda_tangan_path_snapshot=null;if(x.tanda_tangan){const ext=(x.tanda_tangan.name.split('.').pop()||'png').replace(/[^a-z0-9]/gi,'').toLowerCase();const path=session.user.id+'/'+letter.id+'/ttd-'+i+'-'+Date.now()+'.'+ext;const up=await db.storage.from('tanda-tangan').upload(path,x.tanda_tangan,{upsert:false,contentType:x.tanda_tangan.type||'image/png'});if(up.error){Err('Gagal upload tanda tangan '+x.peran+': '+up.error.message);B(false);return}tanda_tangan_path_snapshot=up.data.path}const {error:pe}=await db.from('surat_pejabat').insert({surat_id:letter.id,peran:x.peran,nama_snapshot:x.nama,nip_snapshot:x.nip||null,jabatan_snapshot:x.jabatan||null,tanda_tangan_path_snapshot});if(pe){Err('Data pejabat gagal disimpan: '+pe.message);B(false);return}}
  for(let i=0;i<attachments.length;i++){const item=attachments[i],f=item.file;const ext=(f.name.split('.').pop()||'bin').replace(/[^a-z0-9]/gi,'').toLowerCase();const path=session.user.id+'/'+letter.id+'/lampiran-'+(i+1)+'-'+Date.now()+'.'+ext;const up=await db.storage.from('dokumen-pendukung').upload(path,f,{upsert:false,contentType:f.type||'application/octet-stream'});if(up.error){Err('Lampiran gagal diunggah: '+up.error.message);B(false);return}const {error:meta}=await db.from('dokumen_pendukung').insert({surat_id:letter.id,kategori:item.kategori,nama_file:f.name,storage_path:up.data.path,mime_type:f.type||null,ukuran_bytes:f.size,nomor_urut:i+1});if(meta){Err('Metadata lampiran gagal disimpan: '+meta.message);B(false);return}}
  const reviewPayload={surat_id:letter.id,hasil_reviu:reviewItems,rekomendasi:reviewRecommendation||null,catatan:reviewNotes||null,tanggal_reviu:reviewDate||null};
  const {error:reviewError}=await db.from('reviu').insert(reviewPayload);
  if(reviewError){Err('Surat tersimpan, tetapi berita acara reviu gagal disimpan: '+reviewError.message);B(false);await load();return}
  N('Draft tersimpan: '+goods.length+' barang, '+refs.length+' referensi harga, '+vendors.length+' penyedia, '+attachments.length+' lampiran.');F(blankForm());I([blankItem()]);V([blankProvider(),blankProvider(),blankProvider()]);A([]);O([blankOfficial('PPTK'),blankOfficial('PPK')]);K(null);RD(new Date().toISOString().slice(0,10));RI([{judul:'Kesesuaian spesifikasi teknis',status:'sesuai',catatan:''},{judul:'Kewajaran harga',status:'sesuai',catatan:''},{judul:'Prioritas produk dalam negeri / UMKM',status:'perlu_dilengkapi',catatan:''},{judul:'Kelengkapan dokumen pendukung',status:'perlu_dilengkapi',catatan:''}]);RR('');RN('');await load();Page('data');B(false)
 }
 if(!ready)return <div className="loading">Memuat…</div>;
 if(!session)return <Login onLogin={login} error={error||(!db?'Konfigurasi Supabase belum dipasang. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY.':'')} busy={busy}/>;
 return <div className="shell"><aside><div className="brand"><div className="logo"><FileText/></div><b>Surat Pesanan<small>PBJ • PPBJ</small></b></div><span className="menu-label">MENU UTAMA</span><button className={page==='home'?'nav active':'nav'} onClick={()=>Page('home')}><LayoutDashboard/>Beranda</button><button className={page==='create'?'nav active':'nav'} onClick={()=>{Err('');N('');F(blankForm());I([blankItem()]);V([blankProvider(),blankProvider(),blankProvider()]);A([]);O([blankOfficial('PPTK'),blankOfficial('PPK')]);K(null);Page('create')}}><FilePlus2/>Buat Surat</button><button className={page==='data'?'nav active':'nav'} onClick={()=>{Page('data');load()}}><FolderOpen/>Data Surat <span className="count">{rows.length}</span></button><div className="side-bottom"><span>{session.user.email}</span><button className="nav" onClick={()=>db.auth.signOut()}><LogOut/>Keluar</button></div></aside>
 <main><header><div><small>PORTAL DOKUMEN PENGADAAN</small><h2>{page==='home'?'Beranda':page==='create'?'Buat Surat Pesanan':'Data Surat'}</h2></div><span className="connected">● Terhubung</span></header><section className="content">{error&&<div className="error"><AlertCircle size={16}/>{error}</div>}{notice&&<div className="success"><CheckCircle2 size={16}/>{notice}</div>}
 {page==='home'&&<><div className="hero"><small>PENGELOLAAN DOKUMEN PBJ</small><h1>Generator Surat<br/>Pesanan Pengadaan.</h1><p>Buat dokumen pengadaan, simpan sebagai arsip, dan temukan kembali kapan saja.</p><button className="light-btn" onClick={()=>Page('create')}><FilePlus2/> Mulai Buat Surat <ChevronRight/></button></div><div className="stats"><article><span>Total surat tersimpan</span><b>{rows.length}</b></article><article><span>Draft</span><b>{rows.filter(x=>x.status==='draft').length}</b></article><article><span>Dokumen selesai</span><b>{rows.filter(x=>x.status==='selesai').length}</b></article></div><section className="panel"><h3>Surat terbaru</h3><Table rows={rows.slice(0,5)} onExport={exportPdf} onArchive={archivePdf} onHistory={openArchive}/></section></>}
 {page==='create'&&<section className="panel"><div className="panel-head"><div><h3>Formulir surat pesanan</h3><p className="muted">Isi data sesuai paket pengadaan. Kolom yang tidak relevan boleh dikosongkan.</p></div><span className="step-tag">DRAFT BARU</span></div><form onSubmit={save}>
 <h4><Building2/> Identitas OPD dan surat</h4><div className="grid"><Field label="Nama OPD" value={form.nama_opd_snapshot} set={v=>set('nama_opd_snapshot',v)} required/><Field label="Nomor surat" value={form.nomor_surat} set={v=>set('nomor_surat',v)}/><Field label="Tanggal surat" type="date" value={form.tanggal_surat} set={v=>set('tanggal_surat',v)}/><Field label="Alamat OPD" value={form.alamat_opd_snapshot} set={v=>set('alamat_opd_snapshot',v)}/><label className="field">Kop surat / logo OPD<input type="file" accept="image/*" onChange={e=>K(e.target.files?.[0]||null)}/><small>{kopFile?.name||"Jika sudah pernah diunggah, kop lama akan digunakan."}</small></label><Field label="Kode RUP" value={form.kode_rup} set={v=>set('kode_rup',v)}/></div>
 <h4><FileText/> Informasi paket pengadaan</h4><div className="grid"><Field label="Nama paket pengadaan" value={form.nama_paket} set={v=>set('nama_paket',v)} required wide/><Field label="Program" value={form.program} set={v=>set('program',v)}/><Field label="Kegiatan" value={form.kegiatan} set={v=>set('kegiatan',v)}/><Field label="Subkegiatan" value={form.subkegiatan} set={v=>set('subkegiatan',v)}/><Field label="Kode rekening" value={form.kode_rekening} set={v=>set('kode_rekening',v)}/><Area label="Uraian belanja" value={form.uraian_belanja} set={v=>set('uraian_belanja',v)} wide/><Field label="Nilai pagu (Rp)" value={rupiahInput(form.nilai_pagu)} set={v=>set('nilai_pagu',rupiahInput(v))} placeholder="Contoh: 12.500.000"/><Field label="Nilai HPS (Rp)" value={rupiahInput(form.nilai_hps)} set={v=>set('nilai_hps',rupiahInput(v))} placeholder="Contoh: 10.000.000"/><Field label="Waktu pengadaan" value={form.waktu_pengadaan} set={v=>set('waktu_pengadaan',v)}/><Field label="Kualifikasi penyedia" value={form.kualifikasi_penyedia} set={v=>set('kualifikasi_penyedia',v)}/><Field label="Tujuan pengiriman" value={form.tujuan_pengiriman} set={v=>set('tujuan_pengiriman',v)}/><Field label="Metode pengadaan" value={form.metode_pengadaan} set={v=>set('metode_pengadaan',v)}/><Field label="Bentuk kontrak" value={form.bentuk_kontrak} set={v=>set('bentuk_kontrak',v)}/><Field label="Metode pembayaran" value={form.metode_pembayaran} set={v=>set('metode_pembayaran',v)}/></div>
 <div className="repeat-head"><h4><Package/> Rincian barang/jasa</h4><button type="button" className="outline-btn" onClick={()=>I(a=>[...a,blankItem()])}><Plus/> Tambah barang</button></div>
 {items.map((x,i)=><div className="repeat-card" key={i}><div className="repeat-title"><b>Barang {i+1}</b>{items.length>1&&<button type="button" className="icon-btn danger" onClick={()=>I(a=>a.filter((_,j)=>j!==i))}><Trash2 size={16}/></button>}</div><div className="grid"><Field label="Nama barang" value={x.nama_barang} set={v=>I(a=>a.map((z,j)=>j===i?{...z,nama_barang:v}:z))} required={i===0}/><Field label="Spesifikasi teknis" value={x.spesifikasi} set={v=>I(a=>a.map((z,j)=>j===i?{...z,spesifikasi:v}:z))}/><Field label="Volume" type="number" value={x.volume} set={v=>I(a=>a.map((z,j)=>j===i?{...z,volume:v}:z))}/><Field label="Satuan" value={x.satuan} set={v=>I(a=>a.map((z,j)=>j===i?{...z,satuan:v}:z))}/><Field label="Harga satuan (Rp)" value={rupiahInput(x.harga_satuan)} set={v=>I(a=>a.map((z,j)=>j===i?{...z,harga_satuan:rupiahInput(v)}:z))} placeholder="Contoh: 1.250.000"/><div className="line-total"><span>Jumlah harga</span><b>{fmt((Number(x.volume)||0)*(Number(x.harga_satuan)||0))}</b></div><Area label="Keterangan" value={x.keterangan} set={v=>I(a=>a.map((z,j)=>j===i?{...z,keterangan:v}:z))} wide/>
 <label className="field wide">Foto produk<input type="file" accept="image/*" onChange={e=>I(a=>a.map((z,j)=>j===i?{...z,foto:e.target.files?.[0]||null}:z))}/>{x.foto&&<small>{x.foto.name}</small>}</label>
 <div className="reference-box"><b>Referensi harga pembanding (opsional)</b><div className="grid">
 <Field label="Sumber referensi" value={x.sumber_referensi} set={v=>I(a=>a.map((z,j)=>j===i?{...z,sumber_referensi:v}:z))}/>
 <Field label="Nama produk pembanding" value={x.nama_produk_ref} set={v=>I(a=>a.map((z,j)=>j===i?{...z,nama_produk_ref:v}:z))}/>
 <Field label="Harga pembanding (Rp)" type="number" value={x.harga_ref} set={v=>I(a=>a.map((z,j)=>j===i?{...z,harga_ref:v}:z))}/>
 <Field label="Harga e-Katalog (Rp)" type="number" value={x.harga_katalog} set={v=>I(a=>a.map((z,j)=>j===i?{...z,harga_katalog:v}:z))}/>
 <Field label="TKDN (%)" type="number" value={x.tkdn} set={v=>I(a=>a.map((z,j)=>j===i?{...z,tkdn:v}:z))}/>
 <label className="check-field"><input type="checkbox" checked={x.sesuai_spesifikasi} onChange={e=>I(a=>a.map((z,j)=>j===i?{...z,sesuai_spesifikasi:e.target.checked}:z))}/> Sesuai spesifikasi</label>
 <label className="check-field"><input type="checkbox" checked={x.produk_dalam_negeri} onChange={e=>I(a=>a.map((z,j)=>j===i?{...z,produk_dalam_negeri:e.target.checked}:z))}/> Produk dalam negeri</label>
 <label className="check-field"><input type="checkbox" checked={x.umkm} onChange={e=>I(a=>a.map((z,j)=>j===i?{...z,umkm:e.target.checked}:z))}/> Produk UMKM</label>
 <label className="field wide">Bukti harga (gambar/PDF)<input type="file" accept="image/*,.pdf" onChange={e=>I(a=>a.map((z,j)=>j===i?{...z,bukti:e.target.files?.[0]||null}:z))}/>{x.bukti&&<small>{x.bukti.name}</small>}</label></div></div></div></div>)}
 <div className="grand-total"><div><Calculator/><span>Perkiraan total seluruh barang</span></div><b>{fmt(total)}</b></div>
 <div className="repeat-head"><h4><Truck/> Data penyedia</h4><button type="button" className="outline-btn" onClick={()=>V(a=>[...a,blankProvider()])}><Plus/> Tambah penyedia</button></div>
 <div className="provider-grid">{providers.map((x,i)=><div className="repeat-card provider-card" key={i}><div className="repeat-title"><b>Referensi Penyedia {i+1}</b>{providers.length>3&&<button type="button" className="icon-btn danger" onClick={()=>V(a=>a.filter((_,j)=>j!==i))}><Trash2 size={16}/></button>}</div><div className="grid"><Field label="Nama penyedia" value={x.nama_penyedia} set={v=>V(a=>a.map((z,j)=>j===i?{...z,nama_penyedia:v}:z))}/><Field label="Link produk E-Katalog INAPROC" value={x.link_produk} set={v=>V(a=>a.map((z,j)=>j===i?{...z,link_produk:v}:z))} placeholder="https://katalog.inaproc.id/..."/><Field label="Harga satuan (Rp)" value={rupiahInput(x.harga_satuan)} set={v=>V(a=>a.map((z,j)=>j===i?{...z,harga_satuan:rupiahInput(v)}:z))} placeholder="Contoh: 1.365.966"/><label className="field wide">Foto produk / screenshot E-Katalog<input type="file" accept="image/*" onChange={e=>V(a=>a.map((z,j)=>j===i?{...z,foto_produk:e.target.files?.[0]||null}:z))}/>{x.foto_produk&&<small>{x.foto_produk.name}</small>}</label></div></div>)}</div>
 <h4><Building2/> Pejabat penandatangan</h4><p className="muted">Data nama, NIP, jabatan, dan gambar tanda tangan disimpan sebagai snapshot pada surat ini.</p>
 {officials.map((x,i)=><div className="repeat-card" key={i}><div className="repeat-title"><b>{x.peran}</b></div><div className="grid"><Field label="Nama pejabat" value={x.nama} set={v=>O(a=>a.map((z,j)=>j===i?{...z,nama:v}:z))}/><Field label="NIP" value={x.nip} set={v=>O(a=>a.map((z,j)=>j===i?{...z,nip:v}:z))}/><Field label="Jabatan" value={x.jabatan} set={v=>O(a=>a.map((z,j)=>j===i?{...z,jabatan:v}:z))}/><label className="field">Gambar tanda tangan (PNG/JPG)<input type="file" accept="image/png,image/jpeg" onChange={e=>O(a=>a.map((z,j)=>j===i?{...z,tanda_tangan:e.target.files?.[0]||null}:z))}/>{x.tanda_tangan&&<small>{x.tanda_tangan.name}</small>}</label></div></div>)}
 <h4><FileText/> Dokumen pendukung</h4><p className="muted">Pilih jenis dokumen agar lampiran tersusun rapi di hasil cetak.</p>
 <div className="attachment-grid">{attachmentTypes.map(type=><label className="field attachment-type" key={type}>{type}<input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" onChange={e=>A(old=>[...old,...Array.from(e.target.files||[]).map(file=>({kategori:type,file}))])}/></label>)}</div>
 {attachments.length>0&&<div className="attachment-list">{attachments.map((x,i)=><div className="attachment-row" key={i}><span><b>{x.kategori}</b><small>{x.file.name}</small></span><button type="button" className="icon-btn danger" onClick={()=>A(old=>old.filter((_,j)=>j!==i))}><Trash2 size={16}/></button></div>)}</div>}
 <h4><CheckCircle2/> Berita acara reviu</h4><p className="muted">Isi hasil pemeriksaan berdasarkan dokumen dan bukti yang benar-benar telah diperiksa.</p>
 <div className="grid"><Field label="Tanggal reviu" type="date" value={reviewDate} set={RD}/></div>
 {reviewItems.map((item,i)=><div className="review-card" key={i}><div className="review-title"><b>{i+1}. {item.judul}</b><select value={item.status} onChange={e=>RI(old=>old.map((x,j)=>j===i?{...x,status:e.target.value}:x))}><option value="sesuai">Sesuai</option><option value="tidak_sesuai">Tidak sesuai</option><option value="perlu_dilengkapi">Perlu dilengkapi</option><option value="tidak_diperiksa">Tidak diperiksa</option></select></div><Area label="Catatan pemeriksaan" value={item.catatan} set={v=>RI(old=>old.map((x,j)=>j===i?{...x,catatan:v}:x))} wide/></div>)}
 <Area label="Rekomendasi hasil reviu" value={reviewRecommendation} set={RR} wide/>
 <Area label="Catatan berita acara reviu" value={reviewNotes} set={RN} wide/>
 <h4><FileText/> Catatan tambahan surat</h4><Area label="Catatan internal" value={form.catatan} set={v=>set('catatan',v)} wide/>
 <div className="actions"><span>Data disimpan sebagai draft dan dapat dilengkapi pada tahap berikutnya.</span><button className="primary" disabled={busy}><Save/> {busy?'Menyimpan…':'Simpan Draft'}</button></div></form></section>}
 {page==='data'&&<section className="panel"><div className="panel-head"><div><h3>Arsip surat pesanan</h3><p className="muted">Semua surat yang telah kamu simpan.</p></div><button className="primary" onClick={()=>Page('create')}><FilePlus2/> Buat Surat</button></div><div className="search"><Search/><input value={search} onChange={e=>Q(e.target.value)} placeholder="Cari nama paket, OPD, nomor surat, atau kode RUP…"/></div><Table rows={filtered} onExport={exportPdf} onArchive={archivePdf}/></section>}</section><footer>Generator Surat Pesanan PBJ • Sistem pengelolaan dokumen pribadi PPBJ</footer></main></div>
}
export default App;
