import crypto from 'node:crypto';
import { supabaseAdmin } from './supabase.js';
import { ensureObjectFolders, objectFolderName, writeJson, uploadBuffer, moveDropboxPath } from './dropboxStorage.js';

const norm=s=>String(s||'').normalize('NFKC').toLocaleLowerCase('de-AT').replace(/\s+/g,' ').trim();
const mapRow=r=>r?({
  id:r.id, objectCode:r.object_code, address:r.canonical_address, addressLine:r.canonical_address,
  postalCode:r.postal_code, district:r.district, coordinates:r.latitude&&r.longitude?{latitude:Number(r.latitude),longitude:Number(r.longitude)}:null,
  folderName:r.metadata?.folderName || objectFolderName({postalCode:r.postal_code,addressLine:r.canonical_address}),
  status:r.intake_status, dropboxFolderPath:r.dropbox_folder_path, cityData:r.metadata?.cityData||{}, lagezuschlag:r.metadata?.lagezuschlag||null,
  metadata:r.metadata||{}, createdAt:r.created_at, updatedAt:r.updated_at
}):null;

export async function createObject(input){
  const db=supabaseAdmin();
  const folderName=objectFolderName({postalCode:input.postalCode,addressLine:input.addressLine||input.address});
  const tmp={folderName,address:input.address,addressLine:input.addressLine||input.address,postalCode:input.postalCode||null};
  const folders=await ensureObjectFolders(tmp);
  const objectCode=input.objectCode||`OBJ-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const payload={
    object_code:objectCode, canonical_address:input.address, street:input.street||null, house_number:input.houseNumber||null,
    postal_code:input.postalCode||null, district:input.district?Number(input.district):null,
    latitude:input.coordinates?.latitude||null, longitude:input.coordinates?.longitude||null,
    dropbox_folder_path:folders.base, status:'active', intake_status:'new',
    metadata:{folderName,cityData:input.cityData||{},lagezuschlag:input.lagezuschlag||null,notes:[]}
  };
  const {data,error}=await db.from('objects').insert(payload).select('*').single();
  if(error) throw new Error(error.message);
  const obj=mapRow(data); await writeJson(obj,'00_Objektakte/objekt.json',obj); return obj;
}

export async function updateObject(id,patch){
  const db=supabaseAdmin(); const current=await getObject(id); if(!current) throw new Error('Object not found');
  const md={...(current.metadata||{})};
  if(patch.cityData!==undefined) md.cityData=patch.cityData;
  if(patch.lagezuschlag!==undefined) md.lagezuschlag=patch.lagezuschlag;
  if(patch.automation!==undefined) md.automation=patch.automation;
  if(patch.intake!==undefined) md.intake=patch.intake;
  const upd={metadata:md};
  if(patch.status) upd.intake_status=String(patch.status).toLowerCase().includes('bereit')?'ready':'processing';
  if(patch.dropboxFolderPath) upd.dropbox_folder_path=patch.dropboxFolderPath;
  const {data,error}=await db.from('objects').update(upd).eq('id',id).select('*').single();
  if(error) throw new Error(error.message); const obj=mapRow(data); await writeJson(obj,'00_Objektakte/objekt.json',obj); return obj;
}
export async function getObject(id){
  const db=supabaseAdmin();
  const {data,error}=await db.from('objects').select('*').eq('id',id).maybeSingle(); if(error) throw new Error(error.message);
  const obj=mapRow(data); if(!obj) return null;
  const {data:docs,error:de}=await db.from('documents').select('*').eq('object_id',id).order('created_at',{ascending:false}); if(de) throw new Error(de.message);
  obj.documents=(docs||[]).map(d=>({id:d.id,kind:d.document_type,filename:d.original_filename||d.title,path:d.dropbox_path,status:d.status,versionDate:d.version_date,createdAt:d.created_at}));
  obj.automation=obj.metadata?.automation||{}; obj.intake=obj.metadata?.intake||{};
  return obj;
}
export async function findObjectByAddress(address){const {data,error}=await supabaseAdmin().from('objects').select('*'); if(error) throw new Error(error.message); const hit=(data||[]).find(r=>norm(r.canonical_address)===norm(address)); return mapRow(hit||null);}
export async function allObjects(){const {data,error}=await supabaseAdmin().from('objects').select('*').order('created_at',{ascending:false}); if(error) throw new Error(error.message); return (data||[]).map(mapRow);}

export async function addFile(id,{subfolder='01_Eingang',filename,buffer,kind='unterlage',meta={}}){
  const db=supabaseAdmin(); const obj=await getObject(id); if(!obj) throw new Error('Object not found');
  const hash=crypto.createHash('sha256').update(buffer).digest('hex');
  const {data:dupes,error:de}=await db.from('documents').select('*').eq('object_id',id).eq('content_hash',hash).limit(1); if(de) throw new Error(de.message);
  if(dupes?.length) return {...dupes[0],duplicate:true};

  const versioned=new Set(['zinsliste','topografie','grundbuch','flaechenwidmung','lagezuschlag']);
  let supersedes=null;
  if(versioned.has(kind)){
    const {data:current,error:ce}=await db.from('documents').select('*').eq('object_id',id).eq('document_type',kind).eq('status','current').order('created_at',{ascending:false});
    if(ce) throw new Error(ce.message);
    for(const old of current||[]){
      let archivedPath=old.dropbox_path;
      if(old.dropbox_path?.includes('/aktuell/')){
        archivedPath=old.dropbox_path.replace('/aktuell/','/archiv/');
        const moved=await moveDropboxPath(old.dropbox_path,archivedPath);
        archivedPath=moved?.metadata?.path_display||moved?.path_display||moved?.path||archivedPath;
      }
      await db.from('documents').update({status:'superseded',dropbox_path:archivedPath}).eq('id',old.id);
      supersedes ||= old.id;
    }
  }

  if(kind==='zinsliste'){
    const {data:topos}=await db.from('documents').select('*').eq('object_id',id).eq('document_type','topografie').eq('status','current');
    for(const old of topos||[]){
      let archivedPath=old.dropbox_path;
      if(old.dropbox_path?.includes('/aktuell/')){
        archivedPath=old.dropbox_path.replace('/aktuell/','/archiv/');
        const moved=await moveDropboxPath(old.dropbox_path,archivedPath);
        archivedPath=moved?.metadata?.path_display||moved?.path_display||moved?.path||archivedPath;
      }
      await db.from('documents').update({status:'superseded',dropbox_path:archivedPath,metadata:{...(old.metadata||{}),stale_reason:'new_rent_roll'}}).eq('id',old.id);
    }
    await db.from('jobs').insert({object_id:id,job_type:'create_topography',status:'queued',trigger_type:'new_rent_roll',input:{filename}});
  }

  const uploaded=await uploadBuffer(obj,subfolder,filename,buffer);
  const row={object_id:id,document_type:kind,title:filename,original_filename:filename,status:'current',dropbox_file_id:uploaded.id||null,dropbox_path:uploaded.path_display||uploaded.path||null,content_hash:hash,source:meta.source||'upload',mime_type:meta.mimeType||null,size_bytes:meta.size||buffer.length,supersedes_document_id:supersedes,metadata:meta};
  const {data,error}=await db.from('documents').insert(row).select('*').single(); if(error) throw new Error(error.message); return data;
}
