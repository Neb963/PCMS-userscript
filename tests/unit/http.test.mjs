import { test } from 'node:test';
import assert from 'node:assert/strict';
import { privilegedRequest } from '../../src/adapters/http.js';

test('privileged transport rejects non-GitHub credential targets before dispatch',async()=>{
  let calls=0;const xhr=()=>{calls++;};
  assert.throws(()=>privilegedRequest(xhr,'https://perchance.org/api/read',{headers:{Authorization:'Bearer synthetic'}}),/credential-target/);
  for(const url of ['https://api.github.com.evil.test','http://api.github.com','https://user:pass@api.github.com','https://api.github.com:444']) assert.throws(()=>privilegedRequest(xhr,url),/target/);
  assert.equal(calls,0);
});
test('public bytes and JSON validate responses and reject challenges/redirects',async()=>{
  const json=await privilegedRequest(o=>o.onload({status:200,responseText:'{"status":"success"}'}),'https://perchance.org/api/read');assert.equal(json.status,'success');
  const bytes=await privilegedRequest(o=>o.onload({status:200,response:new Uint8Array([0,255]).buffer}),'https://user.uploads.dev/file/synthetic',{type:'bytes'});assert.deepEqual([...bytes],[0,255]);
  await assert.rejects(privilegedRequest(o=>o.onload({status:200,responseText:'<html>challenge</html>'}),'https://perchance.org/api/read'),/invalid/);
  await assert.rejects(privilegedRequest(o=>o.onload({status:200,responseText:'{}',finalUrl:'https://untrusted.test/'}),'https://api.github.com/repos/synthetic/repo'),/redirect/);
});
