import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ApplicationRepositories, LOGICAL_MIGRATIONS, LOGICAL_MODEL_VERSION, PERSISTENCE_STORES, migrateLogicalModel, PHYSICAL_DB_VERSION, EXPORT_FORMAT_VERSION } from '../src/persistence/index.ts';
import { ChatGptAdapter, conversationContextFromUrl } from '../src/chatgpt/index.ts';
import { DurableRunManager, DurableRunRepository, RepeatRunCoordinator } from '../src/runs/index.ts';
import { RUN_STATE_SCHEMA_VERSION } from '../src/runs/types.ts';

const text = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const clone = (value) => structuredClone(value);
const keyFor = (store, value) => store === 'metadata' ? value.key : value.id;
const conversation = (id) => ({ schemaVersion:1, kind:'conversation', conversationId:id, pathname:`/c/${id}` });
const newChat = () => ({ schemaVersion:1, kind:'new_chat', conversationId:null, pathname:'/' });
const unsupported = (path='/projects') => ({ schemaVersion:1, kind:'unsupported', conversationId:null, pathname:path });
const adapterSnapshot = (context, fingerprint='af2:11111111111111111111111111111111') => ({ schemaVersion:3, ready:true, busy:false, composerPresent:true, composerHasDraft:false, sendAvailable:true, continueAvailable:false, stopAvailable:false, assistantFingerprint:fingerprint, assistantMessageCount:1, pageAlert:null, conversation:context });

function matchesIndex(store, index, value, query) {
  if (query === undefined) return true;
  if (store === 'runEvents' && index === 'byRunId') return value.runId === query;
  if (store === 'runEvents' && index === 'byRunSequence') return Array.isArray(query) && value.runId === query[0] && value.sequence === query[1];
  return value[index === 'byUpdatedAt' ? 'updatedAt' : index === 'byOccurredAt' ? 'occurredAt' : 'id'] === query;
}
class MemoryDriver {
  state = new Map(PERSISTENCE_STORES.map((name) => [name, new Map()]));
  async transaction(stores, mode, work) {
    const before = new Map([...this.state].map(([name, values]) => [name, new Map([...values].map(([key, value]) => [key, clone(value)]))]));
    const port = { store: (name) => ({
      get: async (key) => { const value = this.state.get(name).get(key); return value === undefined ? undefined : clone(value); },
      getAll: async () => [...this.state.get(name).values()].map(clone),
      getAllByIndex: async (indexName, query) => [...this.state.get(name).values()].filter((value) => matchesIndex(name,indexName,value,query)).map(clone),
      put: async (value) => { if (mode !== 'readwrite') throw new Error('readonly'); this.state.get(name).set(keyFor(name,value), clone(value)); },
      delete: async (key) => { if (mode !== 'readwrite') throw new Error('readonly'); this.state.get(name).delete(key); },
    }) };
    try { return await work(port); } catch (error) { this.state = before; throw error; }
  }
  close() {}
}
function harness() {
  const repositories = new ApplicationRepositories(new MemoryDriver());
  let tick = 0;
  const base = Date.parse('2026-08-24T12:00:00+08:00');
  const repository = new DurableRunRepository(repositories, { now: () => new Date(base + tick++ * 1000).toISOString(), id: () => crypto.randomUUID() });
  return { repositories, manager:new DurableRunManager(repository), repository };
}
async function createStarted(manager, context, options={}) {
  let run = (await manager.create({ targetTabId:10, targetWindowId:2, commandId:crypto.randomUUID(), messageTemplate:'Continue {iteration}', totalIterations:options.totalIterations ?? 2, delaySeconds:5, autoContinue:true, autoScroll:false, preventDiscard:false, conversationContext:context })).snapshot;
  return (await manager.start(run.id, run.generation, crypto.randomUUID())).snapshot;
}
function tabSnapshot(context, lifecycleState='ready') {
  return { schemaVersion:2, revision:1, binding:null, lastTermination:null, targets:[{ schemaVersion:2, tabId:10, windowId:2, active:true, title:'ChatGPT', url:context.kind==='conversation'?`https://chatgpt.com/c/${context.conversationId}`:'https://chatgpt.com/', browserStatus:'complete', lifecycleState, autoDiscardable:false, contentConnected:true, adapterReady:true, adapterBusy:false, pageAlert:null, conversation:context }] };
}

