import {blobHash,bytesToBase64,base64ToBytes} from '../../src/adapters/github/reader.js';
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');
// In-memory provider with immutable commit/tree/blob objects and real history.
// Production GitHubReader/Writer exercise their normal request/byte verification.
export class SyntheticGitData {
 constructor(){this.repository={owner:'synthetic',name:'integration'};this.blobs=new Map();this.trees=new Map();this.commits=new Map();this.head=null;this.offline=false;this.loseNextRef=false;this.refs=0;this.count=0;}
 async init(){const tree=await hash([]);this.trees.set(tree,{});this.head=await this.commit(tree,[],'root');return this;}
 async commit(tree,parents,message){const sha=await hash({tree,parents,message,n:++this.count}),entries=this.trees.get(tree),previous=parents.length?this.trees.get(this.commits.get(parents[0]).commit.tree.sha):{};const paths=[...new Set([...Object.keys(entries),...Object.keys(previous)])].filter(p=>entries[p]?.sha!==previous[p]?.sha);this.commits.set(sha,{sha,parents:parents.map(sha=>({sha})),paths,commit:{message,tree:{sha:tree},committer:{date:new Date(1767225600000+this.count*1000).toISOString()}}});return sha;}
 history(at,path){const rows=[];while(at){const c=this.commits.get(at);if(!c)throw Error('missing-commit');if(!path||c.paths.some(p=>path.endsWith('/')?p.startsWith(path):p===path))rows.push(structuredClone(c));at=c.parents[0]?.sha;}return rows;}
 async request(url,options={}){
  if(this.offline)throw Error('offline');const u=new URL(url),p=u.pathname.replace('/repos/synthetic/integration',''),body=options.body||{},post=options.method==='POST';
  if(p==='/git/ref/heads/main')return {object:{type:'commit',sha:this.head}};
  if(p.startsWith('/git/commits/')){const c=this.commits.get(p.split('/').at(-1));if(!c)throw Error('missing-commit');return structuredClone({sha:c.sha,tree:c.commit.tree,parents:c.parents});}
  if(p==='/git/blobs'&&post){const bytes=Array.from(base64ToBytes(body.content)),sha=await blobHash(bytes);this.blobs.set(sha,bytes);return {sha};}
  if(p.startsWith('/git/blobs/')){const sha=p.split('/').at(-1),bytes=this.blobs.get(sha);if(!bytes)throw Error('missing-blob');return {sha,size:bytes.length,encoding:'base64',content:bytesToBase64(bytes)};}
  if(p==='/git/trees'&&post){const entries=structuredClone(this.trees.get(body.base_tree));for(const e of body.tree){if(e.sha===null)delete entries[e.path];else entries[e.path]={...e};}const sha=await hash(entries);this.trees.set(sha,entries);return {sha};}
  if(p.startsWith('/git/trees/')){const sha=p.split('/').at(-1);return {sha,truncated:false,tree:Object.values(this.trees.get(sha))};}
  if(p==='/git/commits'&&post)return {sha:await this.commit(body.tree,body.parents,body.message)};
  if(p==='/git/refs/heads/main'&&options.method==='PATCH'){if(body.force||!this.history(body.sha).some(c=>c.sha===this.head))throw Error('http-conflict');this.head=body.sha;this.refs++;if(this.loseNextRef){this.loseNextRef=false;throw Error('lost-ref-response');}return {object:{sha:this.head}};}
  if(p==='/commits')return this.history(u.searchParams.get('sha')||this.head,u.searchParams.get('path')).slice(0,Number(u.searchParams.get('per_page')||100));
  throw Error('unsupported-synthetic-path: '+p);
 }
}
