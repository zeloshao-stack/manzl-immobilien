import { createClient } from '@supabase/supabase-js';

let client;
export function supabaseAdmin(){
  if(client) return client;
  const url=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error('SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt.');
  client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  return client;
}
