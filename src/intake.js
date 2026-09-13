import path from 'node:path';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { verifyViennaAddress } from './addressService.js';
import { createObject, findObjectByAddress, addFile, updateObject, getObject } from './objectStore.js';
import { fetchCityData } from './cityData.js';
import { getLagezuschlag } from './lagezuschlag.js';
import { uploadLocalFile } from './dropboxStorage.js';

function norm(s=''){return String(s).normalize('NFKC').replace(/\s+/g,' ').trim();}

async function extractText(file){
  const ext=path.extname(file.originalname||'').toLowerCase();
  try{
    if(ext==='.pdf') return (await pdf(file.buffer)).text||'';
    if(ext==='.docx') return (await mammoth.extractRawText({buffer:file.buffer})).value||'';
    if(['.xlsx','.xls','.xlsm'].includes(ext)){
      const wb=XLSX.read(file.buffer,{type:'buffer'}); return wb.SheetNames.map(n=>XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n');
    }
    if(['.txt','.csv','.md','.rtf'].includes(ext)) return file.buffer.toString('utf8');
  }catch{}
  return '';
}

function scoreAddressCandidate(raw){
  const s=norm(raw).replace(/[;|]/g,' ');
  const re=/\b([A-ZÄÖÜ][A-Za-zÄÖÜäöüß .'-]{2,60}(?:gasse|straße|strasse|weg|platz|allee|ring|zeile|kai|markt|steig|gürtel|guertel))\s+(\d{1,4}[A-Za-z]?(?:\s*[-\/]\s*\d{1,4}[A-Za-z]?)?)\s*,?\s*(1\d{3})?\s*(?:Wien)?\b/giu;
  const out=[]; for(const m of s.matchAll(re)){out.push({text:norm(`${m[1]} ${m[2]}${m[3]?`, ${m[3]} Wien`:''}`),score:(m[3]?5:3)});} return out;
}

async function detectAddress(files,hint=''){
  const candidates=[];
  if(hint) candidates.push({text:hint,score:20,source:'hint'});
  for(const f of files){
    for(const c of scoreAddressCandidate(f.originalname||'')) candidates.push({...c,source:`filename:${f.originalname}`});
    const text=await extractText(f);
    for(const c of scoreAddressCandidate(text.slice(0,120000))) candidates.push({...c,source:`content:${f.originalname}`});
  }
  const merged=new Map(); for(const c of candidates){const k=c.text.toLowerCase();const p=merged.get(k)||{...c,score:0,sources:[]};p.score+=c.score;p.sources.push(c.source);merged.set(k,p);} const sorted=[...merged.values()].sort((a,b)=>b.score-a.score);
  for(const c of sorted.slice(0,12)){
    const v=await verifyViennaAddress(c.text).catch(()=>null); if(v?.verified) return {status:'VERIFIZIERT',candidate:c,verification:v};
  }
  return {status:'NICHT_ERKANNT',candidates:sorted.slice(0,8)};
}

export function classifyFile(filename=''){
  const n=filename.toLowerCase();
  if(/grundbuch|gb[_ -]?auszug|auszug.*grundbuch/.test(n)) return {subfolder:'02_Grundbuch/aktuell',kind:'grundbuch'};
  if(/topo|topografie/.test(n)) return {subfolder:'06_Topografie/aktuell',kind:'topografie'};
  if(/plan|grundriss|schnitt|ansicht|einreich|bestandsplan/.test(n)) return {subfolder:'03_Plaene/aktuell',kind:'plan'};
  if(/zins|mieterliste|mieten|rent.?roll/.test(n)) return {subfolder:'04_Zinsliste/aktuell',kind:'zinsliste'};
  if(/\.(jpe?g|png|heic|webp|tiff?)$/i.test(n)) return {subfolder:'05_Fotos/original',kind:'foto'};
  if(/widmung|flaechenwidmung|bebauung/.test(n)) return {subfolder:'08_Flaechenwidmung/aktuell',kind:'flaechenwidmung'};
  return {subfolder:'01_Eingang',kind:'unterlage'};
}

export async function autoIntake(files,{addressHint=''}={}){
  if(!files?.length) throw new Error('Keine Dateien erhalten.');
  const detected=await detectAddress(files,addressHint);
  if(detected.status!=='VERIFIZIERT') return {status:'ADRESSE_ERFORDERLICH',message:'Adresse konnte nicht eindeutig aus den Unterlagen ermittelt werden.',candidates:detected.candidates||[]};
  const v=detected.verification; const canonical=v.canonical; const selected=v.selected||{};
  let obj=await findObjectByAddress(canonical);
  let created=false;
  if(!obj){
    obj=await createObject({address:canonical,addressLine:canonical,postalCode:selected.zip||null,district:selected.district||null,coordinates:{latitude:selected.latitude,longitude:selected.longitude}}); created=true;
  }
  const stored=[];
  for(const f of files){const c=classifyFile(f.originalname);stored.push(await addFile(obj.id,{filename:f.originalname,buffer:f.buffer,subfolder:c.subfolder,kind:c.kind,meta:{mimeType:f.mimetype,size:f.size,source:'drag_drop_intake'}}));}
  obj=await updateObject(obj.id,{status:'AUFNAHME_LAEUFT',intake:{lastAt:new Date().toISOString(),source:'outlook_drag_drop',addressDetection:{candidate:detected.candidate,canonical}}});
  queueMicrotask(()=>enrichObject(obj.id).catch(()=>{}));
  return {status:'ANGELEGT',created,object:await getObject(obj.id),stored};
}

export async function enrichObject(objectId){
  let obj=await getObject(objectId); if(!obj) throw new Error('Objekt nicht gefunden.');
  const tasks={...(obj.automation||{}),startedAt:new Date().toISOString(),cityData:'RUNNING',lagezuschlag:'PENDING'}; await updateObject(obj.id,{automation:tasks});
  try{const cityData=await fetchCityData(obj.address);tasks.cityData='DONE';await updateObject(obj.id,{cityData,automation:{...tasks}});}catch(e){tasks.cityData='ERROR';tasks.cityDataError=e.message;await updateObject(obj.id,{automation:{...tasks}});}
  tasks.lagezuschlag='RUNNING';await updateObject(obj.id,{automation:{...tasks}});
  try{
    const result=await getLagezuschlag(obj.address,{downloadDir:'/tmp'});
    if(result.status==='VERIFIZIERT' && result.pdf_path){const up=await uploadLocalFile(obj,'07_Lagezuschlag/aktuell',result.pdf_path,path.basename(result.pdf_path));result.dropbox_pdf_path=up.path_display||up.path||null;}
    tasks.lagezuschlag=result.status==='VERIFIZIERT'?'DONE':'ERROR'; await updateObject(obj.id,{lagezuschlag:result,automation:{...tasks}});
  }catch(e){tasks.lagezuschlag='ERROR';tasks.lagezuschlagError=e.message;await updateObject(obj.id,{automation:{...tasks}});}
  tasks.finishedAt=new Date().toISOString(); await updateObject(obj.id,{status:'AUFNAHME_BEREIT',automation:{...tasks}}); return getObject(obj.id);
}
