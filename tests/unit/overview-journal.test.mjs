import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendEvent, recentEvents, exportJournal } from '../../src/state/journal.js';
import { actionCases, operationRows } from '../../src/ui/overview-model.js';
import { emptyState } from '../../src/state/store.js';

test('cases preserve all independent causes and fixed highest priority per native ID',()=>{
  const s=emptyState();s.settings.account.accountId='alpha';s.generators['123']={id:'123',slug:'synthetic-generator',status:{state:'review',action:'develop'},holds:[{kind:'source-conflict'},{kind:'native-unknown'}]};
  const rows=actionCases(s,{session:{confirmed:true}});assert.equal(rows.length,1);assert.equal(rows[0].priority,2);assert.equal(rows[0].causes.length,3);assert.equal(rows[0].destination,'generators');
  assert.equal(actionCases(s,{session:{signedIn:false,confirmed:false}})[0].priority,0);
  assert.ok(operationRows(s,'Unverified',{confirmed:true}).every(r=>r.status==='Unknown'));
});
test('one bounded journal keeps stable sequence and unresolved recovery evidence',()=>{
  const s=emptyState();s.jobs.pending={phase:'unknown'};let id=0;const opts={uuid:()=> 'event-'+ ++id,now:()=>1000+id,limit:2};
  appendEvent(s,{component:'utility',outcome:'unknown',jobId:'pending'},opts);
  appendEvent(s,{component:'refresher',outcome:'confirmed'},opts);
  appendEvent(s,{component:'refresher',outcome:'confirmed'},opts);
  assert.equal(s.journal.length,2);assert.equal(s.journal[0].id,'event-1');assert.equal(s.journalSequence,3);
  appendEvent(s,{component:'refresher',outcome:'failed'},opts);assert.equal(s.journal[0].id,'event-1');
});
test('only confirmed refresh saves aggregate; journal export allowlists all fields',()=>{
  const s=emptyState();for(const outcome of ['confirmed','confirmed','failed','confirmed'])appendEvent(s,{component:'refresher',outcome,nativeId:'123'});
  const rows=recentEvents(s.journal);assert.equal(rows.length,3);assert.equal(rows[2].count,2);assert.equal(rows[1].outcome,'failed');
  const unsafe={...s.journal[0],pat:'synthetic-secret',slug:'private-slug',source:'private-source',repository:'private-repository',reason:'arbitrary raw secret'};
  const output=JSON.stringify(exportJournal([unsafe]));for(const secret of ['synthetic-secret','private-slug','private-source','private-repository','arbitrary raw secret'])assert.equal(output.includes(secret),false);
});
