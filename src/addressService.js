const ADDRESS_API = 'https://data.wien.gv.at/daten/OGDAddressService.svc/GetAddressInfo';

function norm(s=''){return String(s).normalize('NFKC').replace(/\s+/g,' ').replace(/\s*,\s*/g,', ').trim();}
function property(obj,...keys){for(const k of keys){if(obj&&obj[k]!==undefined&&obj[k]!==null&&obj[k]!=='') return obj[k];}return null;}
function normalizeFeature(feature,index=0){
  const p=feature?.properties||{};
  const address=norm(property(p,'Adresse','ADRESSE','adresse')||'');
  const districtRaw=property(p,'Bezirk','BEZIRK','bezirk');
  const district=districtRaw==null?null:Number(String(districtRaw).replace(/\D/g,''))||null;
  const zip=district?String(1000+district*10):null;
  const canonical=address?`${address}${zip?`, ${zip} Wien`:district?`, ${district}. Bezirk`:''}`:'';
  const coords=Array.isArray(feature?.geometry?.coordinates)?feature.geometry.coordinates:null;
  return {id:String(property(p,'ID','id','ObjektID','OBJNR','ObjNr')||`wien-${index}`),address,canonical,district,zip,longitude:coords?.[0]??null,latitude:coords?.[1]??null,properties:p};
}
export async function searchViennaAddresses(query,{limit=10}={}){
  const q=norm(query); if(q.length<3) return [];
  const url=`${ADDRESS_API}?Address=${encodeURIComponent(q)}&crs=${encodeURIComponent('EPSG:4326')}`;
  const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),8000);
  try{const r=await fetch(url,{headers:{Accept:'application/geo+json,application/json'},signal:controller.signal});if(!r.ok) throw new Error(`Stadt-Wien-Adressservice HTTP ${r.status}`);const json=await r.json();return (Array.isArray(json?.features)?json.features:[]).slice(0,limit).map(normalizeFeature).filter(x=>x.address);}finally{clearTimeout(timeout);}
}
export async function verifyViennaAddress(input){
  const q=norm(input),results=await searchViennaAddresses(q,{limit:10});
  if(!results.length) return {status:'UNGÜLTIG',verified:false,input:q,error:'Adresse wurde im offiziellen Wiener Adressregister nicht gefunden.'};
  const simplify=s=>norm(s).toLocaleLowerCase('de-AT').replace(/,?\s*1\d{3}\s+wien$/i,'').replace(/,?\s*\d{1,2}\.\s*bezirk$/i,'').trim();
  const sq=simplify(q); let chosen=results.find(r=>simplify(r.address)===sq||simplify(r.canonical)===sq); if(!chosen&&results.length===1) chosen=results[0];
  if(!chosen) return {status:'MEHRDEUTIG',verified:false,input:q,suggestions:results,error:'Adresse ist nicht eindeutig. Bitte einen Vorschlag auswählen.'};
  return {status:'VERIFIZIERT',verified:true,input:q,selected:chosen,canonical:chosen.canonical||chosen.address,suggestions:results};
}