class FakeClient {
  sends=[];
  async scrollToBottom() {}
  async send(tabId,message,baseline,expectedConversation){ this.sends.push({tabId,message,baseline,expectedConversation}); return {schemaVersion:3,status:'sent',assistantBaselineFingerprint:baseline}; }
}
class SequenceWaiter {
  constructor(idles, responses){this.idles=[...idles];this.responses=[...responses];}
  async waitUntilIdle(){ return this.idles.shift(); }
  async waitForResponse(_tab,_baseline,options){ const snapshot=this.responses.shift(); options.validateSnapshot?.(snapshot); return snapshot; }
}
class FakeScheduler {
  pending=new Map();
  async schedule(runId,generation,dueAt,callback){this.pending.set(runId,{generation,dueAt,callback});return 'short_timer';}
  async cancel(runId){this.pending.delete(runId);}
}
async function eventually(check, timeoutMs=1000){const deadline=Date.now()+timeoutMs;while(Date.now()<deadline){const result=await check();if(result)return result;await new Promise(r=>setTimeout(r,5));}throw new Error('condition not reached');}

function element(input={}) { return { visible:true, text:'', draft:'', disabled:false, attrs:{}, clicks:0, ...input }; }
class RouteChangingDom {
  map=new Map(); observers=new Set(); url='https://chatgpt.com/c/A';
  set(selector, values){this.map.set(selector,Array.isArray(values)?values:[values]);} queryOne(s){return this.map.get(s)?.[0]??null;} queryAll(s){return [...(this.map.get(s)??[])];}
  isVisible(h){return h.visible!==false;} readText(h){return h.text??'';} readComposer(h){return h.draft??'';} writeComposer(h,m){h.draft=m;this.url='https://chatgpt.com/c/B';this.trigger();}
  getAttribute(h,n){return h.attrs?.[n]??null;} isDisabled(h){return h.disabled===true;} click(h){h.clicks+=1;} observe(cb){this.observers.add(cb);return()=>this.observers.delete(cb);} scrollToBottom(){} now(){return 0;} isoNow(){return new Date(0).toISOString();} currentUrl(){return this.url;} trigger(){for(const cb of this.observers)cb();}
}

test('STEP-03 extracts semantic ChatGPT conversation contexts from URL authority', () => {
  assert.deepEqual(conversationContextFromUrl('https://chatgpt.com/'), newChat());
  assert.deepEqual(conversationContextFromUrl('https://chatgpt.com/c/abc-123?x=1'), conversation('abc-123'));
  assert.equal(conversationContextFromUrl('https://chatgpt.com/projects').kind, 'unsupported');
  assert.equal(conversationContextFromUrl('https://example.com/c/abc').kind, 'unsupported');
});

test('STEP-03 new-chat binding adopts exactly the first concrete conversation and then locks', async () => {
  const {manager}=harness();
  let run=await createStarted(manager,newChat());
  assert.equal(run.conversationBinding.kind,'pending_new_chat');
  run=(await manager.reconcileConversation(run.id,run.generation,crypto.randomUUID(),conversation('A'))).snapshot;
  assert.deepEqual(run.conversationBinding,{kind:'conversation',conversationId:'A'});
  assert.equal(run.lifecycleState,'running');
  run=(await manager.reconcileConversation(run.id,run.generation,crypto.randomUUID(),conversation('B'))).snapshot;
  assert.equal(run.lifecycleState,'paused');
  assert.equal(run.suspensionReason,'conversation_changed');
  assert.equal(run.conversationBinding.conversationId,'A');
});

test('STEP-03 same-tab A to B reconciliation suspends before another send and same-A reload remains valid', async () => {
  const {manager}=harness();
  const run=await createStarted(manager,conversation('A'));
  await manager.reconcileTabs(tabSnapshot(conversation('A')));
  assert.equal((await manager.get(run.id)).lifecycleState,'running');
  await manager.reconcileTabs(tabSnapshot(conversation('B')));
  const paused=await manager.get(run.id);
  assert.equal(paused.lifecycleState,'paused');
  assert.equal(paused.suspensionReason,'conversation_changed');
  assert.equal(paused.resumeState,'running');
});

