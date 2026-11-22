import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import assert from 'node:assert/strict';
export async function checkApprovalComponent(browser){
 const page=await browser.newPage({viewport:{width:530,height:768}}),root=resolve('.');
 try{
  await page.route('https://perchance.org/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path.startsWith('/src/')){const file=resolve(root,path.slice(1));if(file.startsWith(root+sep))return route.fulfill({contentType:'text/javascript',body:await readFile(file,'utf8')});}
   return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Synthetic approval</title><div id="fixture"></div>'});
  });
  await page.goto('https://perchance.org/approval-fixture');
  await page.addScriptTag({type:'module',content:`
   import {reviewPublicationDialog} from '/src/ui/approval.js';
   const host=document.querySelector('#fixture'),root=host.attachShadow({mode:'open'}),state={settings:{account:{accountId:'alpha'}},development:{dev:{id:'dev',phase:'review',request:{status:{account:'alpha',action:'develop',state:'review'}}}},requestQueue:{},commands:{}};
   window.syntheticApproval={state,held:false};
   const store={read:async()=>structuredClone(state),transact:async change=>{const result=change(state);for(const c of Object.values(state.commands))if(c.phase==='queued'&&c.action==='prepare'){c.phase=window.syntheticApproval.held?'held':'done';c.result={token:'synthetic-approval',pjsChars:41,htmlChars:25,fileCount:2};}return {result,state:structuredClone(state)};}};
   const trigger=document.createElement('button');trigger.textContent='Prepare approval';root.append(trigger);trigger.onclick=()=>reviewPublicationDialog(store)({id:'dev',slug:'synthetic-target'},{doc:document,root,trigger});
  `});
  const fixture=page.locator('#fixture');await fixture.getByRole('button',{name:'Prepare approval',exact:true}).click();
  const modal=fixture.getByRole('dialog',{name:'Approve & Publish synthetic-target',exact:true});await modal.getByRole('button',{name:'Approve & Publish',exact:true}).waitFor();
  assert.match(await modal.textContent(),/PJS 41 characters · HTML 25 characters · 2 src files/);
  assert.equal(await page.evaluate(()=>Object.values(window.syntheticApproval.state.commands).some(c=>c.action==='approve')),false);
  await modal.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await fixture.getByRole('button',{name:'Prepare approval',exact:true}).evaluate(n=>n.getRootNode().activeElement===n),true);
  await fixture.getByRole('button',{name:'Prepare approval',exact:true}).click();await modal.getByRole('button',{name:'Approve & Publish',exact:true}).click();await modal.waitFor({state:'detached'});
  const approved=await page.evaluate(()=>Object.values(window.syntheticApproval.state.commands).filter(c=>c.action==='approve'));assert.equal(approved.length,1);assert.equal(approved[0].token,'synthetic-approval');
  await page.evaluate(()=>{window.syntheticApproval.held=true;});await fixture.getByRole('button',{name:'Prepare approval',exact:true}).click();await modal.getByText(/current draft could not be verified/).waitFor();assert.equal(await modal.getByRole('button',{name:'Approve & Publish',exact:true}).count(),0);
 }finally{await page.close();}
}
