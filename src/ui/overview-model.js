const CAUSES = Object.freeze({
  'listing-mismatch':[1,'Listing needs confirmation','generators','Resolve Listing'],
  'native-unknown':[2,'Save outcome unknown','generators','Recheck result'],
  'helper-unknown':[2,'Helper result unknown','reviews','Open Reviews'],
  'worker-lost':[2,'Retained tab unavailable','generators','Recheck result'],
  'identity-mismatch':[2,'Generator identity changed','generators','Manage'],
  'snapshot-failure':[2,'Source snapshot unavailable','generators','Recheck result'],
  'source-conflict':[3,'Source conflict','sync','Compare versions'],
  'source-drift':[3,'Saved source changed','generators','Compare saved source'],
  'request-conflict':[3,'Request changed','utility','Open Utility'],
  'account-conflict':[3,'Account assignment changed','generators','Manage'],
  'slug':[4,'Slug unavailable','utility','Open Utility'],
  'rename':[3,'Rename needs confirmation','generators','Resolve rename'],
  'cancelled-draft':[4,'Cancelled draft retained','reviews','Open Reviews'],
  'review':[5,'Awaiting review','reviews','Review'],
});

export function actionCases(state, { session = null, storageAvailable = true } = {}) {
  const rows=[];
  if(!storageAvailable)rows.push({key:'profile-storage',priority:0,title:'Storage unavailable',destination:'settings',action:'Settings',causes:['storage']});
  else if(!state.settings.account.accountId)rows.push({key:'profile-account',priority:0,title:'Setup required',destination:'settings',action:'Settings',causes:['account']});
  else if(!session?.confirmed)rows.push({key:'profile-session',priority:0,title:session?.signedIn===false?'Sign in required':'Confirm session required',destination:'settings',action:session?.signedIn===false?'Sign in':'Confirm session',causes:['session']});
  for(const gen of Object.values(state.generators)) {
    const causes=(gen.holds||[]).filter(h=>CAUSES[h.kind]).map(h=>({kind:h.kind,definition:CAUSES[h.kind]}));
    if(gen.status?.state==='review'&&!causes.some(c=>c.kind==='review'))causes.push({kind:'review',definition:CAUSES.review});
    if(!causes.length)continue;
    causes.sort((a,b)=>a.definition[0]-b.definition[0]||a.kind.localeCompare(b.kind));
    const [priority,title,defaultDestination,action]=causes[0].definition;
    const destination=causes[0].kind==='request-conflict'&&gen.status?.action==='develop'?'reviews':defaultDestination;
    rows.push({key:'generator-'+gen.id,nativeId:gen.id,slug:gen.slug,priority,title,destination,action,causes:causes.map(c=>c.kind),retainedTab:gen.retainedTab||null});
  }
  for(const request of state.requests||[])if(!request.valid&&!Object.values(state.generators).some(g=>g.slug===request.slug))rows.push({key:JSON.stringify([request.repository,request.slug]),slug:request.slug,priority:4,title:'Invalid request',destination:'utility',action:'Open Utility',causes:['invalid-request']});
  for(const job of Object.values(state.jobs))if(job.kind==='github'&&job.phase==='unknown'&&!job.locallyStopped){
    const pending=Object.values(state.pending).find(p=>p.slug===job.slug&&JSON.stringify(p.repository)===JSON.stringify(job.repository));
    const gen=pending&&state.generators[pending.generatorId];
    const key=gen?'generator-'+gen.id:JSON.stringify([job.repository,job.slug]);
    const existing=rows.find(r=>r.key===key);
    if(existing){if(!existing.causes.includes('github-unknown'))existing.causes.push('github-unknown');if(existing.priority>3)Object.assign(existing,{priority:3,title:'GitHub result unknown',destination:'sync',action:'Recheck result'});}
    else rows.push({key,nativeId:gen?.id,slug:job.slug,priority:3,title:'GitHub result unknown',destination:'sync',action:'Recheck result',causes:['github-unknown']});
  }
  return rows.sort((a,b)=>a.priority-b.priority||a.key.localeCompare(b.key));
}

export function operationRows(state, coordinator, session) {
  const known=coordinator==='Verified';
  const workers=Object.values(state.workers),utilityCommands=Object.values(state.commands||{}).filter(c=>c.kind==='bulk-import'),pending=Object.values(state.pending).filter(p=>p.phase!=='synced');
  return [
    {title:'Refresher',route:'refresher',status:!known?'Unknown':!session?.confirmed||state.settings.refreshPaused?'Paused':workers.some(w=>w.role==='refresher'&&w.phase==='busy')?'Running':'Unavailable',detail:`${state.fifo.length} in queue · ${state.settings.refreshCap} attempts/h`},
    {title:'AI Helper',route:'reviews',status:!known?'Unknown':`${workers.filter(w=>w.role==='development'&&w.phase==='busy').length} / 2 active`,detail:'Two running Development slots'},
    {title:'Publication',route:'utility',status:!known?'Unknown':utilityCommands.some(c=>c.phase==='running')||Object.values(state.requestQueue||{}).some(r=>r.phase==='running')||workers.some(w=>w.role==='utility'&&w.phase==='busy')?'Active':'Idle',detail:'One sequential Utility worker'},
    {title:'GitHub sync',route:'sync',status:!known?'Unknown':state.githubCheck?.status==='offline'?'Offline':state.githubCheck?.status==='verified'?'Connected':state.settings.github?'Checking':'Setup required',detail:`${pending.length} pending`},
  ];
}
