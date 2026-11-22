import { completeSource, requireThat, sourceEqual, sourcePath } from '../../shared/domain.js';

async function bytes(value){
  if(value&&Object.prototype.toString.call(value)==='[object ArrayBuffer]')return Array.from(new Uint8Array(value));
  if(value instanceof Uint8Array||Array.isArray(value))return Array.from(value);
  if(value&&Object.prototype.toString.call(value)==='[object Blob]')return Array.from(new Uint8Array(await value.arrayBuffer()));
  throw Error('draft-file-unavailable');
}

export class EditorSource {
  constructor({page,native,guard=async()=>{}}){Object.assign(this,{page,native,guard});}
  async capture(target){
    await this.guard();const before=await this.native.ready(target),p=this.page;
    await p.srcState.idle?.();const list=await p.srcState.list();
    requireThat(list&&typeof list==='object'&&!Array.isArray(list),'draft-manifest-unavailable');
    const pjs=p.modelTextEditor.getValue(),html=p.outputTemplateEditor.getValue(),files=Object.create(null);
    for(const path of Object.keys(list).sort()){sourcePath(path);files[path]=await bytes(await p.srcState.readFile(path));}
    const after=await this.native.ready(target),next=await p.srcState.list();
    requireThat(before.draftId===after.draftId&&pjs===p.modelTextEditor.getValue()&&html===p.outputTemplateEditor.getValue()&&JSON.stringify(list)===JSON.stringify(next),'draft-changed-during-read');
    return {id:before.id,slug:before.slug,source:completeSource({pjs,html,files}),draftId:before.draftId,clean:p.perchanceSaveState==='saved'&&p.modelTextEditor.isClean?.()===true&&p.outputTemplateEditor.isClean?.()===true&&p.srcState.isDirty?.()===false&&p.srcState.hasPending?.()===false};
  }
  async stage(target,source,previous){
    const intended=completeSource(source),current=await this.capture(target);
    requireThat(current.clean&&sourceEqual(current.source,previous),'dirty-or-stale-editor');
    const unchanged=async()=>{await this.guard();const identity=await this.native.ready(target);requireThat(identity.draftId===current.draftId,'draft-identity-changed');};
    await unchanged();this.page.modelTextEditor.setValue(intended.pjs);this.page.outputTemplateEditor.setValue(intended.html);
    for(const path of Object.keys(current.source.files))if(!Object.hasOwn(intended.files,path)){await unchanged();await this.page.srcState.deleteFile(path);}
    for(const [path,value] of Object.entries(intended.files)){await unchanged();await this.page.srcState.writeFile(path,Uint8Array.from(value));}
    await this.page.srcState.idle?.();this.page.recomputeSaveState?.();const staged=await this.capture(target);
    requireThat(staged.draftId===current.draftId&&sourceEqual(staged.source,intended),'draft-stage-unconfirmed');return staged;
  }
}

export function nativeSourceManifest(body,source){
  const value=completeSource(source);requireThat(body?.generator?.modelText===value.pjs&&body.generator.outputTemplate===value.html,'native-request-source-changed');
  let files=body.srcManifest;if(typeof files==='string'){try{files=JSON.parse(files);}catch{throw Error('native-request-files-changed');}}
  requireThat(files&&typeof files==='object'&&!Array.isArray(files)&&JSON.stringify(Object.keys(files).sort())===JSON.stringify(Object.keys(value.files)),'native-request-files-changed');
  const manifest=Object.create(null);
  for(const [path,expected] of Object.entries(value.files)){
    const file=files[path],key=typeof file==='string'?file:file?.key;
    requireThat(typeof key==='string'&&/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9]+)?$/.test(key)&&(typeof file==='string'||file.size===undefined||file.size===expected.length),'native-request-files-changed');manifest[path]=key;
  }
  return manifest;
}
export async function verifyUploadedSource(request,body,source){
  const manifest=nativeSourceManifest(body,source);
  for(const [path,key] of Object.entries(manifest)){
    const actual=await request('https://user.uploads.dev/file/'+key,{type:'bytes'}),expected=source.files[path];
    requireThat((actual instanceof Uint8Array||Array.isArray(actual))&&actual.length===expected.length&&expected.every((byte,i)=>actual[i]===byte),'native-upload-bytes-mismatch');
  }
}
