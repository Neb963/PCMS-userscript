import { ProtectedStore, STORE_KEY, STORE_LOCK, emptyState, validateState } from './store.js';
import { requireThat } from '../shared/domain.js';

export const STORE_RPC_KEY = 'PCMS_STORE_RPC_V1';
export const STORE_PROBE_KEY = 'PCMS_STORE_PROBE_V1';
export const READ_LOCK_PREFIX = 'pcms:store-checkpoint:';

function decode(raw) { return raw === null ? emptyState() : validateState(JSON.parse(raw)); }

// VM's getters are per-document caches. Only the coordinator writes the root.
// A follower first requests a fresh protected checkpoint while holding STORE_LOCK,
// then sends a compare-and-set through the privileged GM channel. Web Lock names
// carry only a random read nonce; no command or protected data crosses that signal.
export class CoherentStore extends ProtectedStore {
  constructor({ addListener, removeListener, probe, clearProbe = async () => {}, ...options }) {
    super(options);
    Object.assign(this, { addListener, removeListener, probe, clearProbe });
    this.authority = false;
    this.current = null;
    this.confirmed = null;
    this.queue = Promise.resolve();
    this.poisoned = false;
  }

  async read() {
    if (this.authority) { requireThat(!this.poisoned, 'storage-unavailable'); return structuredClone(this.current); }
    const cached = await super.read();
    const value = this.confirmed && this.confirmed.revision > cached.revision ? this.confirmed : cached;
    return structuredClone(value);
  }

  async acquireAuthority() {
    await this.locks.request(STORE_LOCK, { mode:'exclusive' }, async()=>{
      const raw = await this.probe();
      this.current = decode(raw);
      this.confirmed = structuredClone(this.current);
      this.poisoned = false;
      this.authority = true;
      this.closing = false;
      this.probePending = true;
      this.available = true;
    });
    this.rpcListener = this.addListener(STORE_RPC_KEY, (_key,_old,message)=>{
      if(!this.authority||this.closing||message?.type!=='write')return;
      this.enqueue(async()=>{
        try {
          requireThat(message.baseRevision===this.current.revision && message.baseWriteId===this.current.writeId && message.checkpoint===this.current.syncNonce, 'storage-cas-conflict');
          requireThat(message.next.revision===this.current.revision+1, 'invalid-store-revision');
          const state=await this.persist(message.next);
          await this.set(STORE_RPC_KEY,{type:'reply',id:message.id,state});
        } catch { await this.set(STORE_RPC_KEY,{type:'reply',id:message.id,error:'storage-write-unconfirmed'}); }
      }).catch(()=>{this.poisoned=true;});
    });
    let checking=false;
    this.checkpointTimer=setInterval(async()=>{
      if(checking||!this.authority||this.closing||this.poisoned)return;checking=true;
      try {
        const locks=await this.locks.query();
        const request=locks.held.find(lock=>lock.name.startsWith(READ_LOCK_PREFIX));
        if(request){const nonce=request.name.slice(READ_LOCK_PREFIX.length);if(/^[A-Za-z0-9_-]+$/.test(nonce)&&this.current.syncNonce!==nonce)await this.enqueue(()=>this.persist({...this.current,syncNonce:nonce}));}
      } catch { this.poisoned=true; } finally { checking=false; }
    },25);
  }

  enqueue(run) { const result=this.queue.then(run);this.queue=result.catch(()=>{});return result; }

  async releaseAuthority() {
    this.closing=true;
    clearInterval(this.checkpointTimer);
    if(this.rpcListener!==undefined)this.removeListener(this.rpcListener);
    await this.queue;
    this.authority=false;
    if(this.rpcListener!==undefined)this.removeListener(this.rpcListener);
    this.current=null;
  }

