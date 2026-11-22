export class PulseMonitor {
  constructor({now=()=>performance.now(),lifetime=15000}={}){Object.assign(this,{now,lifetime});this.seen=new Map();}
  observe(key,value){
    const now=this.now(),previous=this.seen.get(key);
    if(!previous||now<previous.at){this.seen.set(key,{value,at:now,changed:false});return false;}
    if(value!==previous.value)this.seen.set(key,{value,at:now,changed:true});
    const current=this.seen.get(key);return current.changed&&now-current.at<=this.lifetime;
  }
}
