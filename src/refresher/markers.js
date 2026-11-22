import {completeSource,requireThat} from '../shared/domain.js';
import {fingerprintSource} from '../shared/source.js';
const ID='([A-Za-z0-9_]+(?:-[A-Za-z0-9_]+)*)';
const PJS=new RegExp('^// @pcms-refresh:v1 '+ID+'(\\r?\\n)');
const HTML=new RegExp('^<!-- @pcms-refresh:v1 '+ID+' -->(\\r?\\n)');
function panel(text,html,strict=false){
  const bom=text.startsWith('\uFEFF')?'\uFEFF':'',body=bom?text.slice(1):text,pattern=html?HTML:PJS,match=pattern.exec(body),rest=match?body.slice(match[0].length):body;
  if(strict){
    requireThat(!body.startsWith(html?'<!-- @pcms-refresh:':'// @pcms-refresh:')||match,'invalid-refresh-marker');
    requireThat(!new RegExp('^(?:'+(html?'<!--':'//')+') @pcms-refresh:', 'm').test(rest),'duplicate-or-moved-refresh-marker');
  }
  return {bom,body:rest,id:match?.[1]||null,newline:match?.[2]||(body.includes('\r\n')?'\r\n':'\n')};
}
export function functionalSource(source){const value=completeSource(source);return {...value,pjs:((p)=>p.bom+p.body)(panel(value.pjs,false)),html:((p)=>p.bom+p.body)(panel(value.html,true))};}
export function refreshMarkers(source){const value=completeSource(source);return {pjs:panel(value.pjs,false).id,html:panel(value.html,true).id};}
export function withRefreshMarkers(source,id){
  requireThat(typeof id==='string'&&id.length<=128&&/^[A-Za-z0-9_]+(?:-[A-Za-z0-9_]+)*$/.test(id),'invalid-refresh-marker-id');
  const value=completeSource(source),pjs=panel(value.pjs,false,true),html=panel(value.html,true,true);
  return {...value,pjs:pjs.bom+'// @pcms-refresh:v1 '+id+pjs.newline+pjs.body,html:html.bom+'<!-- @pcms-refresh:v1 '+id+' -->'+html.newline+html.body};
}
export async function functionalFingerprint(source){return fingerprintSource(functionalSource(source));}
