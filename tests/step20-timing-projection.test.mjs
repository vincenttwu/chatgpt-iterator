import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ApplicationRepositories, EXPORT_FORMAT_VERSION, LOGICAL_MIGRATIONS, LOGICAL_MODEL_VERSION, PERSISTENCE_STORES, PHYSICAL_DB_VERSION } from '../src/persistence/index.ts';
import { DurableRunManager, DurableRunRepository, RUN_STATE_SCHEMA_VERSION, requireRunSnapshot } from '../src/runs/index.ts';
import { projectRunPresentation, RUN_PRESENTATION_TONES } from '../src/presentation/index.ts';

const text = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const clone = (value) => structuredClone(value);
const keyFor = (store, value) => store === 'metadata' ? value.key : value.id;
function matchesIndex(store,index,value,query){if(query===undefined)return true;if(store==='runEvents'&&index==='byRunId')return value.runId===query;return true;}
class MemoryDriver {
  state=new Map(PERSISTENCE_STORES.map(name=>[name,new Map()]));
  async transaction(stores,mode,work){const before=new Map([...this.state].map(([n,v])=>[n,new Map([...v].map(([k,x])=>[k,clone(x)]))]));const port={store:(name)=>({get:async(k)=>{const v=this.state.get(name).get(k);return v===undefined?undefined:clone(v);},getAll:async()=>[...this.state.get(name).values()].map(clone),getAllByIndex:async(i,q)=>[...this.state.get(name).values()].filter(v=>matchesIndex(name,i,v,q)).map(clone),put:async(v)=>{if(mode!=='readwrite')throw new Error('readonly');this.state.get(name).set(keyFor(name,v),clone(v));},delete:async(k)=>{if(mode!=='readwrite')throw new Error('readonly');this.state.get(name).delete(k);}})};try{return await work(port);}catch(e){this.state=before;throw e;}}
  close(){}
}
function harness(){const repositories=new ApplicationRepositories(new MemoryDriver());let nowMs=Date.parse('2026-08-24T04:00:00Z');const repository=new DurableRunRepository(repositories,{now:()=>new Date(nowMs).toISOString(),id:()=>crypto.randomUUID()});return{manager:new DurableRunManager(repository),advance:(ms)=>{nowMs+=ms;},now:()=>nowMs};}
async function waitingDelay(manager, nowMs){let run=(await manager.create({targetTabId:7,targetWindowId:2,commandId:crypto.randomUUID(),messageTemplate:'Continue',totalIterations:2,delaySeconds:10,autoContinue:true,autoScroll:false,preventDiscard:false})).snapshot;run=(await manager.start(run.id,run.generation,crypto.randomUUID())).snapshot;run=(await manager.prepareIteration(run.id,run.generation,crypto.randomUUID(),{iteration:1,message:'Continue',assistantBaselineFingerprint:'af2:11111111111111111111111111111111'})).snapshot;return (await manager.completeIteration(run.id,run.generation,crypto.randomUUID(),new Date(nowMs+10_000).toISOString())).snapshot;}

function execution(overrides={}){return{mode:'repeat',messageTemplate:'Continue',totalIterations:3,completedIterations:1,activeIteration:null,activeMessage:null,activeDelayAfterSeconds:null,delaySeconds:10,autoContinue:true,autoScroll:true,preventDiscard:true,assistantBaselineFingerprint:null,responseStartedAt:null,nextDueAt:null,remainingDelayMs:null,...overrides};}
function snapshot(state, overrides={}){
  const now='2026-08-24T04:00:00.000Z';
  let resumeState=null,suspensionReason=null,failure=null,exec=execution();
  if(state==='waiting_response') exec=execution({activeIteration:2,activeMessage:'Continue',assistantBaselineFingerprint:'af2:11111111111111111111111111111111',responseStartedAt:now});
  if(state==='waiting_delay') exec=execution({nextDueAt:'2026-08-24T04:00:10.000Z'});
  if(state==='frozen'){resumeState='running';suspensionReason='tab_frozen';}
  if(state==='discarded'){resumeState='running';suspensionReason='tab_discarded';}
  if(state==='reconnecting'){resumeState='running';suspensionReason='tab_reconnecting';}
  if(state==='paused'){resumeState='running';suspensionReason='user';}
  if(state==='failed')failure={code:'x',message:'failed'};
  return requireRunSnapshot({schemaVersion:4,id:crypto.randomUUID(),generation:2,lifecycleState:state,targetTabId:7,targetWindowId:2,conversationBinding:{kind:'unbound',conversationId:null},resumeState,suspensionReason,failure,execution:exec,createdAt:now,updatedAt:now,...overrides});
}

test('STEP-04 pause freezes the remaining delay and Resume creates a fresh due time', async()=>{
  const h=harness();let run=await waitingDelay(h.manager,h.now());
  h.advance(6_000);
  run=(await h.manager.pause(run.id,run.generation,crypto.randomUUID())).snapshot;
  assert.equal(run.lifecycleState,'paused');assert.equal(run.resumeState,'waiting_delay');assert.equal(run.execution.nextDueAt,null);assert.equal(run.execution.remainingDelayMs,4_000);
  h.advance(90_000);
  const recovered=(await h.manager.recoverWorker()).find(x=>x.id===run.id);assert.equal(recovered.execution.remainingDelayMs,4_000);assert.equal(recovered.execution.nextDueAt,null);
  const resumeAt=h.now();run=(await h.manager.resume(recovered.id,recovered.generation,crypto.randomUUID())).snapshot;
  assert.equal(run.lifecycleState,'waiting_delay');assert.equal(run.execution.remainingDelayMs,null);assert.equal(Date.parse(run.execution.nextDueAt)-resumeAt,4_000);
});

