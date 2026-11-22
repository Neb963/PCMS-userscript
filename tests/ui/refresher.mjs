import assert from 'node:assert/strict';

export async function checkRefresher({page,app,width,empty=false}) {
  const mobile=app.getByLabel('Refresher mobile sections',{exact:true});
  const pane=async name=>{if(width<=530)await mobile.getByRole('button',{name,exact:true}).click();};
  const read=()=>page.evaluate(async()=>JSON.parse(await window.GM.getValue('PCMS_STORE_V1')));
  const rows=app.getByRole('rowgroup',{name:'Refresher queue rows',exact:true});
  await rows.waitFor();
  assert.equal(await mobile.isVisible(),width<=530);
  assert.match(await app.getByLabel('Refresher operating state').textContent(),/Unknown/);
  assert.match(await app.getByLabel('Refresher operating state').textContent(),/snapshot only/);
  if(empty){
    assert.equal(await rows.getByRole('row').count(),0);
    await app.getByText('No eligible generators. No Save will be attempted.',{exact:true}).waitFor();
    await pane('Rate');assert.deepEqual(await app.locator('.refresh-derived strong').allTextContents(),['—','—','—']);
    await pane('Attempts');await app.getByText('No Save attempts recorded.',{exact:true}).waitFor();
    return;
  }
  const before=await read();
  assert.ok(before.fifo.length>12);assert.equal(await rows.getByRole('row').count(),before.fifo.length);
  assert.deepEqual(await rows.getByRole('row').evaluateAll(nodes=>nodes.map(n=>n.dataset.id)),before.fifo);
  const top=await rows.evaluate(n=>{n.scrollTop=230;return n.scrollTop;});assert.ok(top>0);
  await app.getByRole('button',{name:/^Not eligible/}).click();
  await rows.getByRole('button',{name:'Manage synthetic-generator-00',exact:true}).click();
  await app.getByRole('dialog',{name:'Manage synthetic-generator-00',exact:true}).waitFor();
  await page.keyboard.press('Escape');
  await app.getByRole('navigation').getByRole('button',{name:'Refresher',exact:true}).click();
  await app.getByRole('button',{name:/^Snapshot \(/}).click();
  await pane('Rate');
  const cap=app.getByLabel('Max attempts per hour',{exact:true}),apply=app.locator('.refresh-rate').getByRole('button',{name:'Apply',exact:true});
  const ratePanel=await app.locator('.refresh-rate').boundingBox(),lastFigure=await app.locator('.refresh-derived').boundingBox();
  assert.ok(lastFigure.y+lastFigure.height<=ratePanel.y+ratePanel.height,'Rate figures must remain inside their panel');
  await cap.fill('0');await apply.click();await app.getByText('Use an integer from 1 to 3600.',{exact:true}).waitFor();
  assert.equal((await read()).settings.refreshCap,before.settings.refreshCap);
  await cap.fill('60');await cap.focus();await apply.click();
  await page.waitForFunction(()=>JSON.parse(window.__syntheticGM.data.get('PCMS_STORE_V1')).settings.refreshCap===60);
  await cap.fill('72');await cap.focus();
  await page.evaluate(async()=>{await window.GM_setValue('PCMS_STORE_V1',await window.GM_getValue('PCMS_STORE_V1'));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
  assert.equal(await cap.evaluate(n=>n.getRootNode().activeElement===n),true);
  await app.getByRole('navigation').getByRole('button',{name:'Reviews',exact:true}).click();
  await app.getByRole('navigation').getByRole('button',{name:'Refresher',exact:true}).click();
  assert.equal(await app.getByLabel('Max attempts per hour',{exact:true}).inputValue(),'72');
  await app.getByRole('button',{name:'Pause',exact:true}).click();
  await app.getByRole('button',{name:'Resume',exact:true}).waitFor();
  await app.getByRole('button',{name:'Resume',exact:true}).click();
  await app.getByRole('button',{name:'Pause',exact:true}).waitFor();
  const after=await read();assert.deepEqual(after.fifo,before.fifo);assert.deepEqual(after.attempts,before.attempts);assert.equal(after.settings.refreshPaused,false);assert.equal(after.settings.refreshCap,60);
  await pane('Attempts');
  const attempts=app.getByRole('list',{name:'Recent Save attempts',exact:true});
  assert.equal(await attempts.getByRole('listitem').count(),42);
  assert.equal(await attempts.getByText('Saved',{exact:true}).count(),0);
  for(const outcome of ['Unknown','Failed','Skipped'])assert.ok(await attempts.getByText(outcome,{exact:true}).count()>0);
  assert.ok(await attempts.evaluate(n=>{n.scrollTop=n.scrollHeight;return n.scrollTop;})>0);
  if(width<=530){assert.equal(await rows.isVisible(),false);assert.equal(await cap.isVisible(),false);}
  await app.getByRole('button',{name:'Toggle theme',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#pcms-root').dataset.theme==='dark');
  assert.equal(await attempts.evaluate(n=>getComputedStyle(n.closest('.panel')).backgroundColor),'rgb(23, 33, 48)');
  await app.getByRole('button',{name:'Toggle theme',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#pcms-root').dataset.theme==='light');
  await pane('Queue');
  assert.equal(await rows.isVisible(),true);
  if(width<=530)assert.equal(await attempts.isVisible(),false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight),false);
  assert.equal(await app.locator('.refresh-layout').evaluate(n=>n.scrollWidth>n.clientWidth),false);
  if(width>530){
    const left=await app.locator('.refresh-queue').boundingBox(),right=await app.locator('.refresh-rate').boundingBox();assert.ok(right.x>=left.x+left.width);
  }
}
