import assert from 'node:assert/strict';
export async function checkReviews({page,app}){
  await app.getByRole('navigation').getByRole('button',{name:'Reviews',exact:true}).click();
  const review=app.getByRole('list',{name:'Awaiting review jobs',exact:true}),running=app.getByRole('list',{name:'Running Development jobs',exact:true}),queue=app.getByRole('list',{name:'Queued Development jobs',exact:true});
  assert.equal(await review.getByRole('listitem').count(),34);assert.equal(await running.getByRole('listitem').count(),2);assert.equal(await queue.getByRole('listitem').count(),35);
  assert.ok(await review.evaluate(n=>{n.scrollTop=200;return n.scrollTop;})>0);assert.ok(await queue.evaluate(n=>{n.scrollTop=n.scrollHeight;return n.scrollTop;})>0);
  assert.equal(await review.getByRole('button',{name:'Approve & Publish synthetic-review-00',exact:true}).isDisabled(),true);
  await review.getByRole('button',{name:'Review synthetic-review-00',exact:true}).click();await app.getByRole('status').filter({hasText:'Switch to synthetic-review-00'}).waitFor();
  const cancel=review.getByRole('button',{name:'Cancel synthetic-review-00',exact:true});await cancel.click();
  await app.getByRole('dialog',{name:'Cancel synthetic-review-00',exact:true}).getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal(await cancel.evaluate(n=>n.getRootNode().activeElement===n),true);
  await cancel.click();await app.getByRole('dialog',{name:'Cancel synthetic-review-00',exact:true}).getByRole('button',{name:'Confirm',exact:true}).click();
  await review.getByRole('button',{name:'Open retained draft synthetic-review-00',exact:true}).waitFor();
  await page.waitForFunction(()=>{const root=document.querySelector('#pcms-root').shadowRoot,row=root.querySelector('.development-row[data-id="review-0"]');return row?.contains(root.activeElement);});
  const state=await page.evaluate(()=>JSON.parse(window.__syntheticGM.data.get('PCMS_STORE_V1')));
  assert.equal(state.development['review-0'].phase,'cancelled');assert.equal(state.generators['300'].listing,'listed');assert.equal(state.workers['review-worker-0'].phase,'retained');assert.equal(state.generators['300'].holds.some(h=>h.kind==='cancelled-draft'),true);
  assert.equal((await app.textContent()).includes('synthetic-review-private-source'),false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight),false);assert.equal(await app.locator('.reviews-layout').evaluate(n=>n.scrollWidth>n.clientWidth),false);
  const bottom=await queue.boundingBox();assert.ok(bottom.height>24&&bottom.y+bottom.height<=768);
}
