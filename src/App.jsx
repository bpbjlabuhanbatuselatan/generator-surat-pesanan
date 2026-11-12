import {useEffect,useMemo,useState} from 'react';
import {createClient} from '@supabase/supabase-js';
import {openProcurementPrint,openReviewPrint,buildProcurementHtml} from './printDocument';
import html2pdf from 'html2pdf.js';
import {FileText,FilePlus2,FolderOpen,LayoutDashboard,LogOut,Search,Save,ChevronRight,Building2,Package,AlertCircle,Plus,Trash2,Truck,Calculator,ArrowLeft,CheckCircle2} from 'lucide-react';
const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_ANON_KEY,db=url&&key?createClient(url,key):null;
const fmt=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
const digits=v=>String(v??'').replace(/\D/g,'');
const rupiahInput=v=>digits(v).replace(/\B(?=(\d{3})+(?!\d))/g,'.');
const rupiahNumber=v=>Number(digits(v)||0);
const blankSimilar=()=>({merek:'',spesifikasi:'',harga:''});
const blankItem=()=>({nama_barang:'',spesifikasi:'',volume:'1',satuan:'unit',harga_satuan:'0',keterangan:'',foto:null,produk_mirip:[blankSimilar()],produk_dalam_negeri:false,umkm:false,sesuai_spesifikasi:true,bukti:null});
const blankProvider=()=>({nama_penyedia:'',link_produk:'',harga_satuan:'',lokasi:'',kesesuaian:'Sesuai',prioritas:'PDN',foto_produk:null});
const blankOfficial=role=>({peran:role,nama:'',nip:'',jabatan:role,tanda_tangan:null});
const attachmentTypes=['Bukti e-Katalog','Penawaran penyedia','Data SIRUP','DPA / RKA','Dokumen lainnya'];
const blankForm=()=>({nama_paket:'',nama_opd_snapshot:'',alamat_opd_snapshot:'',nomor_surat:'',tanggal_surat:new Date().toISOString().slice(0,10),kode_rup:'',program:'',kegiatan:'',subkegiatan:'',kode_rekening:'',uraian_belanja:'',nilai_pagu:'',nilai_hps:'',waktu_pengadaan:'',kualifikasi_penyedia:'',tujuan_pengiriman:'',metode_pembayaran:'',bentuk_kontrak:'',metode_pengadaan:'',catatan:''});
function Login({onLogin,error,busy}){const [email,E]=useState(''),[password,P]=useState('');return <main className="login"><form className="login-card" onSubmit={e=>{e.preventDefault();onLogin(email,password)}}><div className="logo"><FileText size={28}/></div><small>PORTAL PEJABAT PENGADAAN</small><h1>Generator Surat <em>Pesanan PBJ</em></h1><p>Masuk untuk membuat dan mengelola dokumen pengadaan.</p><label>Email<input type="email" value={email} onChange={e=>E(e.target.value)} required/></label><label>Password<input type="password" value={password} onChange={e=>P(e.target.value)} required/></label>{error&&<div className="error">{error}</div>}<button className="primary" disabled={busy}>{busy?'Memproses…':'Masuk'}</button></form></main>}
function Field({label,value,set,type='text',required=false,placeholder='',wide=false}){return <label className={'field'+(wide?' wide':'')}>{label}<input type={type} value={value??''} onChange={e=>set(e.target.value)} required={required} placeholder={placeholder}/></label>}
function Area({label,value,set,wide=false}){return <label className={'field'+(wide?' wide':'')}>{label}<textarea rows="2" value={value??''} onChange={e=>set(e.target.value)}/></label>}
function Table({rows,onEdit,onExport,onReview,onArchive,onHistory,onDelete}){return !rows.length?<div className="empty"><FolderOpen/><b>Belum ada surat</b><span>Surat yang dibuat akan tampil di sini.</span></div>:<div className="table-wrap"><table><thead><tr><th>Nama paket</th><th>OPD</th><th>Kode RUP</th><th>Tanggal</th><th>Nilai pagu</th><th>Status</th><th>Dokumen</th><th>Hapus</th></tr></thead><tbody>{rows.map(x=><tr key={x.id}><td><b>{x.nama_paket}</b><small>{x.nomor_surat||'Nomor surat belum diisi'}</small></td><td>{x.nama_opd_snapshot||'—'}</td><td>{x.kode_rup||'—'}</td><td>{x.tanggal_surat||'—'}</td><td>{fmt(x.nilai_pagu)}</td><td><span className="badge">{x.status}</span></td><td><div className="table-actions"><button className="outline-btn small-btn" onClick={()=>onEdit?.(x.id)}>Edit</button><button className="outline-btn small-btn" onClick={()=>onExport?.(x.id)}>Cetak Surat</button><button className="outline-btn small-btn" onClick={()=>onReview?.(x.id)}>Cetak Reviu</button><button className="outline-btn small-btn" onClick={()=>onArchive?.(x.id)}>Arsipkan PDF</button><button className="outline-btn small-btn" onClick={()=>onHistory?.(x.id)}>Lihat arsip</button></div></td><td><button className="outline-btn small-btn danger-btn" disabled={!onDelete} onClick={()=>onDelete?.(x)}>Hapus</button></td></tr>)}</tbody></table></div>}
function App(){
 const [session,S]=useState(null),[ready,R]=useState(false),[busy,B]=useState(false),[error,Err]=useState(''),[notice,N]=useState(''),[page,Page]=useState('home'),[rows,Rows]=useState([]),[search,Q]=useState(''),[formTab,FormTab]=useState('surat');
 const [editId,EditId]=useState(null),[form,F]=useState(blankForm()),[items,I]=useState([blankItem()]),[providers,V]=useState([blankProvider(),blankProvider(),blankProvider()]),[attachments,A]=useState([]),[officials,O]=useState([blankOfficial('PPTK'),blankOfficial('PPK')]),[kopFile,K]=useState(null),[reviewNumber,RNo]=useState(''),[reviewDate,RD]=useState(new Date().toISOString().slice(0,10)),
[reviewItems,RI]=useState([{judul:'Kesesuaian spesifikasi teknis',status:'sesuai',catatan:''},{judul:'Kewajaran harga',status:'sesuai',catatan:''},{judul:'Prioritas produk dalam negeri / UMKM',status:'perlu_dilengkapi',catatan:''},{judul:'Kelengkapan dokumen pendukung',status:'perlu_dilengkapi',catatan:''}]),[reviewRecommendation,RR]=useState(''),[reviewNotes,RN]=useState(''),[reviewChecks,RC]=useState({daftar_hitam:'',sikap:'',pendokumentasian:'',lain_lain:''}),[reviewImages,RImg]=useState({daftar_hitam:[],sikap:[],pendokumentasian:[]});
 useEffect(()=>{if(!db){R(true);return}db.auth.getSession().then(({data})=>{S(data.session);R(true)});const {data:{subscription}}=db.auth.onAuthStateChange((_,v)=>S(v));return()=>subscription.unsubscribe()},[]);
 useEffect(()=>{if(session)load()},[session]);
 async function load(){const {data,error}=await db.from('surat').select('id,nama_paket,nama_opd_snapshot,nomor_surat,tanggal_surat,kode_rup,nilai_pagu,status,created_at').order('created_at',{ascending:false});if(error)Err(error.message);else Rows(data||[])}
 async function login(email,password){B(true);Err('');const {error}=await db.auth.signInWithPassword({email,password});if(error)Err(error.message);B(false)}
 async function exportPdf(id){B(true);Err('');try{await openProcurementPrint(db,id)}catch(e){Err('Gagal menyiapkan dokumen: '+e.message)}finally{B(false)}}
 async function exportReviewPdf(id){B(true);Err('');try{await openReviewPrint(db,id)}catch(e){Err('Gagal menyiapkan Berita Acara Reviu: '+e.message)}finally{B(false)}}
 async function openArchive(id){
  const archiveWindow=window.open('about:blank','_blank');
  B(true);Err('');N('');
  try{
   if(!archiveWindow)throw new Error('Browser memblokir tab arsip. Izinkan pop-up untuk situs ini lalu coba lagi.');
   const {data,error}=await db.from('arsip_pdf').select('nama_file,storage_path,versi,dibuat_pada').eq('surat_id',id).order('versi',{ascending:false});
   if(error)throw error;
   if(!data?.length){archiveWindow.close();N('Belum ada PDF yang diarsipkan untuk surat ini.');return}
   const signed=await db.storage.from('arsip-pdf').createSignedUrl(data[0].storage_path,300);
   if(signed.error)throw signed.error;
   archiveWindow.location.replace(signed.data.signedUrl);
   N('Arsip '+data[0].nama_file+' berhasil dibuka.');
  }catch(e){if(archiveWindow&&!archiveWindow.closed)archiveWindow.close();Err('Gagal membuka arsip: '+(e.message||e))}
  finally{B(false)}
 }
 async function deleteSurat(row){
  const ok=window.confirm('Hapus surat "'+(row.nama_paket||'')+'" beserta seluruh detail, lampiran, reviu, dan arsip PDF-nya? Tindakan ini tidak dapat dibatalkan.');
  if(!ok)return;
  B(true);Err('');N('');
  try{
   const id=row.id;
   const [docs,goods,officials,archives,vendors]=await Promise.all([
    db.from('dokumen_pendukung').select('storage_path').eq('surat_id',id),
    db.from('detail_barang').select('foto_produk_path').eq('surat_id',id),
    db.from('surat_pejabat').select('tanda_tangan_path_snapshot').eq('surat_id',id),
    db.from('arsip_pdf').select('storage_path').eq('surat_id',id),
    db.from('penyedia').select('keterangan').eq('surat_id',id)
   ]);
   for(const q of [docs,goods,officials,archives,vendors])if(q.error)throw q.error;
   const vendorPaths=(vendors.data||[]).map(v=>{try{return JSON.parse(v.keterangan||'{}').foto_path}catch{return null}}).filter(Boolean);
   const remove=async(bucket,paths)=>{const clean=[...new Set(paths.filter(Boolean))];if(clean.length){const out=await db.storage.from(bucket).remove(clean);if(out.error)throw out.error}};
   await remove('dokumen-pendukung',[...(docs.data||[]).map(x=>x.storage_path),...vendorPaths]);
   await remove('foto-produk',(goods.data||[]).map(x=>x.foto_produk_path));
   await remove('tanda-tangan',(officials.data||[]).map(x=>x.tanda_tangan_path_snapshot));
   await remove('arsip-pdf',(archives.data||[]).map(x=>x.storage_path));
   for(const table of ['dokumen_pendukung','arsip_pdf','referensi_harga','reviu','surat_pejabat','penyedia','detail_barang']){
    const out=await db.from(table).delete().eq('surat_id',id);if(out.error)throw out.error;
   }
   const out=await db.from('surat').delete().eq('id',id);if(out.error)throw out.error;
   N('Surat dan seluruh arsip terkait berhasil dihapus.');await load();
  }catch(e){Err('Gagal menghapus surat: '+(e.message||e))}
  finally{B(false)}
 }
 async function editSurat(id){
  B(true);Err('');N('');
  try{
   const [s,g,v,p,d,r,h]=await Promise.all([
    db.from('surat').select('*').eq('id',id).single(),
    db.from('detail_barang').select('*').eq('surat_id',id).order('nomor_urut'),
    db.from('penyedia').select('*').eq('surat_id',id).order('created_at'),
    db.from('surat_pejabat').select('*').eq('surat_id',id).order('created_at'),
    db.from('dokumen_pendukung').select('*').eq('surat_id',id).order('nomor_urut'),
    db.from('reviu').select('*').eq('surat_id',id).order('created_at',{ascending:false}).limit(1).maybeSingle(),
    db.from('referensi_harga').select('*').eq('surat_id',id)
   ]);
   for(const q of [s,g,v,p,d,r,h])if(q.error)throw q.error;
   const similar={};for(const z of h.data||[]){(similar[z.detail_barang_id]||=[]).push({merek:(z.nama_produk||'').split(' — ')[0]||'',spesifikasi:(z.nama_produk||'').split(' — ').slice(1).join(' — '),harga:z.harga==null?'':rupiahInput(z.harga)})}
   const x=s.data;F({...blankForm(),...x,nilai_pagu:x.nilai_pagu==null?'':rupiahInput(x.nilai_pagu),nilai_hps:x.nilai_hps==null?'':rupiahInput(x.nilai_hps)});
   I((g.data||[]).map(z=>({...blankItem(),...z,volume:String(z.volume??1),harga_satuan:rupiahInput(z.harga_satuan),foto:null,foto_produk_path:z.foto_produk_path||null,produk_mirip:similar[z.id]?.length?similar[z.id]:[blankSimilar()]})).concat((g.data||[]).length?[]:[blankItem()]));
   V((v.data||[]).map(z=>{let k={};try{k=JSON.parse(z.keterangan||'{}')}catch{}return {...blankProvider(),nama_penyedia:z.nama_penyedia,link_produk:k.link_produk||'',harga_satuan:rupiahInput(k.harga_satuan||''),lokasi:k.lokasi||'',kesesuaian:k.kesesuaian||'Sesuai',prioritas:k.prioritas||'PDN',existing_foto_path:k.foto_path||null}}).concat((v.data||[]).length?[]:[blankProvider(),blankProvider(),blankProvider()]));
   O((p.data||[]).map(z=>({...blankOfficial(z.peran),nama:z.nama_snapshot||'',nip:z.nip_snapshot||'',jabatan:z.jabatan_snapshot||z.peran,existing_signature_path:z.tanda_tangan_path_snapshot||null})).concat((p.data||[]).length?[]:[blankOfficial('PPTK'),blankOfficial('PPK')]));
   A((d.data||[]).filter(z=>!String(z.kategori||'').startsWith('Bukti Reviu - ')).map(z=>({...z,file:null,existing:true})));RImg({daftar_hitam:(d.data||[]).filter(z=>z.kategori==='Bukti Reviu - Daftar Hitam').map(z=>({...z,file:null,existing:true})),sikap:(d.data||[]).filter(z=>z.kategori==='Bukti Reviu - SIKaP').map(z=>({...z,file:null,existing:true})),pendokumentasian:(d.data||[]).filter(z=>z.kategori==='Bukti Reviu - Pendokumentasian').map(z=>({...z,file:null,existing:true}))});
   RNo(Array.isArray(r.data?.hasil_reviu)&&r.data.hasil_reviu[0]?r.data.hasil_reviu[0].nomor_berita_acara||'':'');RD(r.data?.tanggal_reviu||new Date().toISOString().slice(0,10));RI(Array.isArray(r.data?.hasil_reviu)?r.data.hasil_reviu:[]);RR(r.data?.rekomendasi||'');RN(r.data?.catatan||'');RC(Array.isArray(r.data?.hasil_reviu)&&r.data.hasil_reviu[0]?{daftar_hitam:r.data.hasil_reviu[0].daftar_hitam||'',sikap:r.data.hasil_reviu[0].sikap||'',pendokumentasian:r.data.hasil_reviu[0].pendokumentasian||'',lain_lain:r.data.hasil_reviu[0].lain_lain||''}:{daftar_hitam:'',sikap:'',pendokumentasian:'',lain_lain:''});
   EditId(id);FormTab('surat');Page('create');N('Data surat dimuat. Perubahan akan disimpan pada surat yang sama.');
  }catch(e){Err('Gagal memuat surat untuk diedit: '+(e.message||e))}
  finally{B(false)}
 }
 async function archivePdf(id){
  B(true);Err('');N('');
  let host=null;
  let uploadedPath=null;
  try{
   const html=await buildProcurementHtml(db,id);
   const parsed=new DOMParser().parseFromString(html,'text/html');
   host=document.createElement('div');
   host.style.position='absolute';host.style.left='0';host.style.top='0';host.style.width='794px';host.style.zIndex='-1';host.style.background='#fff';
   const style=document.createElement('style');
   style.textContent=Array.from(parsed.head.querySelectorAll('style')).map(x=>x.textContent).join('\n');
   host.appendChild(style);
   const content=document.createElement('div');content.className='pdf-render-root';content.style.width='794px';content.style.background='#fff';content.innerHTML=parsed.body.innerHTML;
   host.appendChild(content);document.body.appendChild(host);
   if(document.fonts?.ready)await document.fonts.ready;
   await Promise.all(Array.from(content.querySelectorAll('img')).map(img=>img.decode?img.decode().catch(()=>{}):new Promise(resolve=>{if(img.complete)return resolve();img.onload=resolve;img.onerror=resolve})));
   const blob=await html2pdf().set({margin:0,filename:'surat-pesanan.pdf',image:{type:'jpeg',quality:0.96},html2canvas:{scale:2,useCORS:true,logging:false,windowWidth:794,backgroundColor:'#ffffff'},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'}}).from(content).outputPdf('blob');
   if(!blob||blob.size<1000)throw new Error('PDF kosong atau terlalu kecil. Data belum berhasil dirender.');
   const {data:existing,error:lookupError}=await db.from('arsip_pdf').select('versi').eq('surat_id',id).order('versi',{ascending:false}).limit(1);
   if(lookupError)throw lookupError;
   const versi=(existing?.[0]?.versi||0)+1;
   const filename='surat-pesanan-v'+versi+'-'+id.slice(0,8)+'.pdf';
   const path=session.user.id+'/'+id+'/'+Date.now()+'-'+filename;
   const upload=await db.storage.from('arsip-pdf').upload(path,blob,{contentType:'application/pdf',upsert:false});
   if(upload.error)throw upload.error;
   uploadedPath=path;
   const {error:saveError}=await db.from('arsip_pdf').insert({surat_id:id,nama_file:filename,storage_path:path,versi,ukuran_bytes:blob.size});
   if(saveError){await db.storage.from('arsip-pdf').remove([path]);uploadedPath=null;throw saveError}
   uploadedPath=null;
   const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
   N('PDF versi '+versi+' berhasil disimpan ke arsip dan diunduh.');
  }catch(e){
   if(uploadedPath)await db.storage.from('arsip-pdf').remove([uploadedPath]).catch(()=>{});
   Err('Gagal membuat arsip PDF: '+(e.message||e));
  }finally{
   if(host)host.remove();
   B(false);
  }
 }
 const set=(k,v)=>F(old=>({...old,[k]:v}));
 const total=useMemo(()=>items.reduce((s,x)=>s+(Number(x.volume)||0)*rupiahNumber(x.harga_satuan),0),[items]);
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
  let letterId=editId;
  if(editId){const {error}=await db.from('surat').update(payload).eq('id',editId);if(error){Err(error.message);B(false);return}}
  else{const {data:letter,error}=await db.from('surat').insert(payload).select('id').single();if(error){Err(error.message);B(false);return}letterId=letter.id}
  if(editId){for(const table of ['dokumen_pendukung','referensi_harga','reviu','surat_pejabat','penyedia','detail_barang']){const {error}=await db.from(table).delete().eq('surat_id',letterId);if(error){Err('Gagal menyiapkan pembaruan '+table+': '+error.message);B(false);return}}}
  const chosen=items.filter(x=>x.nama_barang.trim());
  const goods=[];
  for(let i=0;i<chosen.length;i++){
   const x=chosen[i];let foto_produk_path=x.foto_produk_path||null;
   if(x.foto){const ext=(x.foto.name.split('.').pop()||'jpg').replace(/[^a-z0-9]/gi,'').toLowerCase();const path=session.user.id+'/'+letterId+'/produk-'+(i+1)+'-'+Date.now()+'.'+ext;const up=await db.storage.from('foto-produk').upload(path,x.foto,{upsert:false,contentType:x.foto.type||'image/jpeg'});if(up.error){Err('Gagal upload foto produk: '+up.error.message);B(false);return}foto_produk_path=up.data.path}
   goods.push({surat_id:letterId,nomor_urut:i+1,nama_barang:x.nama_barang.trim(),spesifikasi:x.spesifikasi||null,volume:Number(x.volume)||0,satuan:x.satuan||null,harga_satuan:rupiahNumber(x.harga_satuan),keterangan:x.keterangan||null,foto_produk_path});
  }
  const vendors=[];
  for(let i=0;i<providers.length;i++){
   const x=providers[i];if(!x.nama_penyedia.trim())continue;
   let foto_path=x.existing_foto_path||null;
   if(x.foto_produk){const ext=(x.foto_produk.name.split('.').pop()||'jpg').replace(/[^a-z0-9]/gi,'').toLowerCase();const path=session.user.id+'/'+letterId+'/referensi-penyedia-'+(i+1)+'-'+Date.now()+'.'+ext;const up=await db.storage.from('dokumen-pendukung').upload(path,x.foto_produk,{upsert:false,contentType:x.foto_produk.type||'image/jpeg'});if(up.error){Err('Gagal upload foto referensi penyedia: '+up.error.message);B(false);return}foto_path=up.data.path}
   const detail={link_produk:x.link_produk||'',harga_satuan:rupiahNumber(x.harga_satuan),lokasi:x.lokasi||'',kesesuaian:x.kesesuaian||'Sesuai',prioritas:x.prioritas||'PDN',foto_path,urutan:i+1};
   vendors.push({surat_id:letterId,nama_penyedia:x.nama_penyedia.trim(),nama_penanggung_jawab:null,alamat:null,nib:null,npwp:null,status_umkm:null,keterangan:JSON.stringify(detail)});
  }
  const [g,v]=await Promise.all([db.from('detail_barang').insert(goods).select('id,nomor_urut'),vendors.length?db.from('penyedia').insert(vendors):Promise.resolve({error:null})]);
  if(g.error||v.error){Err('Surat utama tersimpan, tetapi ada bagian detail yang gagal disimpan: '+(g.error?.message||v.error?.message));B(false);await load();return}
  const refs=[];
  for(let i=0;i<chosen.length;i++){const x=chosen[i];for(let k=0;k<(x.produk_mirip||[]).length;k++){const r=x.produk_mirip[k];if(!r.merek&&!r.spesifikasi&&!r.harga)continue;refs.push({surat_id:letterId,detail_barang_id:g.data[i].id,sumber_referensi:'Produk sejenis berdasarkan spesifikasi',nama_produk:[r.merek,r.spesifikasi].filter(Boolean).join(' — ')||null,harga:r.harga===''?null:rupiahNumber(r.harga),harga_katalog:null,sesuai_spesifikasi:true,produk_dalam_negeri:false,tkdn:null,umkm:false,bukti_path:null})}}
  if(refs.length){const {error:re}=await db.from('referensi_harga').insert(refs);if(re){Err('Referensi harga gagal disimpan: '+re.message);B(false);return}}
  for(let i=0;i<officials.length;i++){const x=officials[i];if(!x.nama.trim())continue;let tanda_tangan_path_snapshot=x.existing_signature_path||null;if(x.tanda_tangan){const ext=(x.tanda_tangan.name.split('.').pop()||'png').replace(/[^a-z0-9]/gi,'').toLowerCase();const path=session.user.id+'/'+letterId+'/ttd-'+i+'-'+Date.now()+'.'+ext;const up=await db.storage.from('tanda-tangan').upload(path,x.tanda_tangan,{upsert:false,contentType:x.tanda_tangan.type||'image/png'});if(up.error){Err('Gagal upload tanda tangan '+x.peran+': '+up.error.message);B(false);return}tanda_tangan_path_snapshot=up.data.path}const {error:pe}=await db.from('surat_pejabat').insert({surat_id:letterId,peran:x.peran,nama_snapshot:x.nama,nip_snapshot:x.nip||null,jabatan_snapshot:x.jabatan||null,tanda_tangan_path_snapshot});if(pe){Err('Data pejabat gagal disimpan: '+pe.message);B(false);return}}
  const reviewAttachmentItems=Object.entries(reviewImages).flatMap(([key,list])=>list.map(x=>({...x,kategori:'Bukti Reviu - '+({daftar_hitam:'Daftar Hitam',sikap:'SIKaP',pendokumentasian:'Pendokumentasian'}[key])})));const allAttachments=[...attachments,...reviewAttachmentItems];for(let i=0;i<allAttachments.length;i++){const item=allAttachments[i];if(item.existing&&!item.file){const {error:meta}=await db.from('dokumen_pendukung').insert({surat_id:letterId,kategori:item.kategori,nama_file:item.nama_file,storage_path:item.storage_path,mime_type:item.mime_type||null,ukuran_bytes:item.ukuran_bytes||null,nomor_urut:i+1});if(meta){Err('Metadata lampiran gagal disimpan: '+meta.message);B(false);return}continue}if(!item.file)continue;const f=item.file;const ext=(f.name.split('.').pop()||'bin').replace(/[^a-z0-9]/gi,'').toLowerCase();const path=session.user.id+'/'+letterId+'/lampiran-'+(i+1)+'-'+Date.now()+'.'+ext;const up=await db.storage.from('dokumen-pendukung').upload(path,f,{upsert:false,contentType:f.type||'application/octet-stream'});if(up.error){Err('Lampiran gagal diunggah: '+up.error.message);B(false);return}const {error:meta}=await db.from('dokumen_pendukung').insert({surat_id:letterId,kategori:item.kategori,nama_file:f.name,storage_path:up.data.path,mime_type:f.type||null,ukuran_bytes:f.size,nomor_urut:i+1});if(meta){Err('Metadata lampiran gagal disimpan: '+meta.message);B(false);return}}
  const reviewPayload={surat_id:letterId,hasil_reviu:[{...reviewChecks,nomor_berita_acara:reviewNumber.trim()}],rekomendasi:reviewRecommendation||null,catatan:reviewNotes||null,tanggal_reviu:reviewDate||null};
  const {error:reviewError}=await db.from('reviu').insert(reviewPayload);
  if(reviewError){Err('Surat tersimpan, tetapi berita acara reviu gagal disimpan: '+reviewError.message);B(false);await load();return}
  N(editId?'Perubahan berhasil disimpan pada surat yang sama.':'Draft tersimpan: '+goods.length+' barang, '+refs.length+' referensi harga, '+vendors.length+' penyedia, '+attachments.length+' lampiran.');EditId(null);F(blankForm());I([blankItem()]);V([blankProvider(),blankProvider(),blankProvider()]);A([]);O([blankOfficial('PPTK'),blankOfficial('PPK')]);K(null);RNo('');RD(new Date().toISOString().slice(0,10));RI([{judul:'Kesesuaian spesifikasi teknis',status:'sesuai',catatan:''},{judul:'Kewajaran harga',status:'sesuai',catatan:''},{judul:'Prioritas produk dalam negeri / UMKM',status:'perlu_dilengkapi',catatan:''},{judul:'Kelengkapan dokumen pendukung',status:'perlu_dilengkapi',catatan:''}]);RR('');RN('');RC({daftar_hitam:'',sikap:'',pendokumentasian:'',lain_lain:''});RImg({daftar_hitam:[],sikap:[],pendokumentasian:[]});await load();Page('data');B(false)
 }
 if(!ready)return <div className="loading">Memuat…</div>;
 if(!session)return <Login onLogin={login} error={error||(!db?'Konfigurasi Supabase belum dipasang. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY.':'')} busy={busy}/>;
 return <div className="shell"><aside><div className="brand"><div className="logo"><FileText/></div><b>Surat Pesanan<small>PBJ • PPBJ</small></b></div><span className="menu-label">MENU UTAMA</span><button className={page==='home'?'nav active':'nav'} onClick={()=>Page('home')}><LayoutDashboard/>Beranda</button><button className={page==='create'?'nav active':'nav'} onClick={()=>{Err('');N('');F(blankForm());I([blankItem()]);V([blankProvider(),blankProvider(),blankProvider()]);A([]);O([blankOfficial('PPTK'),blankOfficial('PPK')]);K(null);Page('create')}}><FilePlus2/>Buat Surat</button><button className={page==='data'?'nav active':'nav'} onClick={()=>{Page('data');load()}}><FolderOpen/>Data Surat <span className="count">{rows.length}</span></button><div className="side-bottom"><span>{session.user.email}</span><button className="nav" onClick={()=>db.auth.signOut()}><LogOut/>Keluar</button></div></aside>
 <main><header><div><small>PORTAL DOKUMEN PENGADAAN</small><h2>{page==='home'?'Beranda':page==='create'?'Buat Surat Pesanan':'Data Surat'}</h2></div><span className="connected">● Terhubung</span></header><section className="content">{error&&<div className="error"><AlertCircle size={16}/>{error}</div>}{notice&&<div className="success"><CheckCircle2 size={16}/>{notice}</div>}
 {page==='home'&&<><div className="hero"><small>PENGELOLAAN DOKUMEN PBJ</small><h1>Generator Surat<br/>Pesanan Pengadaan.</h1><p>Buat dokumen pengadaan, simpan sebagai arsip, dan temukan kembali kapan saja.</p><button className="light-btn" onClick={()=>Page('create')}><FilePlus2/> Mulai Buat Surat <ChevronRight/></button></div><div className="stats"><article><span>Total surat tersimpan</span><b>{rows.length}</b></article><article><span>Draft</span><b>{rows.filter(x=>x.status==='draft').length}</b></article><article><span>Dokumen selesai</span><b>{rows.filter(x=>x.status==='selesai').length}</b></article></div><section className="panel"><h3>Surat terbaru</h3><Table rows={rows.slice(0,5)} onExport={exportPdf} onReview={exportReviewPdf} onArchive={archivePdf} onHistory={openArchive} onDelete={deleteSurat}/></section></>}
 {page==='create'&&<section className="panel"><div className="panel-head"><div><h3>Formulir surat pesanan</h3><p className="muted">Isi data sesuai paket pengadaan. Kolom yang tidak relevan boleh dikosongkan.</p></div><span className="step-tag">DRAFT BARU</span></div><form onSubmit={save}>
 <div className="form-tabs"><button type="button" className={formTab==='surat'?'form-tab active':'form-tab'} onClick={()=>FormTab('surat')}>01 · Surat Pesanan</button><button type="button" className={formTab==='review'?'form-tab active':'form-tab'} onClick={()=>FormTab('review')}>02 · Berita Acara Reviu</button></div>{formTab==='surat'&&<>
 <h4><Building2/> Identitas OPD dan surat</h4><div className="grid"><label className="field">Pilih Dinas / Instansi<select value={form.nama_opd_snapshot} onChange={e=>set('nama_opd_snapshot',e.target.value)} required><option value="">Pilih instansi…</option><option value="DINAS PERPUSTAKAAN DAN ARSIP">Dinas Perpustakaan dan Arsip</option><option value="SATUAN POLISI PAMONG PRAJA DAN PEMADAM KEBAKARAN">Satuan Polisi Pamong Praja dan Pemadam Kebakaran</option><option value="DINAS PENANAMAN MODAL DAN PELAYANAN TERPADU SATU PINTU">Dinas Penanaman Modal dan Pelayanan Terpadu Satu Pintu</option></select></label><Field label="Nomor surat" value={form.nomor_surat} set={v=>set('nomor_surat',v)}/><Field label="Tanggal surat" type="date" value={form.tanggal_surat} set={v=>set('tanggal_surat',v)}/><Field label="Alamat OPD" value={form.alamat_opd_snapshot} set={v=>set('alamat_opd_snapshot',v)}/><label className="field">Kop surat / logo OPD<input type="file" accept="image/*" onChange={e=>K(e.target.files?.[0]||null)}/><small>{kopFile?.name||"Unggah kop instansi ini satu kali. Kop tersimpan untuk pilihan dinas tersebut."}</small></label><Field label="Kode RUP" value={form.kode_rup} set={v=>set('kode_rup',v)}/></div>
 <h4><FileText/> Informasi paket pengadaan</h4><div className="grid"><Field label="Nama paket pengadaan" value={form.nama_paket} set={v=>set('nama_paket',v)} required wide/><Field label="Program" value={form.program} set={v=>set('program',v)}/><Field label="Kegiatan" value={form.kegiatan} set={v=>set('kegiatan',v)}/><Field label="Subkegiatan" value={form.subkegiatan} set={v=>set('subkegiatan',v)}/><Field label="Kode rekening" value={form.kode_rekening} set={v=>set('kode_rekening',v)}/><Area label="Uraian belanja" value={form.uraian_belanja} set={v=>set('uraian_belanja',v)} wide/><Field label="Nilai pagu (Rp)" value={rupiahInput(form.nilai_pagu)} set={v=>set('nilai_pagu',rupiahInput(v))} placeholder="Contoh: 12.500.000"/><Field label="Nilai HPS (Rp)" value={rupiahInput(form.nilai_hps)} set={v=>set('nilai_hps',rupiahInput(v))} placeholder="Contoh: 10.000.000"/><Field label="Waktu pengadaan" value={form.waktu_pengadaan} set={v=>set('waktu_pengadaan',v)}/><Field label="Kualifikasi penyedia" value={form.kualifikasi_penyedia} set={v=>set('kualifikasi_penyedia',v)}/><Field label="Tujuan pengiriman" value={form.tujuan_pengiriman} set={v=>set('tujuan_pengiriman',v)}/><Field label="Metode pengadaan" value={form.metode_pengadaan} set={v=>set('metode_pengadaan',v)}/><Field label="Bentuk kontrak" value={form.bentuk_kontrak} set={v=>set('bentuk_kontrak',v)}/><Field label="Metode pembayaran" value={form.metode_pembayaran} set={v=>set('metode_pembayaran',v)}/></div>
 <div className="repeat-head"><h4><Package/> Rincian barang/jasa</h4><button type="button" className="outline-btn" onClick={()=>I(a=>[...a,blankItem()])}><Plus/> Tambah barang</button></div>
 {items.map((x,i)=><div className="repeat-card" key={i}><div className="repeat-title"><b>Barang {i+1}</b>{items.length>1&&<button type="button" className="icon-btn danger" onClick={()=>I(a=>a.filter((_,j)=>j!==i))}><Trash2 size={16}/></button>}</div><div className="grid"><Field label="Nama barang" value={x.nama_barang} set={v=>I(a=>a.map((z,j)=>j===i?{...z,nama_barang:v}:z))} required={i===0}/><Field label="Spesifikasi teknis" value={x.spesifikasi} set={v=>I(a=>a.map((z,j)=>j===i?{...z,spesifikasi:v}:z))}/><Field label="Volume" type="number" value={x.volume} set={v=>I(a=>a.map((z,j)=>j===i?{...z,volume:v}:z))}/><Field label="Satuan" value={x.satuan} set={v=>I(a=>a.map((z,j)=>j===i?{...z,satuan:v}:z))}/><Field label="Harga satuan (Rp)" value={rupiahInput(x.harga_satuan)} set={v=>I(a=>a.map((z,j)=>j===i?{...z,harga_satuan:rupiahInput(v)}:z))} placeholder="Contoh: 1.250.000"/><div className="line-total"><span>Jumlah harga</span><b>{fmt((Number(x.volume)||0)*rupiahNumber(x.harga_satuan))}</b></div><Area label="Keterangan" value={x.keterangan} set={v=>I(a=>a.map((z,j)=>j===i?{...z,keterangan:v}:z))} wide/>
 <label className="field wide">Foto produk<input type="file" accept="image/*" onChange={e=>I(a=>a.map((z,j)=>j===i?{...z,foto:e.target.files?.[0]||null}:z))}/>{x.foto&&<small>{x.foto.name}</small>}</label>
 <div className="reference-box"><div className="repeat-head"><b>Produk Sejenis Berdasarkan Spesifikasi (Opsional)</b><button type="button" className="outline-btn" onClick={()=>I(a=>a.map((z,j)=>j===i?{...z,produk_mirip:[...(z.produk_mirip||[]),blankSimilar()]}:z))}><Plus/> Tambah produk</button></div><p className="muted">Tambahkan satu atau beberapa produk yang memiliki spesifikasi mendekati kebutuhan. Bukan penetapan penyedia atau pemenang.</p><div className="similar-grid">{(x.produk_mirip||[]).map((r,k)=><div className="similar-card" key={k}><div className="repeat-title"><b>Produk sejenis {k+1}</b>{(x.produk_mirip||[]).length>1&&<button type="button" className="icon-btn danger" onClick={()=>I(a=>a.map((z,j)=>j===i?{...z,produk_mirip:z.produk_mirip.filter((_,n)=>n!==k)}:z))}><Trash2 size={16}/></button>}</div><div className="grid"><Field label="Merek produk sejenis" value={r.merek} set={v=>I(a=>a.map((z,j)=>j===i?{...z,produk_mirip:z.produk_mirip.map((q,n)=>n===k?{...q,merek:v}:q)}:z))} placeholder="Contoh: ASUS, Acer, Lenovo"/><Field label="Spesifikasi produk sejenis" value={r.spesifikasi} set={v=>I(a=>a.map((z,j)=>j===i?{...z,produk_mirip:z.produk_mirip.map((q,n)=>n===k?{...q,spesifikasi:v}:q)}:z))} placeholder="Contoh: Core i3, RAM 8 GB, SSD 512 GB"/><Field label="Harga satuan produk sejenis (Rp)" value={rupiahInput(r.harga)} set={v=>I(a=>a.map((z,j)=>j===i?{...z,produk_mirip:z.produk_mirip.map((q,n)=>n===k?{...q,harga:rupiahInput(v)}:q)}:z))} placeholder="Contoh: 6.500.000"/></div></div>)}</div></div></div></div>)}
 <div className="grand-total"><div><Calculator/><span>Perkiraan total seluruh barang</span></div><b>{fmt(total)}</b></div>
 <div className="repeat-head"><h4><Truck/> Data penyedia</h4><button type="button" className="outline-btn" onClick={()=>V(a=>[...a,blankProvider()])}><Plus/> Tambah penyedia</button></div>
 <div className="provider-grid">{providers.map((x,i)=><div className="repeat-card provider-card" key={i}><div className="repeat-title"><b>Referensi Penyedia {i+1}</b>{providers.length>3&&<button type="button" className="icon-btn danger" onClick={()=>V(a=>a.filter((_,j)=>j!==i))}><Trash2 size={16}/></button>}</div><div className="grid"><Field label="Nama penyedia" value={x.nama_penyedia} set={v=>V(a=>a.map((z,j)=>j===i?{...z,nama_penyedia:v}:z))}/><Field label="Link produk E-Katalog INAPROC" value={x.link_produk} set={v=>V(a=>a.map((z,j)=>j===i?{...z,link_produk:v}:z))} placeholder="https://katalog.inaproc.id/..."/><Field label="Harga satuan E-Katalog (Rp)" value={rupiahInput(x.harga_satuan)} set={v=>V(a=>a.map((z,j)=>j===i?{...z,harga_satuan:rupiahInput(v)}:z))} placeholder="Contoh: 1.365.966"/><Field label="Lokasi penyedia / produk" value={x.lokasi} set={v=>V(a=>a.map((z,j)=>j===i?{...z,lokasi:v}:z))} placeholder="Contoh: Medan, Sumatera Utara"/><label className="field">Kesesuaian spesifikasi<select value={x.kesesuaian} onChange={e=>V(a=>a.map((z,j)=>j===i?{...z,kesesuaian:e.target.value}:z))}><option>Sesuai</option><option>Sebagian sesuai</option><option>Tidak sesuai</option></select></label><label className="field">Prioritas produk<select value={x.prioritas} onChange={e=>V(a=>a.map((z,j)=>j===i?{...z,prioritas:e.target.value}:z))}><option value="PDN">Produk Dalam Negeri</option><option value="UMKM">Produk UMKM</option><option value="PDN + UMKM">PDN + UMKM</option><option value="Lainnya">Lainnya</option></select></label><label className="field wide">Foto produk / screenshot E-Katalog<input type="file" accept="image/*" onChange={e=>V(a=>a.map((z,j)=>j===i?{...z,foto_produk:e.target.files?.[0]||null}:z))}/>{x.foto_produk&&<small>{x.foto_produk.name}</small>}</label></div></div>)}</div>
 <h4><Building2/> Pejabat penandatangan</h4><p className="muted">Data nama, NIP, jabatan, dan gambar tanda tangan disimpan sebagai snapshot pada surat ini.</p>
 {officials.map((x,i)=><div className="repeat-card" key={i}><div className="repeat-title"><b>{x.peran}</b></div><div className="grid"><Field label="Nama pejabat" value={x.nama} set={v=>O(a=>a.map((z,j)=>j===i?{...z,nama:v}:z))}/><Field label="NIP" value={x.nip} set={v=>O(a=>a.map((z,j)=>j===i?{...z,nip:v}:z))}/><Field label="Jabatan" value={x.jabatan} set={v=>O(a=>a.map((z,j)=>j===i?{...z,jabatan:v}:z))}/><label className="field">Gambar tanda tangan (PNG/JPG)<input type="file" accept="image/png,image/jpeg" onChange={e=>O(a=>a.map((z,j)=>j===i?{...z,tanda_tangan:e.target.files?.[0]||null}:z))}/>{x.tanda_tangan&&<small>{x.tanda_tangan.name}</small>}</label></div></div>)}
 <h4><FileText/> Dokumen pendukung</h4><p className="muted">Pilih jenis dokumen agar lampiran tersusun rapi di hasil cetak.</p>
 <div className="attachment-grid">{attachmentTypes.map(type=><label className="field attachment-type" key={type}>{type}<input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={e=>A(old=>[...old,...Array.from(e.target.files||[]).map(file=>({kategori:type,file}))])}/></label>)}</div>
 {attachments.length>0&&<div className="attachment-list">{attachments.map((x,i)=><div className="attachment-row" key={i}><span><b>{x.kategori}</b><small>{x.file?.name||x.nama_file||'File tersimpan'}</small></span><button type="button" className="icon-btn danger" onClick={()=>A(old=>old.filter((_,j)=>j!==i))}><Trash2 size={16}/></button></div>)}</div>}
 </>}{formTab==='review'&&<>
 <div className="review-intro"><h3>Berita Acara Reviu</h3><p>Isi pemeriksaan dan rekomendasi pada tab terpisah. Data reviu tetap terkait dengan surat yang dibuat.</p></div>
 <h4><CheckCircle2/> Berita acara reviu</h4><p className="muted">Isi hasil pemeriksaan berdasarkan dokumen dan bukti yang benar-benar telah diperiksa.</p>
 <div className="grid"><Field label="Nomor Berita Acara Reviu" value={reviewNumber} set={RNo} placeholder="Masukkan nomor berita acara reviu"/><Field label="Tanggal reviu" type="date" value={reviewDate} set={RD}/></div>
 <div className="review-card"><b>Format reviu mengikuti template Berita Acara Reviu Dokumen Persiapan Pengadaan E-Purchasing.</b><p className="muted">Isi pokok, urutan tinjauan, rekomendasi, dan tanggapan dicetak sesuai template. Identitas OPD, alamat, paket, nilai HPS, kode RUP, produk, foto produk, penyedia, serta tanda tangan diambil dari data Surat Pesanan.</p></div>
 <div className="review-card"><b>Hasil pemeriksaan penyedia dan dokumentasi</b><p className="muted">Unggah tangkapan layar hasil pemeriksaan di kolom gambar berikut. Bukti akan menjadi lampiran khusus Berita Acara Reviu.</p></div>
 <div className="grid">
{['daftar_hitam','sikap','pendokumentasian'].map((key)=>{const labels={daftar_hitam:'Bukti Pemeriksaan Daftar Hitam Penyedia',sikap:'Bukti Verifikasi SIKaP',pendokumentasian:'Dokumentasi Pendukung Reviu'};return <label className="field review-image-field" key={key}><span>{labels[key]}</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>RImg(old=>({...old,[key]:[...(old[key]||[]),...Array.from(e.target.files||[]).map(file=>({file}))]}))}/><small>Unggah tangkapan layar JPG, PNG, atau WEBP. Gambar akan dicetak pada lampiran Berita Acara Reviu.</small>{reviewImages[key]?.length>0&&<div className="attachment-list">{reviewImages[key].map((x,i)=><div className="attachment-row" key={i}><span><b>{labels[key]}</b><small>{x.file?.name||x.nama_file||'Gambar tersimpan'}</small></span><button type="button" className="icon-btn danger" onClick={()=>RImg(old=>({...old,[key]:old[key].filter((_,j)=>j!==i)}))}><Trash2 size={16}/></button></div>)}</div>}</label>})}


  <Area label="Lain-lain" value={reviewChecks.lain_lain} set={v=>RC(x=>({...x,lain_lain:v}))} wide/>
 </div>
 <Area label="Rekomendasi hasil reviu (opsional)" value={reviewRecommendation} set={RR} wide/>
 <Area label="Catatan berita acara reviu (opsional)" value={reviewNotes} set={RN} wide/>
 </>}
 <div className="actions"><span>{formTab==='surat'?'Simpan data Surat Pesanan terlebih dahulu, lalu lengkapi tab reviu.':'Simpan perubahan form Surat Pesanan dan Berita Acara Reviu.'}</span><button className="primary" disabled={busy}><Save/> {busy?'Menyimpan…':editId?'Simpan Perubahan':'Simpan Draft'}</button></div></form></section>}
 {page==='data'&&<section className="panel"><div className="panel-head"><div><h3>Arsip surat pesanan</h3><p className="muted">Semua surat yang telah kamu simpan.</p></div><button className="primary" onClick={()=>Page('create')}><FilePlus2/> Buat Surat</button></div><div className="search"><Search/><input value={search} onChange={e=>Q(e.target.value)} placeholder="Cari nama paket, OPD, nomor surat, atau kode RUP…"/></div><Table rows={filtered} onEdit={editSurat} onExport={exportPdf} onReview={exportReviewPdf} onArchive={archivePdf} onDelete={deleteSurat}/></section>}</section><footer>Generator Surat Pesanan PBJ • Sistem pengelolaan dokumen pribadi PPBJ</footer></main></div>
}
export default App;
