import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withRefreshMarkers,refreshMarkers,functionalSource,functionalFingerprint} from '../../src/refresher/markers.js';
import {sourceEqual} from '../../src/shared/domain.js';

test('markers are leading syntax-safe comments and replace in place without functional source/src changes',async()=>{
  for(const source of [{pjs:'output\n  example',html:'<!doctype html><script>window.example="unchanged";</script>',files:{'binary.bin':[0,255]}},{pjs:'',html:'',files:{}},{pjs:'\uFEFFoutput\r\n  example\r\n',html:'\uFEFF<!doctype html>\r\n<textarea>open',files:{'empty.bin':[]}}]){
    const initial=withRefreshMarkers(source,'attempt-one'),next=withRefreshMarkers(initial,'attempt-two');assert.deepEqual(refreshMarkers(initial),{pjs:'attempt-one',html:'attempt-one'});assert.deepEqual(refreshMarkers(next),{pjs:'attempt-two',html:'attempt-two'});assert.equal(sourceEqual(functionalSource(initial),source),true);assert.equal(sourceEqual(functionalSource(next),source),true);assert.equal(await functionalFingerprint(next),await functionalFingerprint(source));assert.equal(next.pjs.includes('attempt-one'),false);assert.equal(next.html.includes('attempt-one'),false);
  }
});
test('unsafe ID, malformed/moved/duplicate marker cannot create a native refresh edit',()=>{
  const source={pjs:'output\n  example',html:'[output]',files:{}};for(const id of ['bad--comment','newline\nid','-->','',null])assert.throws(()=>withRefreshMarkers(source,id),/marker-id/);
  assert.throws(()=>withRefreshMarkers({...source,pjs:'// @pcms-refresh:v1 broken marker\noutput'},'valid'),/invalid-refresh-marker/);
  const marked=withRefreshMarkers(source,'valid');assert.throws(()=>withRefreshMarkers({...marked,pjs:'// @pcms-refresh:v1 duplicate\n'+marked.pjs},'new'),/duplicate-or-moved/);
});
test('missing or mismatched receipt markers are distinguishable even when functional source matches',()=>{
  const source={pjs:'output\n  example',html:'[output]',files:{}},marked=withRefreshMarkers(source,'one');assert.equal(sourceEqual(functionalSource(marked),source),true);assert.deepEqual(refreshMarkers({...marked,html:source.html}),{pjs:'one',html:null});
});