  async persist(value) {
    requireThat(this.authority&&!this.poisoned,'storage-authority-unavailable');
    const state=validateState(value),raw=JSON.stringify(state);
    try {
      await this.set(STORE_KEY,raw);
      requireThat(await this.get(STORE_KEY,null)===raw,'storage-readback-mismatch');
    } catch { this.poisoned=true;this.available=false;throw new Error('storage-write-unconfirmed'); }
    this.current=structuredClone(state);this.confirmed=structuredClone(state);this.available=true;
    if(this.probePending){this.probePending=false;try{await this.clearProbe();}catch{/* A retained protected probe is never a substitute for the primary root. */}}
    return structuredClone(state);
  }

  async checkpoint() {
    const nonce=this.uuid();
    let release,listener,timer;
    const held=new Promise(resolve=>{release=resolve;});
    const result=new Promise((resolve,reject)=>{
      listener=this.addListener(STORE_KEY,(_key,_old,raw)=>{
        try{const state=decode(raw);if(state.syncNonce===nonce)resolve(state);}catch{reject(new Error('storage-unavailable'));}
      });
      timer=setTimeout(()=>reject(new Error('storage-checkpoint-unavailable')),10000);
    });
    const lock=this.locks.request(READ_LOCK_PREFIX+nonce,{mode:'exclusive'},()=>held);
    try { return await result; }
    finally { clearTimeout(timer);this.removeListener(listener);release();await lock; }
  }

  async sendWrite(current,next) {
    const id=this.uuid();let listener,timer;
    const reply=new Promise((resolve,reject)=>{
      listener=this.addListener(STORE_RPC_KEY,(_key,_old,message)=>{
        if(message?.type!=='reply'||message.id!==id)return;
        if(message.error)reject(new Error(message.error));else resolve(validateState(message.state));
      });
      timer=setTimeout(()=>reject(new Error('storage-write-unconfirmed')),10000);
    });
    try {
      await this.set(STORE_RPC_KEY,{type:'write',id,baseRevision:current.revision,baseWriteId:current.writeId,checkpoint:current.syncNonce,next});
      return await reply;
    } finally { clearTimeout(timer);this.removeListener(listener); }
  }

  async transact(change) {
    return this.locks.request(STORE_LOCK,{mode:'exclusive'},async()=>{
      const current=this.authority?await this.read():await this.checkpoint();
      const next=structuredClone(current),result=change(next);
      requireThat(!result?.then,'async-storage-mutation');
      next.revision=current.revision+1;next.writeId=this.uuid();validateState(next);
      const state=this.authority?await this.enqueue(()=>this.persist(next)):await this.sendWrite(current,next);
      requireThat(JSON.stringify(state)===JSON.stringify(next),'storage-write-unconfirmed');
      this.confirmed=structuredClone(state);
      return {state:structuredClone(state),result:structuredClone(result)};
    });
  }
}

export function freshStoreProbe({doc,host,addListener,removeListener,uuid=()=>crypto.randomUUID()}) {
  return ()=>new Promise((resolve,reject)=>{
    const nonce=uuid();
    const frame=doc.createElement('iframe');frame.hidden=true;frame.tabIndex=-1;frame.setAttribute('aria-hidden','true');
    let listener;
    const finish=(error,raw)=>{clearTimeout(timer);removeListener(listener);frame.remove();error?reject(error):resolve(raw);};
    listener=addListener(STORE_PROBE_KEY,(_key,_old,message)=>{if(message?.nonce===nonce)finish(null,message.raw);});
    const timer=setTimeout(()=>finish(new Error('storage-fresh-read-unavailable')),15000);
    frame.src='https://perchance.org/welcome?pcms_store_probe='+nonce;
    host.append(frame);
  });
}

export async function serveStoreProbe({get,set,nonce}) {
  requireThat(/^[A-Za-z0-9_-]+$/.test(nonce),'invalid-store-probe');
  const raw=await get(STORE_KEY,null);decode(raw);
  await set(STORE_PROBE_KEY,{nonce,raw});
}
