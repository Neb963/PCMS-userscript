import {pruneRepositoryCredentials} from '../state/settings.js';
import {requestDisposition} from '../adapters/github/reader.js';

export class RequestRunner {
  constructor({store,coordinator,factory,uuid=()=>crypto.randomUUID()}){Object.assign(this,{store,coordinator,factory,uuid});this.busy=false;}
  async reconcile(){
    const state=await this.store.read(),before=JSON.stringify(state.requestQueue||{}),queue=structuredClone(state.requestQueue||{});
    for(const incoming of state.requests||[]){
      if(Object.values(state.maintenance||{}).some(r=>!['done','failed','stopped'].includes(r.phase)&&[r.from,r.to].includes(incoming.slug)&&JSON.stringify(r.repository)===JSON.stringify(incoming.repository)))continue;
      if(!incoming.valid||!['ready','reserved'].includes(incoming.status.state))continue;
      const prior=Object.values(queue).filter(r=>r.request.slug===incoming.slug&&JSON.stringify(r.request.repository)===JSON.stringify(incoming.repository)).at(-1);
      const utility=prior&&state.utility?.[prior.id];
      if(utility?.statusCommit===incoming.requestCommit&&JSON.stringify(incoming.instructions)===JSON.stringify(prior.request.instructions))continue;
      const disposition=requestDisposition(incoming,prior?{...prior.request,closed:prior.closed===true}:null);
      if(disposition==='queue'){const id=this.uuid();queue[id]={id,request:structuredClone(incoming),phase:'queued',closed:false};}
      else if(disposition.endsWith('conflict')&&prior){prior.incoming=structuredClone(incoming);prior.reason=disposition;}
    }
    if(JSON.stringify(queue)===before)return;
    await this.store.transact(s=>{this.coordinator.assertOwner(s);if(JSON.stringify(s.requestQueue||{})===before)s.requestQueue=queue;});
  }
  async tick(){
    if(this.busy||!this.coordinator.active)return;this.busy=true;
    try{
      await this.reconcile();const command=Object.values((await this.store.read()).requestQueue||{}).find(r=>['queued','waiting'].includes(r.phase)&&!r.stopRequested&&!r.incoming);if(!command)return;
      let workflow;
      try{workflow=await this.factory(command.request);}catch(error){
        const reason=error.message==='native-capability-not-live-verified'||error.message==='github-write-not-live-verified'?'live-verification-required':'session-or-integration-unavailable';
        const current=(await this.store.read()).requestQueue[command.id];
        if(current.phase!=='waiting'||current.reason!==reason)await this.store.transact(s=>{this.coordinator.assertOwner(s);s.requestQueue[command.id].phase='waiting';s.requestQueue[command.id].reason=reason;});return;
      }
      await this.store.transact(s=>{this.coordinator.assertOwner(s);s.requestQueue[command.id].phase='running';s.requestQueue[command.id].term=this.coordinator.term;delete s.requestQueue[command.id].reason;});
      try{
        const result=await workflow.run(command.request,command.id);
        await this.store.transact(s=>{this.coordinator.assertOwner(s);const own=s.requestQueue[command.id];if(own.phase==='stopped')return;own.phase=result.phase;own.closed=result.closed===true;own.reason=result.reason||null;pruneRepositoryCredentials(s);});
      }catch{await this.store.transact(s=>{this.coordinator.assertOwner(s);if(s.requestQueue[command.id].phase==='stopped')return;s.requestQueue[command.id].phase='unknown';s.requestQueue[command.id].reason='request-result-unconfirmed';});}
    }finally{this.busy=false;}
  }
}
