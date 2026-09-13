export async function getDropboxRefreshToken(){ return process.env.DROPBOX_REFRESH_TOKEN || null; }
export async function dropboxConnectionStatus(){
  const configured=Boolean(process.env.DROPBOX_APP_KEY && process.env.DROPBOX_APP_SECRET && process.env.DROPBOX_REFRESH_TOKEN);
  return {configured,connected:configured,root:process.env.DROPBOX_ROOT || '/Objekte'};
}
export async function createDropboxAuthUrl(){ throw new Error('Dropbox OAuth wird in Produktion über Server-Secrets konfiguriert.'); }
export async function completeDropboxAuth(){ throw new Error('Dropbox OAuth Callback ist in dieser Deployment-Variante deaktiviert.'); }
