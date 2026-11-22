import { GitHubReader, blobHash, bytesToBase64 } from '../../src/adapters/github/reader.js';
export async function githubFixture() {
  const files={'synthetic-generator/main.pjs':'output\n  example','synthetic-generator/main.html':'<p>example</p>','synthetic-generator/status.md':'account: alpha\naction: publish_from_github\nstate: ready\n','synthetic-generator/src/a.bin':new Uint8Array([0,255])};
  const blobs={},entries=[],calls=[];const commit='a'.repeat(40),tree='b'.repeat(40);
  for(const [path,data] of Object.entries(files)) {const bytes=typeof data==='string'?new TextEncoder().encode(data):data;const sha=await blobHash(bytes);blobs[sha]={sha,size:bytes.length,encoding:'base64',content:bytesToBase64(bytes)};entries.push({path,sha,type:'blob',mode:'100644'});}
  const request=async(url,options)=>{calls.push({url,options});const path=new URL(url).pathname;
    if(path.endsWith('/git/ref/heads/main'))return {object:{sha:commit,type:'commit'}};
    if(path.endsWith('/git/commits/'+commit))return {sha:commit,tree:{sha:tree}};
    if(path.endsWith('/git/trees/'+tree))return {sha:tree,truncated:false,tree:structuredClone(entries)};
    if(path.includes('/git/blobs/'))return structuredClone(blobs[path.split('/').at(-1)]);
    if(path.endsWith('/commits'))return [{sha:'c'.repeat(40)}];
    throw Error('unexpected request');
  };
  const reader=new GitHubReader({repository:{owner:'synthetic',name:'repo'},pat:'synthetic-pat',request});
  return {reader,files,blobs,entries,calls,commit,tree,request};
}
