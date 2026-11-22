import { requireThat, accountId, nativeId } from '../shared/domain.js';

export async function enqueueImport(store, ids, expectedRepository=null, uuid=()=>crypto.randomUUID()) {
  const id=uuid();
  await store.transact(state=>{
    accountId(state.settings.account.accountId);requireThat(state.settings.github,'github-setup-required');
    requireThat(!expectedRepository||JSON.stringify(expectedRepository)===JSON.stringify(state.settings.github.repository),'import-settings-changed');
    requireThat(Array.isArray(ids)&&ids.length>0,'empty-import');const selected=[...new Set(ids.map(nativeId))];
    state.commands||={};
    state.commands[id]={id,kind:'bulk-import',phase:'queued',account:state.settings.account.accountId,repository:structuredClone(state.settings.github.repository),ids:selected,results:{}};
  });
  return id;
}

export class CommandRunner {
  constructor({store,coordinator,importWorkflow}){Object.assign(this,{store,coordinator,importWorkflow});this.busy=false;}
  async tick(){
    if(this.busy||!this.coordinator.active)return;this.busy=true;
    try{
      const state=await this.store.read(),command=Object.values(state.commands||{}).find(c=>c.phase==='queued');if(!command)return;
      await this.store.transact(s=>{this.coordinator.assertOwner(s);requireThat(s.commands[command.id].phase==='queued','command-already-claimed');s.commands[command.id].phase='running';s.commands[command.id].term=this.coordinator.term;});
      try{
        requireThat(command.kind==='bulk-import','unsupported-command');
        const workflow=await this.importWorkflow(command);const results=await workflow.run(command);
        await this.store.transact(s=>{this.coordinator.assertOwner(s);s.commands[command.id].phase=results.some(r=>r.outcome==='unknown')?'unknown':'done';});
      }catch{
        await this.store.transact(s=>{this.coordinator.assertOwner(s);s.commands[command.id].phase='blocked';s.commands[command.id].reason='operation-unavailable-or-unconfirmed';});
      }
    }finally{this.busy=false;}
  }
}
