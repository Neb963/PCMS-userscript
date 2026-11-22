import { ProtectedStore } from '../../src/state/store.js';
export function testStore(){
  const data=new Map();let chain=Promise.resolve();
  const store=new ProtectedStore({get:async k=>data.get(k)??null,set:async(k,v)=>{data.set(k,v);},locks:{request:(_k,_o,run)=>{const p=chain.then(run);chain=p.catch(()=>{});return p;}}});
  return {store,data};
}
