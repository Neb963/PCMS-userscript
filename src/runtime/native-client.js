import { requireThat } from '../shared/domain.js';

export class NativeClient {
  constructor({store,pool,coordinator,role='utility',workerId=null,wait=ms=>new Promise(r=>setTimeout(r,ms)),now=()=>Date.now()}){Object.assign(this,{store,pool,coordinator,role,workerId,wait,now});}
  async until(test){const deadline=this.now()+30000;while(this.now()<deadline){this.coordinator.assertOwner(await this.store.read());const value=await test(await this.store.read());if(value)return value;await this.wait(100);}throw Error('native-worker-timeout');}
  async result(id){return this.until(async state=>{const job=state.jobs[id];if(job?.phase==='verified')return job.data===undefined?{}:job.data;if(job&&['unknown','rejected','cancelled'].includes(job.phase))throw Error('native-worker-unconfirmed');return null;});}
  async command(kind,target,payload={},id,operatorAction=false){
    const existing=(await this.store.read()).jobs[id];
    if(existing)return this.result(id);
    let worker=(await this.store.read()).workers[this.workerId];
    if(!worker){
      const state=await this.store.read();worker=this.role==='development'?null:Object.values(state.workers).find(w=>w.role===this.role&&['idle','opening'].includes(w.phase));
      if(!worker)worker=await this.pool.open(this.role,target.slug,target.id||null,kind==='native-create');
      this.workerId=worker.id;
    }
    worker=await this.until(s=>{const w=s.workers[this.workerId];requireThat(w&&!['lost','released'].includes(w.phase),'native-worker-lost');return w.phase==='idle'&&w.documentId?w:null;});
    if(worker.slug!==target.slug||!!worker.fork!==(kind==='native-create')){
      requireThat(!operatorAction,'retained-draft-target-mismatch');
      const navigationId=id+'-nav';
      if(!(await this.store.read()).jobs[navigationId]){
        await this.coordinator.claim({id:navigationId,kind:'navigate',workerId:worker.id,documentId:worker.documentId,target,fork:kind==='native-create'});
        await this.coordinator.dispatch(navigationId,c=>this.pool.send(c));
      }
      await this.result(navigationId);
      worker=await this.until(s=>{const w=s.workers[this.workerId];return w?.phase==='idle'&&w.documentId!==worker.documentId&&w.slug===target.slug?w:null;});
    }
    requireThat(!worker.selected||operatorAction,'operator-selected-tab');
    await this.coordinator.claim({id,kind,target,payload,parentId:payload.actionId||null,generatorId:target.id||null,workerId:worker.id,documentId:worker.documentId,operatorAction});
    await this.coordinator.dispatch(id,c=>this.pool.send(c));return this.result(id);
  }
  startDevelopment(target,id){return this.command('helper-start',target,{developmentId:id},id+'-helper-start');}
  prepareRefresh(target,id){return this.command('refresh-prepare',target,{markerId:id},id+'-prepare');}
  restoreRefresh(target,id){return this.command('refresh-restore',target,{markerId:id},id+'-restore');}
  saveRefresh(target,id){return this.command('refresh-save',target,{markerId:id},id+'-save');}
  deploy(target,pendingId,actionId){return this.command('native-deploy',target,{pendingId,actionId},actionId+'-worker');}
  create(actionId){return this.command('native-create',{slug:'minimal'},{actionId},actionId+'-worker');}
  listing(target,intent,actionId){return this.command('native-listing',target,{intent,actionId},actionId+'-worker');}
  rename(target,targetSlug,actionId){return this.command('native-rename',target,{targetSlug,actionId},actionId+'-worker');}
}
