import fs from 'node:fs/promises';
import path from 'node:path';
import { getDropboxRefreshToken } from './dropboxAuth.js';

const ROOT=process.env.DROPBOX_ROOT || '/Objekte';
const LOCAL_ROOT=path.resolve('data/dropbox-mock');
const clean=s=>String(s||'').replace(/[\\:*?"<>|]/g,'-').replace(/\s+/g,' ').trim();
const joinDbx=(...parts)=>'/' + parts.map(p=>String(p).replace(/^\/+|\/+$/g,'')).filter(Boolean).join('/');
const localPath=p=>path.join(LOCAL_ROOT,p.replace(/^\//,''));
export const storageMode=()=>String(process.env.STORAGE_MODE||'dropbox').toLowerCase()==='local'?'local':'dropbox';
export const objectFolderName=({postalCode,addressLine})=>clean(`${postalCode||''}_${clean(addressLine).replace(/,\s*\d{4}\s+Wien$/i,'')}`).replace(/\s/g,'_');

async function accessToken(){
  const key=process.env.DROPBOX_APP_KEY, secret=process.env.DROPBOX_APP_SECRET, refresh=await getDropboxRefreshToken();
  if(!key||!secret||!refresh) throw new Error('Dropbox Server-Secrets fehlen.');
  const auth=Buffer.from(`${key}:${secret}`).toString('base64');
  const res=await fetch('https://api.dropboxapi.com/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${auth}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refresh})});
  if(!res.ok) throw new Error(`Dropbox Token: ${res.status} ${await res.text()}`); return (await res.json()).access_token;
}
async function dbxJson(endpoint,body){const token=await accessToken();const res=await fetch(`https://api.dropboxapi.com/2/${endpoint}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});if(!res.ok) throw new Error(`Dropbox ${endpoint}: ${res.status} ${await res.text()}`);return res.status===204?{}:res.json();}
async function upload(dbxPath,buffer){const token=await accessToken();const res=await fetch('https://content.dropboxapi.com/2/files/upload',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/octet-stream','Dropbox-API-Arg':JSON.stringify({path:dbxPath,mode:'overwrite',autorename:false,mute:true})},body:buffer});if(!res.ok) throw new Error(`Dropbox upload: ${res.status} ${await res.text()}`);return res.json();}

export async function ensureRoot(){if(storageMode()==='local'){await fs.mkdir(localPath(ROOT),{recursive:true});return ROOT;}try{await dbxJson('files/create_folder_v2',{path:ROOT,autorename:false});}catch(e){if(!String(e.message).includes('conflict')) throw e;}return ROOT;}
export async function ensureObjectFolders(object){
  await ensureRoot(); const base=joinDbx(ROOT,object.folderName);
  const folders=['00_Objektakte','01_Eingang','02_Grundbuch/aktuell','02_Grundbuch/archiv','03_Plaene/aktuell','03_Plaene/archiv','04_Zinsliste/aktuell','04_Zinsliste/archiv','05_Fotos/original','05_Fotos/bearbeitet','05_Fotos/archiv','06_Topografie/aktuell','06_Topografie/archiv','07_Lagezuschlag/aktuell','07_Lagezuschlag/archiv','08_Flaechenwidmung/aktuell','08_Flaechenwidmung/archiv','09_Kubatur/aktuell','09_Kubatur/archiv','10_Expose/aktuell','10_Expose/archiv'];
  if(storageMode()==='local'){for(const f of folders) await fs.mkdir(localPath(joinDbx(base,f)),{recursive:true});return {base,folders};}
  for(const f of ['',...folders]){const p=joinDbx(base,f);try{await dbxJson('files/create_folder_v2',{path:p,autorename:false});}catch(e){if(!String(e.message).includes('conflict')) throw e;}}
  return {base,folders};
}
export async function writeJson(object,relativePath,value){const p=joinDbx(ROOT,object.folderName,relativePath),buf=Buffer.from(JSON.stringify(value,null,2));if(storageMode()==='local'){const lp=localPath(p);await fs.mkdir(path.dirname(lp),{recursive:true});await fs.writeFile(lp,buf);return {path:p,path_display:p};}return upload(p,buf);}
export async function uploadBuffer(object,subfolder,filename,buffer){const p=joinDbx(ROOT,object.folderName,subfolder,clean(filename));if(storageMode()==='local'){const lp=localPath(p);await fs.mkdir(path.dirname(lp),{recursive:true});await fs.writeFile(lp,buffer);return {path:p,path_display:p};}return upload(p,buffer);}
export async function uploadLocalFile(object,subfolder,filePath,filename=path.basename(filePath)){return uploadBuffer(object,subfolder,filename,await fs.readFile(filePath));}
export async function moveDropboxPath(sourcePath,destinationPath){if(storageMode()==='local'){const src=localPath(sourcePath),dst=localPath(destinationPath);await fs.mkdir(path.dirname(dst),{recursive:true});try{await fs.rename(src,dst);}catch(e){if(e.code!=='ENOENT') throw e;}return {path:destinationPath,path_display:destinationPath};}return dbxJson('files/move_v2',{from_path:sourcePath,to_path:destinationPath,autorename:true,allow_ownership_transfer:false});}
