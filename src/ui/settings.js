import {syncRecords} from '../workflows/sync.js';
import { el, button, dialog, picker } from './dom.js';

export function downloadJSON(doc, name, value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const anchor = el(doc, 'a', { href: url, download: name });
  doc.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function settingsRenderer({ store, controller, gate, poller, requestCredential, signIn }) {
  let section = 'connection';
  const form = { accountId: null, pollMinutes: null };
  return ({ doc, root, body, navigate }) => {
    let disposed = false, initialized = false;
    const notice = el(doc, 'p', { className: 'statusline', role: 'status' });
    const run = (control, fn) => async () => {
      if (control.disabled) return;
      control.disabled = true;
      try { await fn(); notice.textContent = ''; await update(); }
      catch (error) {
        const messages = { 'account-id-locked':'Account ID is locked after onboarding.', 'sign-in-required':'Sign in required.', 'invalid-account':'Enter a valid manual account ID.', 'test-candidate-first':'Test the current candidate first.', 'invalid-repository-url':'Enter an exact github.com repository URL.', 'invalid-poll-interval':'Use an integer from 1 to 1440.', 'pending-switch-confirmation-required':'Pending work changed. Review it again before applying.', 'github-check-unavailable':'GitHub check unavailable.' };
        notice.textContent = messages[error.message] || 'The action is unconfirmed. Check the connection and try the relevant read-only test.';
      } finally { if (!disposed) control.disabled = false; }
    };
    function field(label, input) { return el(doc, 'label', { className:'formfield' }, label, input); }
    function card(title, content, footer = null, cls = '') { return el(doc,'section',{className:'panel settings-card '+cls},el(doc,'header',{},el(doc,'h2',{},title)),content,...(footer?[footer]:[])); }
    const account = el(doc,'input',{'aria-label':'Account ID',autocomplete:'off',oninput:e=>{form.accountId=e.target.value;}});
    const applyAccount = button(doc,'Apply',()=>{});
    applyAccount.onclick = run(applyAccount,()=>gate.bind(form.accountId ?? account.value));
    const accountState = el(doc,'p',{className:'statusline'});
    const confirm = button(doc,'Confirm session',()=>{}); confirm.onclick=run(confirm,()=>gate.confirm(true));
    const accountPanel=card('Perchance account',el(doc,'div',{className:'panelbody'},field('Account ID',account),el(doc,'div',{className:'toolbar'},applyAccount,button(doc,'Sign in',signIn),confirm),accountState),null,'account-card');
    const repositoryInput=el(doc,'input',{'aria-label':'Repository URL',type:'url',autocomplete:'off',oninput:e=>{controller.edit('repositoryURL',e.target.value);apply.disabled=true;testState.textContent='Not tested';}});
    const credentialState=el(doc,'span',{className:'tag'});
    const credential=button(doc,'Set PAT',()=>{const value=requestCredential();if(value!==null){controller.edit('pat',value);credentialState.textContent=value?'••••••••':'Not set';apply.disabled=true;testState.textContent='Not tested';}});
    const testState=el(doc,'p',{className:'statusline'},'Not tested');
    const test=button(doc,'Test',()=>{});
    const apply=button(doc,'Apply',()=>{}, {className:'primary',disabled:true,'aria-label':'Apply GitHub settings'});
    test.onclick=run(test,async()=>{await controller.test();testState.textContent='Test passed';apply.disabled=false;});
    apply.onclick=run(apply,async()=>{
      const work=await controller.switchWork();
      if(!work.length){await controller.apply();testState.textContent='Applied';return;}
      const content=el(doc,'div',{className:'panelbody stack'},el(doc,'p',{},'These records keep their original repository until explicitly resolved:'),el(doc,'ul',{},work.map(w=>el(doc,'li',{},`${w.slug || w.generatorId || w.id} · ${w.kind}`))));
      const modal=dialog(doc,root,'Apply GitHub change',content,{trigger:apply});
      const yes=button(doc,'Apply',()=>{}, {className:'primary'});
      yes.onclick=run(yes,async()=>{await controller.apply(work);testState.textContent='Applied';modal.close();});
      content.append(el(doc,'div',{className:'toolbar'},button(doc,'Cancel',()=>modal.close()),yes));
    });
    const githubPanel=card('GitHub',el(doc,'div',{className:'panelbody'},field('Repository URL',repositoryInput),el(doc,'div',{className:'formfield'},el(doc,'span',{},'GitHub PAT'),el(doc,'div',{className:'toolbar'},credentialState,credential)),testState),el(doc,'footer',{className:'footer'},test,apply),'github-card');
    const pollInput=el(doc,'input',{type:'number',min:1,max:1440,step:1,'aria-label':'Polling interval (minutes)',oninput:e=>{form.pollMinutes=e.target.value;}});
    const savePoll=button(doc,'Apply',()=>{});savePoll.onclick=run(savePoll,async()=>{await controller.setPolling(Number(form.pollMinutes ?? pollInput.value));poller.nextAt=Date.now()+Number(pollInput.value)*60000;});
    const lastCheck=el(doc,'span',{className:'statusline'});
    const checkNow=button(doc,'Check now',()=>{});checkNow.onclick=run(checkNow,async()=>{const verified=await poller.check(false);if(!verified)throw new Error('github-check-unavailable');});
    const checksPanel=card('Automatic checks',el(doc,'div',{className:'panelbody'},field('Interval (minutes)',pollInput),el(doc,'div',{className:'toolbar'},savePoll),el(doc,'div',{className:'check-row'},lastCheck,checkNow)),null,'checks-card');
    const interfacePanel=card('Interface',el(doc,'div',{className:'panelbody'},picker(doc,root,'Theme',[['light','Light'],['dark','Dark']],root.host.dataset.theme||'light',value=>{store.transact(s=>{s.settings.theme=value;}).then(()=>{root.host.dataset.theme=value;}).catch(()=>{notice.textContent='Theme could not be saved.';});})),null,'interface-card');
    const counts=el(doc,'div',{className:'system-counts'});
    const exportButton=button(doc,'Export diagnostic',()=>{});exportButton.onclick=run(exportButton,async()=>{
      const s=await store.read();downloadJSON(doc,'pcms-diagnostic.json',{schema:1,counts:systemCounts(s)});
    });
    const systemPanel=card('System',el(doc,'div',{className:'panelbody'},counts,el(doc,'div',{className:'toolbar'},button(doc,'Generators',()=>navigate('generators'),{className:'link'}),button(doc,'Reviews',()=>navigate('reviews'),{className:'link'}),button(doc,'Sync pending · Open',()=>navigate('sync'),{className:'link'}))),el(doc,'footer',{className:'footer'},exportButton),'system-card');
    const connection=el(doc,'div',{className:'settings-column','data-section':'connection'},accountPanel,githubPanel);
    const controls=el(doc,'div',{className:'settings-column','data-section':'controls'},checksPanel,interfacePanel,systemPanel);
    const layout=el(doc,'div',{className:'settings-layout'},connection,controls);
    const views=el(doc,'div',{className:'settings-tabs toolbar','aria-label':'Settings views'});
    function select(key){section=key;layout.dataset.section=key;for(const b of views.children)b.setAttribute('aria-pressed',String(b.dataset.section===key));}
    for(const [key,title] of [['connection','Connection'],['controls','Controls & system']])views.append(button(doc,title,()=>select(key),{'data-section':key}));
    select(section);body.append(views,layout,notice);
    async function update(){
      const state=await store.read();if(disposed)return;controller.initialize(state);
      if(!initialized){account.value=form.accountId??state.settings.account.accountId;repositoryInput.value=controller.draft.repositoryURL;pollInput.value=form.pollMinutes??String(state.settings.pollMinutes);initialized=true;}
      credentialState.textContent=controller.draft.pat?'••••••••':'Not set';
      account.disabled=state.settings.account.locked;applyAccount.disabled=state.settings.account.locked;
      const session=await gate.observe();if(disposed)return;
      accountState.textContent=!state.settings.account.accountId?'Setup required':!session.signedIn?'Sign in required':session.confirmed?'Session confirmed':'Confirm session required';
      lastCheck.textContent=state.githubCheck?.at?`Last GitHub check · ${new Date(state.githubCheck.at).toLocaleTimeString()}`:'Last GitHub check · Unknown';
      counts.replaceChildren(...Object.entries(systemCounts(state)).map(([label,count])=>el(doc,'div',{},el(doc,'span',{},label),el(doc,'strong',{},String(count)))));
    }
    update().catch(()=>{notice.textContent='Settings unavailable. Check protected storage.';});
    return {update:()=>{update().catch(()=>{notice.textContent='Settings unavailable.';});},dispose:()=>{disposed=true;}};
  };
}

export function systemCounts(state){return {Generators:Object.keys(state.generators).length,'Pending sync':syncRecords(state).filter(p=>!['synced','stopped','reassigned','superseded'].includes(p.phase)).length,Holds:Object.values(state.generators).reduce((n,g)=>n+(g.holds?.length||0),0),Workers:Object.values(state.workers).filter(w=>!['lost','released'].includes(w.phase)).length,'Unknown writes':Object.values(state.jobs).filter(j=>j.phase==='unknown'&&!j.locallyStopped).length,'Journal events':state.journal.length};}