test('STEP-03 explicit rebind clears conversation suspension, while waiting-response rebind must return to original conversation', async () => {
  const {manager}=harness();
  let run=await createStarted(manager,conversation('A'));
  run=(await manager.reconcileConversation(run.id,run.generation,crypto.randomUUID(),conversation('B'))).snapshot;
  run=(await manager.rebind(run.id,run.generation,crypto.randomUUID(),10,2,conversation('B'))).snapshot;
  assert.deepEqual(run.conversationBinding,{kind:'conversation',conversationId:'B'});
  assert.equal(run.suspensionReason,'user');
  run=(await manager.resume(run.id,run.generation,crypto.randomUUID())).snapshot;
  run=(await manager.prepareIteration(run.id,run.generation,crypto.randomUUID(),{iteration:1,message:'prepared',assistantBaselineFingerprint:'af2:11111111111111111111111111111111'})).snapshot;
  run=(await manager.suspendConversationChange(run.id,run.generation,crypto.randomUUID(),false)).snapshot;
  await assert.rejects(()=>manager.rebind(run.id,run.generation,crypto.randomUUID(),10,2,conversation('C')),/previously bound conversation/);
  const rebound=(await manager.rebind(run.id,run.generation,crypto.randomUUID(),10,2,conversation('B'))).snapshot;
  assert.equal(rebound.suspensionReason,'user');
});

test('STEP-03 browser-session reset rebind validates the previously bound conversation identity', async () => {
  const {manager}=harness();
  const run=await createStarted(manager,conversation('A'));
  const recovered=(await manager.recoverBrowserSession()).find(item=>item.id===run.id);
  assert.equal(recovered.suspensionReason,'browser_session_reset');
  await assert.rejects(()=>manager.rebind(recovered.id,recovered.generation,crypto.randomUUID(),77,5,conversation('B')),/previously bound/);
  const rebound=(await manager.rebind(recovered.id,recovered.generation,crypto.randomUUID(),77,5,conversation('A'))).snapshot;
  assert.equal(rebound.targetTabId,77);
  assert.equal(rebound.conversationBinding.conversationId,'A');
});

test('STEP-03 shared coordinator prevents a second Repeat send after same-tab conversation switch', async () => {
  const {manager}=harness();
  const client=new FakeClient();
  const waiter=new SequenceWaiter([adapterSnapshot(conversation('A')),adapterSnapshot(conversation('B'))],[adapterSnapshot(conversation('A'),'af2:22222222222222222222222222222222')]);
  const scheduler=new FakeScheduler();
  const run=await createStarted(manager,conversation('A'),{totalIterations:2});
  const coordinator=new RepeatRunCoordinator(manager,client,waiter,scheduler);
  coordinator.activate(run);
  await eventually(()=>scheduler.pending.has(run.id));
  assert.equal(client.sends.length,1);
  const pending=scheduler.pending.get(run.id); scheduler.pending.delete(run.id); await pending.callback();
  const paused=await eventually(async()=>{const value=await manager.get(run.id);return value?.suspensionReason==='conversation_changed'?value:false;});
  assert.equal(paused.lifecycleState,'paused');
  assert.equal(client.sends.length,1);
});

test('STEP-03 Queue mode inherits the same coordinator conversation guard with zero duplicate orchestration', async () => {
  const {manager}=harness();
  let run=(await manager.create({targetTabId:10,targetWindowId:2,commandId:crypto.randomUUID(),mode:'queue',queueId:'11111111-1111-4111-8111-111111111111',queueRevision:1,queueItems:[{id:'22222222-2222-4222-8222-222222222222',position:0,source:'literal',templateId:null,templateRevision:null,content:'one',delayAfterSeconds:null}],delaySeconds:5,autoContinue:true,autoScroll:false,preventDiscard:false,conversationContext:conversation('A')})).snapshot;
  run=(await manager.start(run.id,run.generation,crypto.randomUUID())).snapshot;
  const client=new FakeClient();
  const coordinator=new RepeatRunCoordinator(manager,client,new SequenceWaiter([adapterSnapshot(conversation('B'))],[]),new FakeScheduler());
  coordinator.activate(run);
  const paused=await eventually(async()=>{const value=await manager.get(run.id);return value?.suspensionReason==='conversation_changed'?value:false;});
  assert.equal(paused.execution.mode,'queue');
  assert.equal(client.sends.length,0);
});

