import { requireThat, nativeId } from '../shared/domain.js';

export const COMPONENTS = Object.freeze(['coordinator','settings','github','utility','helper','refresher','manual','recovery']);
export const OUTCOMES = Object.freeze(['verified','applied','committed','confirmed','queued','review','cancelled','failed','unknown','offline','held']);
const REASONS = Object.freeze(['none','session','storage','worker-lost','source-conflict','request-conflict','native-result','github-result','owner-mismatch','invalid-request']);

export function appendEvent(state, event, { uuid = () => crypto.randomUUID(), now = () => Date.now(), limit = 2000 } = {}) {
  requireThat(COMPONENTS.includes(event.component) && OUTCOMES.includes(event.outcome), 'invalid-journal-event');
  const row = { id: uuid(), sequence: ++state.journalSequence, at: now(), component: event.component, outcome: event.outcome, nativeId: event.nativeId ? nativeId(event.nativeId) : null, reason: REASONS.includes(event.reason) ? event.reason : 'none', count: Number.isSafeInteger(event.count) && event.count > 0 ? event.count : 1, jobId: event.jobId || null };
  state.journal.push(row);
  while (state.journal.length > limit) {
    const remove = state.journal.findIndex(e => !e.jobId || !['prepared','dispatched','unknown'].includes(state.jobs[e.jobId]?.phase));
    if (remove < 0) break; // Never delete unresolved recovery evidence to free space.
    state.journal.splice(remove,1);
  }
  return row;
}

export function eventLabel(event) {
  if (event.component === 'refresher' && event.outcome === 'confirmed') return `${event.count || 1} Save${event.count === 1 ? '' : 's'} confirmed`;
  return `${event.component === 'helper' ? 'AI Helper' : event.component[0].toUpperCase()+event.component.slice(1)} · ${event.outcome}`;
}

export function recentEvents(events, limit = 3) {
  const rows=[];
  for(const event of [...events].reverse()) {
    const previous=rows.at(-1);
    if(event.component==='refresher' && event.outcome==='confirmed' && previous?.component==='refresher' && previous.outcome==='confirmed') previous.count+=(event.count||1);
    else { if(rows.length>=limit)break;rows.push({...event,count:event.count||1}); }
  }
  return rows;
}

export function exportJournal(events) {
  return events.filter(e=>COMPONENTS.includes(e.component)&&OUTCOMES.includes(e.outcome)).map(e=>({id:typeof e.id==='string'&&/^[A-Za-z0-9_-]+$/.test(e.id)?e.id:'unknown',sequence:Number.isSafeInteger(e.sequence)?e.sequence:0,at:Number.isFinite(e.at)?e.at:0,component:e.component,outcome:e.outcome,nativeId:typeof e.nativeId==='string'&&/^[A-Za-z0-9_-]+$/.test(e.nativeId)?e.nativeId:null,reason:REASONS.includes(e.reason)?e.reason:'none',count:Number.isSafeInteger(e.count)&&e.count>0?e.count:1}));
}