test('STEP-04 legacy v3 paused delay normalizes to v4 frozen remainder without consuming wall clock',()=>{
  const old=requireRunSnapshot({schemaVersion:3,id:crypto.randomUUID(),generation:4,lifecycleState:'paused',targetTabId:1,targetWindowId:1,conversationBinding:{kind:'unbound',conversationId:null},resumeState:'waiting_delay',suspensionReason:'user',failure:null,execution:{...execution(),responseStartedAt:undefined,remainingDelayMs:undefined,nextDueAt:'2026-08-24T04:00:10.000Z'},createdAt:'2026-08-24T03:59:00.000Z',updatedAt:'2026-08-24T04:00:06.000Z'});
  assert.equal(old.schemaVersion,4);assert.equal(old.execution.nextDueAt,null);assert.equal(old.execution.remainingDelayMs,4_000);
});

test('STEP-04 response timing is elapsed and explicitly indeterminate, never a fabricated ETA',()=>{
  const run=snapshot('waiting_response');const p=projectRunPresentation(run,{now:Date.parse('2026-08-24T04:00:05.250Z')});
  assert.equal(p.responseElapsedMs,5_250);assert.equal(p.responseElapsedSeconds,5);assert.equal(p.responseIndeterminate,true);assert.equal('etaMs' in p,false);
});

test('STEP-04 projection covers every lifecycle with text identity, semantic tone, progress, and actions',()=>{
  const states=['ready','running','waiting_response','waiting_delay','paused','frozen','discarded','reconnecting','completed','failed','stopped'];
  assert.deepEqual(RUN_PRESENTATION_TONES,['neutral','active','waiting','paused','attention','success','error']);
  for(const state of states){const p=projectRunPresentation(snapshot(state),{now:Date.parse('2026-08-24T04:00:03Z')});assert.ok(p.labelKey.startsWith('runState'));assert.ok(RUN_PRESENTATION_TONES.includes(p.tone));assert.equal(p.completed,1);assert.equal(p.total,3);assert.equal(typeof p.actions.stop,'boolean');}
  assert.equal(projectRunPresentation(snapshot('failed')).tone,'error');assert.equal(projectRunPresentation(snapshot('completed')).tone,'success');assert.equal(projectRunPresentation(snapshot('frozen')).attentionKey,'frozenExplanation');
});

test('STEP-04 projection distinguishes active countdown from a frozen paused remainder',()=>{
  const active=projectRunPresentation(snapshot('waiting_delay'),{now:Date.parse('2026-08-24T04:00:06Z')});assert.equal(active.delayRemainingMs,4_000);assert.equal(active.delayRemainingSeconds,4);assert.equal(active.delayFrozen,false);
  const paused=snapshot('paused',{resumeState:'waiting_delay',suspensionReason:'user',execution:execution({remainingDelayMs:4_000})});const frozen=projectRunPresentation(paused,{now:Date.parse('2026-08-24T05:00:00Z')});assert.equal(frozen.delayRemainingMs,4_000);assert.equal(frozen.delayFrozen,true);assert.equal(frozen.actions.resume,true);
});

test('STEP-04 rebind/attention semantics are explicit and not encoded only through color',()=>{
  const run=snapshot('paused',{resumeState:'running',suspensionReason:'conversation_changed'});const p=projectRunPresentation(run);assert.equal(p.requiresRebind,true);assert.equal(p.needsAttention,true);assert.equal(p.tone,'attention');assert.equal(p.attentionKey,'conversationChangedExplanation');assert.equal(p.actions.rebind,true);assert.equal(p.actions.resume,false);assert.equal(p.labelKey,'runStatePaused');
});

test('STEP-04 Side Panel current-run card consumes shared projection including timing fields and semantic tones', async()=>{
  const app=await text('entrypoints/sidepanel/App.vue');const css=await text('entrypoints/sidepanel/style.css');const messages=await text('src/ui/messages.ts');
  assert.match(app,/projectRunPresentation/);assert.match(app,/currentProjection/);assert.match(app,/delayRemainingSeconds/);assert.match(app,/responseElapsedSeconds/);assert.match(app,/:data-tone="currentProjection\.tone"/);assert.doesNotMatch(app,/canPauseRun\(currentRun\.lifecycleState\)/);
  assert.match(css,/data-tone="attention"/);assert.match(css,/Text labels remain authoritative/);assert.match(messages,/responseTimingIndeterminate: 'No completion ETA'/);
});

test('STEP-04 schema evolution is logical-only and migration authority includes 3 -> 4',()=>{
  assert.equal(RUN_STATE_SCHEMA_VERSION,4);assert.equal(LOGICAL_MODEL_VERSION,4);assert.equal(PHYSICAL_DB_VERSION,1);assert.equal(EXPORT_FORMAT_VERSION,1);assert.ok(LOGICAL_MIGRATIONS.some(m=>m.fromVersion===3&&m.toVersion===4));
});

test('STEP-04 scope does not introduce toolbar popup/controller work or permission expansion', async()=>{
  const wxt=await text('wxt.config.ts');const pkg=JSON.parse(await text('package.json'));const roadmap=await text('agents/records/roadmaps/ROADMAP-0002--interaction-surface-and-runtime-hardening.md');
  assert.deepEqual([...wxt.matchAll(/'([^']+)'/g)].map(m=>m[1]).filter(v=>['sidePanel','storage','alarms','tabs'].includes(v)),['sidePanel','storage','alarms']);assert.equal(pkg.version,'0.0.20');assert.match(roadmap,/Toolbar badge rendering \(STEP-05\)/);assert.match(roadmap,/In-page controller \(STEP-06\/07\)/);
});
