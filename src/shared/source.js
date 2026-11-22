import {completeSource} from './domain.js';
export async function fingerprintSource(source){
  const bytes=new TextEncoder().encode(JSON.stringify(completeSource(source))),hash=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
