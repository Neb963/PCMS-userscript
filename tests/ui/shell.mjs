import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { emptyState } from '../../src/state/store.js';

// Standard local/CI dependency; Work Mode can reuse its provided runtime copy.
let playwright;
try { playwright = await import('playwright'); }
catch {
  if (!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES) throw new Error('Install dev dependencies to run UI tests');
  playwright = createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/loader.cjs')('playwright');
}
const browserType = process.env.PCMS_UI_BROWSER || 'chromium';
const browser = await playwright[browserType].launch({ headless: true, ...(process.env.PCMS_UI_EXECUTABLE ? { executablePath: process.env.PCMS_UI_EXECUTABLE } : {}) });
const script = await readFile(resolve('dist/PCMS.user.js'), 'utf8');
const errors = [];
const initialState=emptyState();
initialState.settings.account={accountId:'synthetic-account',locked:true,confirmed:false};
for(let i=0;i<48;i++){
  const id=String(100+i);initialState.generators[id]={id,slug:'synthetic-generator-'+String(i).padStart(2,'0'),listing:i%3===0?'unlisted':'listed',status:{account:'synthetic-account',action:'publish_from_github',state:'done'},holds:i===8?[{id:'edit-108',kind:'edit'},{id:'unknown-108',kind:'native-unknown'}]:[],savedVerified:true,ownerVerified:true,excluded:false,githubCommit:'a'.repeat(40)};
}
initialState.requestQueue={};initialState.utility={};
for(let i=0;i<35;i++){const id='utility-'+i,request={valid:true,slug:'synthetic-utility-'+String(i).padStart(2,'0'),repository:{owner:'synthetic',name:'repo'},commit:'a'.repeat(40),requestCommit:'a'.repeat(40),instructions:[],status:{account:'synthetic-account',action:'publish_from_github',state:'ready'}};initialState.requestQueue[id]={id,request,phase:i===1?'reserved':'waiting',closed:false,reason:'live-verification-required'};if(i===1)initialState.utility[id]={id,request,phase:'reserved',steps:['request checked','slug checked','identity checked']};}
initialState.generators['101'].localDone=true;initialState.generators['101'].localApproved=true;initialState.generators['101'].holds=[{id:'sync-conflict-source',kind:'source-conflict'}];
for(let i=0;i<32;i++){const id=i===0?'conflict-source':'synced-'+i;initialState.pending[id]={id,generatorId:'101',slug:'synthetic-generator-01',repository:{owner:'synthetic',name:'original-repository'},baseCommit:'a'.repeat(40),kind:i===0?'source':'status',status:{account:'synthetic-account',action:'develop',state:'done'},phase:i===0?'source-conflict':'synced',nativeVerified:true,...(i===0?{source:{pjs:'synthetic-private-sync-source',html:'<p>protected</p>',files:{}},previousSource:{pjs:'previous',html:'previous',files:{}},listingIntent:'listed',approval:{id:'synthetic-approval',kind:'review',draftId:'draft',workerId:'retained',documentId:'doc',confirmedAt:1},draftId:'draft',retainedTab:'retained'}:{})};}
try {
  for (const scenario of [...[1440,1024,530,320].map(width=>({width,state:initialState})),{width:320,state:emptyState(),setupOnly:true}]) {
    const {width}=scenario;
    const page = await browser.newPage({ viewport: { width, height: 768 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://perchance.org/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Synthetic Perchance</title><body><p id="native">Native fixture</p></body>' }));
    await page.addInitScript(({artifact,initialState}) => {
      // Test instrumentation only: open roots for browser assertions. Production is closed.
      const attach = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function(options) { return attach.call(this, { ...options, mode: 'open' }); };
      const gm = window === window.top ? { data: new Map(), listeners: new Map(), sequence: 0, trace: [] } : window.top.__syntheticGM;
      window.__syntheticGM = gm;
      gm.trace.push({event:'init',top:window===window.top,url:location.href});
      const data = gm.data;
      if(window===window.top)data.set('PCMS_STORE_V1',JSON.stringify(initialState));
      window.GM_registerMenuCommand = () => {};
      window.GM_info = { scriptHandler: 'Violentmonkey', injectInto: 'content' };
      window.GM_openInTab = () => { throw new Error('UI smoke must not open workers'); };
      window.GM_addValueChangeListener = (key, callback) => { const id = ++gm.sequence; gm.listeners.set(id, { key, callback }); return id; };
      window.GM_removeValueChangeListener = id => gm.listeners.delete(id);
      window.GM_getValue = async (key, fallback) => data.get(key) ?? fallback;
      window.GM_setValue = async (key, value) => { const old = data.get(key); data.set(key, value); gm.trace.push({event:'set',key,type:value?.type||null,nonce:key==='PCMS_STORE_PROBE_V1'?value?.nonce:null}); queueMicrotask(() => { for (const listener of gm.listeners.values()) if (listener.key === key) listener.callback(key, old, value, true); }); };
      window.unsafeWindow = { app: { store: { data: { user: { loggedIn: false } } } } };
      window.GM = { getValue: window.GM_getValue, setValue: window.GM_setValue, deleteValue: async key => data.delete(key) };
    }, {artifact:script,initialState:scenario.state});
    const probeInjections = [];
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame() || !frame.url().includes('pcms_store_probe=')) return;
      const nonce = new URL(frame.url()).searchParams.get('pcms_store_probe');
      const attempt = { nonce, error: null };
      attempt.done = frame.addScriptTag({ content: script }).catch(error => { attempt.error = error.message; });
      probeInjections.push(attempt);
    });
    await page.goto('https://perchance.org/welcome#pcms');
    await page.addScriptTag({ content: script });
    const app = page.locator('#pcms-root');
    await app.getByRole('heading', { name: 'Overview', exact: true }).waitFor();
    try { await app.getByText('Coordinator Verified', { exact: true }).waitFor(); }
    catch(error) {
      console.log(JSON.stringify({browser:browserType,width,errors,coordinatorText:await app.locator('.statusline').allTextContents(),probeFrames:await page.locator('iframe[src*=pcms_store_probe]').count(),storeTrace:await page.evaluate(()=>window.__syntheticGM.trace)}));
      throw error;
    }
    await page.waitForFunction(() => document.querySelectorAll('iframe[src*=pcms_store_probe]').length === 0);
    await Promise.all(probeInjections.map(attempt => attempt.done));
    for (const attempt of probeInjections) {
      if (attempt.error) assert.match(attempt.error, /Execution context was destroyed|Frame was detached|frame has been detached/i);
      assert.equal(await page.evaluate(nonce => window.__syntheticGM.trace.some(event => event.key === 'PCMS_STORE_PROBE_V1' && event.nonce === nonce), attempt.nonce), true, 'Every probe injection must produce its protected reply');
    }

    if(scenario.setupOnly){
      await app.getByLabel('Settings',{exact:true}).click();
      await app.getByLabel('Account ID',{exact:true}).fill('staged-account');
      await app.getByRole('navigation').getByRole('button',{name:'Generators',exact:true}).click();
      await app.getByLabel('Settings',{exact:true}).click();
      assert.equal(await app.getByLabel('Account ID',{exact:true}).inputValue(),'staged-account');
      await page.close();continue;
    }
    const baseline = await app.locator('.pagehead').boundingBox();
    for (const route of ['Generators', 'Reviews', 'Refresher']) {
      await app.getByRole('navigation').getByRole('button', { name: route, exact: true }).click();
      assert.equal(await app.locator('.pagehead h1').textContent(), route);
      const box = await app.locator('.pagehead').boundingBox();
      assert.ok(Math.abs(box.x - baseline.x) <= 2 && Math.abs(box.y - baseline.y) <= 2 && Math.abs(box.height - baseline.height) <= 2);
    }
    await app.getByRole('navigation').getByRole('button', { name: 'Generators', exact: true }).click();
    const inventoryList=app.getByRole('rowgroup');
    const inventoryTop=await inventoryList.evaluate(n=>{n.scrollTop=n.querySelector('[role=row][data-id="108"]').offsetTop-60;return n.scrollTop;});
    const selected=app.getByRole('checkbox',{name:'Select synthetic-generator-08',exact:true});
    await selected.check();
    assert.ok(Math.abs(await inventoryList.evaluate(n=>n.scrollTop)-inventoryTop)<=2);
    await app.getByRole('searchbox',{name:'Search generators',exact:true}).fill('synthetic-generator-01');
    assert.match(await app.locator('.inventory-footer').textContent(),/1 selected/);
    await app.getByRole('searchbox',{name:'Search generators',exact:true}).fill('');
    assert.equal(await selected.isChecked(),true);
    await app.getByRole('button',{name:'Manage synthetic-generator-08',exact:true}).click();
    await app.getByRole('dialog',{name:'Manage synthetic-generator-08',exact:true}).waitFor();
    const originalEligibility=await app.getByRole('dialog',{name:'Manage synthetic-generator-08',exact:true}).getByRole('button',{name:'Exclude',exact:true}).elementHandle();
    await app.getByRole('dialog',{name:'Manage synthetic-generator-08',exact:true}).getByRole('button',{name:'Exclude',exact:true}).click();
    await app.getByRole('dialog',{name:'Exclude generator',exact:true}).getByRole('button',{name:'Confirm',exact:true}).click();
    await app.getByRole('dialog',{name:'Exclude generator',exact:true}).waitFor({state:'detached'});
    const inclusion=app.getByRole('dialog',{name:'Manage synthetic-generator-08',exact:true}).getByRole('button',{name:'Include',exact:true});
    assert.equal(await originalEligibility.evaluate(n=>n.isConnected&&n.textContent==='Include'),true);
    assert.equal(await inclusion.evaluate(n=>n.getRootNode().activeElement===n),true);
    const protectedGenerator=await page.evaluate(async()=>JSON.parse(await window.GM.getValue('PCMS_STORE_V1')).generators['108']);
    assert.equal(protectedGenerator.excluded,true);assert.equal(protectedGenerator.listing,'listed');assert.equal(protectedGenerator.status.state,'done');assert.equal(protectedGenerator.holds.length,2);

    await page.keyboard.press('Escape');
    assert.equal(await app.getByRole('dialog').count(),0);
    await app.getByRole('button',{name:'Clear selection',exact:true}).click();
    assert.equal(await selected.isChecked(),false);
    await app.getByRole('button',{name:'Bulk Import',exact:true}).click();
    await app.locator('.pagehead h1').filter({hasText:'Bulk Import'}).waitFor();
    const importHeader=await app.locator('.pagehead').boundingBox();assert.ok(Math.abs(importHeader.y-baseline.y)<=2);
    const importAction=app.getByRole('button',{name:'Import selected',exact:true});assert.equal(await importAction.isDisabled(),true);
    const importFooter=await importAction.boundingBox();assert.ok(importFooter.y+importFooter.height<=768);
    await app.getByRole('button',{name:'Back',exact:true}).click();

    await app.getByLabel('Settings', { exact: true }).click();
    assert.equal(await app.getByLabel('Account ID', { exact: true }).isDisabled(),true);
    await app.getByLabel('Repository URL', { exact: true }).fill('https://github.com/synthetic/staged-repository');
    await app.getByRole('navigation').getByRole('button', { name: 'Generators', exact: true }).click();
    await app.getByLabel('Settings', { exact: true }).click();
    assert.equal(await app.getByLabel('Account ID', { exact: true }).inputValue(), 'synthetic-account');
    assert.equal(await app.getByLabel('Repository URL', { exact: true }).inputValue(), 'https://github.com/synthetic/staged-repository');
    page.once('dialog', d => d.accept('synthetic-secret-never-in-dom'));
    await app.getByRole('button', { name: 'Set PAT', exact: true }).click();
    assert.equal((await app.textContent()).includes('synthetic-secret-never-in-dom'), false);
    if (width <= 760) await app.getByRole('button', { name: 'Controls & system', exact: true }).click();
    await app.getByLabel('Polling interval (minutes)', { exact: true }).fill('0');
    await app.locator('.checks-card').getByRole('button', { name: 'Apply', exact: true }).click();
    await app.getByRole('status').filter({ hasText: 'Use an integer from 1 to 1440.' }).waitFor();
    assert.equal(await page.evaluate(async () => JSON.parse(await window.GM.getValue('PCMS_STORE_V1')).settings.pollMinutes), 10);
    await app.getByRole('button', { name: 'Toggle theme' }).click();
    await page.waitForFunction(() => document.querySelector('#pcms-root').dataset.theme === 'dark');
    assert.equal(await app.locator('h1').evaluate(n => getComputedStyle(n).color), 'rgb(238, 242, 250)');
    await app.getByRole('navigation').getByRole('button', { name: 'Overview', exact: true }).click();
    await app.getByRole('button', { name: 'Open Publication' }).focus();
    await page.keyboard.press('Enter');
    await app.getByRole('heading', { name: 'Utility', exact: true }).first().waitFor();
    const utilityList=app.getByRole('list',{name:'Utility jobs',exact:true});assert.equal(await utilityList.getByRole('listitem').count(),35);
    await utilityList.getByRole('listitem').filter({hasText:'synthetic-utility-01'}).click();
    assert.equal(await app.getByText('identity checked · Verified',{exact:true}).count(),1);
    assert.equal(await app.getByRole('navigation').getByRole('button').count(),4);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight),false);
    await app.getByRole('button', { name: 'Back', exact: true }).click();
    assert.equal(await app.getByRole('heading', { name: 'Overview', exact: true }).count(), 1);
    await app.getByRole('button',{name:'Open GitHub sync',exact:true}).click();
    await app.getByRole('list',{name:'Synchronization jobs',exact:true}).waitFor();
    const syncList=app.getByRole('list',{name:'Synchronization jobs',exact:true});assert.equal(await syncList.getByRole('listitem').count(),32);
    await syncList.getByRole('listitem').first().click();
    const keepLocal=app.getByRole('button',{name:'Keep approved local',exact:true});assert.equal(await keepLocal.isDisabled(),true);assert.equal(await app.getByRole('button',{name:'Publish GitHub version',exact:true}).isDisabled(),true);
    assert.equal((await app.textContent()).includes('synthetic-private-sync-source'),false);
    const sourceFooter=await app.locator('.sync-footer').boundingBox();assert.ok(sourceFooter.y+sourceFooter.height<=768);
    if(width>=1024)assert.equal(await app.locator('.sync-details').evaluate(n=>n.scrollHeight>n.clientHeight+1),false);
    await app.getByRole('button',{name:'Stop managing',exact:true}).click();
    await app.getByRole('dialog',{name:'Stop managing',exact:true}).getByRole('button',{name:'Cancel',exact:true}).click();
    await app.getByRole('dialog',{name:'Stop managing',exact:true}).waitFor({state:'detached'});
    assert.equal(await app.getByRole('button',{name:'Stop managing',exact:true}).evaluate(n=>n.getRootNode().activeElement===n),true);
    assert.equal(await page.evaluate(async()=>JSON.parse(await window.GM.getValue('PCMS_STORE_V1')).pending['conflict-source'].phase),'source-conflict');
    await app.getByRole('button',{name:'Back',exact:true}).click();
    await app.getByRole('button', { name: 'Show all', exact: true }).click();
    await app.getByRole('searchbox', { name: 'Search activity', exact: true }).fill('coordinator');
    const journalRow = app.getByRole('button', { name: 'Coordinator · verified', exact: true }).first();
    await journalRow.click();
    await app.getByRole('dialog', { name: 'Event details', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await app.getByRole('dialog').count(), 0);
    assert.equal(await journalRow.evaluate(n => n.getRootNode().activeElement === n), true);

    assert.equal(await page.locator('#native').textContent(), 'Native fixture');
    assert.equal(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight), false);
    assert.equal(await app.locator('.shell').evaluate(n => n.scrollWidth > n.clientWidth), false);
    await page.screenshot({ path: `/tmp/pcms-shell-${width}.png` });
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(`UI shell PASS: ${browserType}, four widths, navigation, keyboard, theme, header stability and native page preservation`);
} finally { await browser.close(); }
