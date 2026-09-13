import fs from 'node:fs/promises';
import path from 'node:path';
import chromium from '@sparticuz/chromium';
import { chromium as playwrightChromium } from 'playwright-core';
import pdf from 'pdf-parse';

const URL='https://mein.wien.gv.at/Richtwert/';
const norm=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
const number=s=>Number(String(s).replace(/\./g,'').replace(',','.'));

function euroValues(text=''){
  const out=[];
  for(const m of text.matchAll(/(\d{1,2}[,.]\d{1,2})\s*(?:€|EUR)?\s*(?:\/\s*m(?:²|2))?/giu)){
    const v=number(m[1]); if(Number.isFinite(v)&&v>=0&&v<100) out.push(v);
  }
  return [...new Set(out)];
}
function dates(text=''){
  return [...new Set([...text.matchAll(/\b(0[1-9]|[12]\d|3[01])[.](0[1-9]|1[0-2])[.](20\d{2})\b/g)].map(m=>`${m[3]}-${m[2]}-${m[1]}`))];
}
async function browser(){
  return playwrightChromium.launch({headless:true,executablePath:await chromium.executablePath(),args:chromium.args});
}

export async function getLagezuschlag(address,{downloadDir='/tmp'}={}){
  const b=await browser();
  try{
    const page=await b.newPage({acceptDownloads:true});
    await page.goto(URL,{waitUntil:'domcontentloaded',timeout:30000});
    const start=page.getByText(/Lagezuschlag abfragen/i).first();
    if(await start.count()) await start.click();
    const input=page.locator('input').first();
    await input.fill(address);
    await page.waitForTimeout(700);
    const escaped=address.split(',')[0].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const option=page.locator('[role="option"]').filter({hasText:new RegExp(escaped,'i')}).first();
    if(await option.count()) await option.click(); else {await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');}
    const next=page.getByRole('button',{name:/Weiter|Berechnen/i}).first();
    await next.click();
    await page.waitForLoadState('networkidle').catch(()=>{});
    const text=await page.locator('body').innerText();
    const vals=euroValues(text), ds=dates(text);
    const latest=vals[0] ?? null;
    if(latest===null) return {status:'FEHLER',address,error:'Kein Lagezuschlagswert erkannt.'};

    let pdfPath=null,pdfValue=null,pdfAddressOk=false;
    const downloadButton=page.getByRole('button',{name:/Herunterladen/i}).first();
    if(await downloadButton.count()){
      const [download]=await Promise.all([page.waitForEvent('download'),downloadButton.click()]);
      await fs.mkdir(downloadDir,{recursive:true});
      pdfPath=path.join(downloadDir,download.suggestedFilename()||'lagezuschlag.pdf');
      await download.saveAs(pdfPath);
      const parsed=await pdf(await fs.readFile(pdfPath));
      const ptext=parsed.text||''; pdfAddressOk=norm(ptext).includes(norm(address.split(',')[0]));
      pdfValue=euroValues(ptext)[0] ?? null;
    }
    const verified=pdfPath && pdfAddressOk && pdfValue!==null && Math.abs(pdfValue-latest)<0.001;
    return {status:verified?'VERIFIZIERT':'IN_PRUEFUNG',address,value_eur_m2:latest,valid_from:ds[0]||null,pdf_path:pdfPath,pdf_value_eur_m2:pdfValue,pdf_address_ok:pdfAddressOk};
  } finally { await b.close(); }
}