test('STEP-03 content adapter rejects a route change between preparation and native send click', async () => {
  const dom=new RouteChangingDom(); const composer=element(); const send=element({attrs:{'data-testid':'send-button'}});
  dom.set('#prompt-textarea',composer); dom.set('button[data-testid="send-button"]',send); dom.set('button[data-testid="stop-button"]',[]); dom.set('button[aria-label]',[]); dom.set('button',[]); dom.set('[role="alert"]',[]); dom.set('[data-message-author-role="assistant"]',[element({text:'answer'})]);
  const adapter=new ChatGptAdapter(dom); const baseline=adapter.snapshot();
  await assert.rejects(()=>adapter.send('message',50,baseline.assistantFingerprint,baseline.conversation),/conversation changed/i);
  assert.equal(send.clicks,0);
});

test('STEP-03 v2 durable runs migrate fail-closed to unbound v3 conversation authority', async () => {
  const {repositories}=harness();
  const legacy={schemaVersion:2,id:'33333333-3333-4333-8333-333333333333',generation:1,lifecycleState:'running',targetTabId:10,targetWindowId:2,resumeState:null,suspensionReason:null,failure:null,execution:{mode:'repeat',messageTemplate:'Continue',totalIterations:1,completedIterations:0,activeIteration:null,activeMessage:null,activeDelayAfterSeconds:null,delaySeconds:5,autoContinue:true,autoScroll:false,preventDiscard:false,assistantBaselineFingerprint:null,nextDueAt:null},createdAt:'2026-08-24T04:00:00Z',updatedAt:'2026-08-24T04:00:00Z'};
  await repositories.write(['metadata','runs'],async tx=>{await tx.repository('metadata').put({key:'logicalModelVersion',value:2,updatedAt:legacy.updatedAt});await tx.repository('runs').put({schemaVersion:1,id:legacy.id,logicalVersion:2,state:legacy,createdAt:legacy.createdAt,updatedAt:legacy.updatedAt});});
  const result=await migrateLogicalModel(repositories,LOGICAL_MIGRATIONS,()=> '2026-08-24T04:01:00Z');
  assert.deepEqual(result,{fromVersion:2,toVersion:3,applied:1});
  const stored=await repositories.readonly(['runs'],async tx=>tx.repository('runs').get(legacy.id));
  assert.equal(stored.state.schemaVersion,RUN_STATE_SCHEMA_VERSION);
  assert.deepEqual(stored.state.conversationBinding,{kind:'unbound',conversationId:null});
  assert.equal(stored.logicalVersion,3);
});

test('STEP-03 remains permission/physical-format neutral and exposes explicit Side Panel conversation rebind UX', async () => {
  const [config,app,messages,manager,coordinator]=await Promise.all([text('wxt.config.ts'),text('entrypoints/sidepanel/App.vue'),text('src/ui/messages.ts'),text('src/runs/manager.ts'),text('src/runs/repeat-coordinator.ts')]);
  assert.equal(PHYSICAL_DB_VERSION,1); assert.equal(EXPORT_FORMAT_VERSION,1); assert.equal(LOGICAL_MODEL_VERSION,3); assert.equal(RUN_STATE_SCHEMA_VERSION,3);
  for(const permission of ['sidePanel','storage','alarms']) assert.match(config,new RegExp(`['\"]${permission}['\"]`));
  assert.doesNotMatch(config,/['\"]tabs['\"]/);
  assert.match(app,/conversation_changed/); assert.match(messages,/different ChatGPT conversation/); assert.match(manager,/conversation_suspended/); assert.match(coordinator,/expectedConversation|idle\.conversation/);
  assert.doesNotMatch(coordinator,/setInterval\s*\(/);
});
