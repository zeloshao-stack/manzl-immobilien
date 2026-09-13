import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { createObject,getObject,allObjects,updateObject,addFile } from './objectStore.js';
import { fetchCityData } from './cityData.js';
import { getLagezuschlag } from './lagezuschlag.js';
import { autoIntake,enrichObject } from './intake.js';
import { dropboxConnectionStatus,createDropboxAuthUrl,completeDropboxAuth } from './dropboxAuth.js';
import { ensureRoot } from './dropboxStorage.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url)); const ROOT=path.resolve(__dirname,'..');
const WIDGET_URI='ui://manzl-objekt-os/cockpit.html'; const widgetHtml=fs.readFileSync(path.join(ROOT,'widget','cockpit.html'),'utf8');
const app=express(); app.use(cors()); app.use(express.json({limit:'10mb'}));
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:500*1024*1024,files:100}});
const publicBase=req=>process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;

function createMcp(){
  const server=new McpServer({name:'manzl-objekt-os',version:'0.3.0'});
  registerAppResource(server,'Manzl Objekt OS',WIDGET_URI,{mimeType:RESOURCE_MIME_TYPE,description:'Immobilien-Objektaufnahme und Produktionscockpit'},async()=>({contents:[{uri:WIDGET_URI,mimeType:RESOURCE_MIME_TYPE,text:widgetHtml,_meta:{ui:{csp:{connectDomains:[process.env.PUBLIC_BASE_URL||'https://example.invalid'],resourceDomains:[]},prefersBorder:true}}}]}));
  registerAppTool(server,'open_object_cockpit',{title:'Objekt-Cockpit öffnen',description:'Use this when the user wants to open or control the property intake cockpit.',inputSchema:{objectId:z.string().optional()},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},_meta:{ui:{resourceUri:WIDGET_URI}}},async({objectId})=>{const obj=objectId?await getObject(objectId):null;return {content:[{type:'text',text:obj?`Objekt ${obj.address} geöffnet.`:'Objekt-Cockpit geöffnet.'}],structuredContent:{selected:obj,objects:await allObjects(),apiBase:process.env.PUBLIC_BASE_URL}}});
  registerAppTool(server,'create_property_object',{title:'Objekt anlegen',description:'Use this when a verified property address is known and a new archive object should be created.',inputSchema:{address:z.string(),postalCode:z.string().optional(),district:z.string().optional()},annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:true},_meta:{ui:{resourceUri:WIDGET_URI}}},async({address,postalCode,district})=>{const obj=await createObject({address,addressLine:address,postalCode,district});return {content:[{type:'text',text:`Objekt ${address} wurde angelegt.`}],structuredContent:{selected:obj,objects:await allObjects(),apiBase:process.env.PUBLIC_BASE_URL}}});
  return server;
}

app.get('/',(req,res)=>res.json({ok:true,service:'manzl-objekt-os',version:'0.3.0'}));
app.post('/mcp',async(req,res)=>{const server=createMcp();const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined});res.on('close',()=>{transport.close();server.close();});await server.connect(transport);await transport.handleRequest(req,res,req.body);});
app.get('/health',async(req,res)=>res.json({ok:true,service:'manzl-objekt-os',version:'0.3.0',dropbox:await dropboxConnectionStatus()}));
app.get('/api/dropbox/status',async(req,res)=>res.json(await dropboxConnectionStatus()));
app.get('/auth/dropbox/start',async(req,res)=>{try{res.redirect(await createDropboxAuthUrl({baseUrl:publicBase(req)}));}catch(e){res.status(400).send(e.message);}});
app.get('/auth/dropbox/callback',async(req,res)=>{try{await completeDropboxAuth({code:req.query.code,state:req.query.state});await ensureRoot();res.type('html').send('<h2>Dropbox verbunden ✓</h2><p>Du kannst dieses Fenster schließen.</p>');}catch(e){res.status(400).send(`<h2>Dropbox-Verbindung fehlgeschlagen</h2><pre>${String(e.message)}</pre>`);}});
app.get('/api/objects',async(req,res)=>{try{res.json(await allObjects());}catch(e){res.status(500).json({error:e.message});}});
app.post('/api/objects',async(req,res)=>{try{res.json(await createObject(req.body));}catch(e){res.status(400).json({error:e.message});}});
app.get('/api/objects/:id',async(req,res)=>{try{const o=await getObject(req.params.id);if(!o)return res.status(404).json({error:'not found'});res.json(o);}catch(e){res.status(500).json({error:e.message});}});
app.post('/api/intake',upload.array('files',100),async(req,res)=>{try{const result=await autoIntake(req.files||[],{addressHint:req.body.address||''});res.status(result.status==='ADRESSE_ERFORDERLICH'?422:200).json(result);}catch(e){res.status(400).json({error:e.message});}});
app.post('/api/objects/:id/files',upload.array('files',100),async(req,res)=>{try{const items=[];for(const f of req.files||[])items.push(await addFile(req.params.id,{filename:f.originalname,buffer:f.buffer,subfolder:req.body.subfolder||'01_Eingang',kind:req.body.kind||'unterlage',meta:{mimeType:f.mimetype,size:f.size,source:'manual_upload'}}));res.json({ok:true,items,object:await getObject(req.params.id)});}catch(e){res.status(400).json({error:e.message});}});
app.post('/api/objects/:id/enrich',async(req,res)=>{res.json({ok:true,status:'STARTED'});enrichObject(req.params.id).catch(()=>{});});
app.post('/api/objects/:id/city-data',async(req,res)=>{try{const obj=await getObject(req.params.id);if(!obj)throw new Error('not found');res.json(await updateObject(obj.id,{cityData:await fetchCityData(obj.address)}));}catch(e){res.status(400).json({error:e.message});}});
app.post('/api/objects/:id/lagezuschlag',async(req,res)=>{try{const obj=await getObject(req.params.id);if(!obj)throw new Error('not found');res.json(await updateObject(obj.id,{lagezuschlag:await getLagezuschlag(obj.address,{downloadDir:'/tmp'})}));}catch(e){res.status(400).json({error:e.message});}});
export default app;
