import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  CHATGPT_ADAPTER_SCHEMA_VERSION,
  CHATGPT_SELECTOR_REGISTRY,
  ChatGptAdapter,
  ChatGptAdapterServer,
  ResponseCompletionTracker,
} from '../src/chatgpt/index.ts';
import { createRequest, requireMessageEnvelope } from '../src/core/index.ts';
import {
  ApplicationRepositories,
  LOGICAL_MIGRATIONS,
  LOGICAL_MODEL_VERSION,
  PERSISTENCE_STORES,
  migrateLogicalModel,
} from '../src/persistence/index.ts';
import {
  DurableRunManager,
  DurableRunRepository,
  RUN_STATE_SCHEMA_VERSION,
  TERMINAL_COMPACTED_MESSAGE,
  requireRunSnapshot,
} from '../src/runs/index.ts';
import { RunHistoryService } from '../src/history/index.ts';
import { NamespacedChromeStorage } from '../src/persistence/chrome-storage.ts';
import { SettingsService } from '../src/settings/index.ts';
import { PortabilityService, requirePortableEnvelope } from '../src/portability/index.ts';
import { projectRunPresentation, projectToolbarStatus } from '../src/presentation/index.ts';

const clone = (value) => structuredClone(value);
const keyFor = (store, value) => store === 'metadata' ? value.key : value.id;
function matchesIndex(store,index,value,query){if(query===undefined)return true;if(store==='queueItems'&&index==='byQueueId')return value.queueId===query;if(store==='runEvents'&&index==='byRunId')return value.runId===query;if(store==='runEvents'&&index==='byRunSequence')return Array.isArray(query)&&value.runId===query[0]&&value.sequence===query[1];return value[index==='byUpdatedAt'?'updatedAt':index==='byOccurredAt'?'occurredAt':'id']===query;}
class MemoryDriver {
  state = new Map(PERSISTENCE_STORES.map((name) => [name, new Map()]));
  async transaction(stores, mode, work) {
    const before = new Map([...this.state].map(([name, values]) => [name, new Map([...values].map(([key,value]) => [key,clone(value)]))]));
    const port={store:(name)=>({
      get:async key=>{const value=this.state.get(name).get(key);return value===undefined?undefined:clone(value)},
      getAll:async()=>[...this.state.get(name).values()].map(clone),
      getAllByIndex:async(index,query)=>[...this.state.get(name).values()].filter(value=>matchesIndex(name,index,value,query)).map(clone),
      put:async value=>{if(mode!=='readwrite')throw Error('readonly');this.state.get(name).set(keyFor(name,value),clone(value))},
      delete:async key=>{if(mode!=='readwrite')throw Error('readonly');this.state.get(name).delete(key)},
    })};
    try{return await work(port)}catch(error){this.state=before;throw error}
  }
  close(){}
}
class MemoryStorageArea { values={}; async get(keys){if(keys==null)return clone(this.values);const list=Array.isArray(keys)?keys:[keys];return Object.fromEntries(list.filter(k=>k in this.values).map(k=>[k,clone(this.values[k])]))} async set(items){Object.assign(this.values,clone(items))} async remove(keys){for(const k of Array.isArray(keys)?keys:[keys])delete this.values[k]} }

function element(input={}) { return {visible:true,text:'',draft:'',disabled:false,attrs:{},clicks:0,...input}; }
class FakeDom {
  map=new Map(); observers=new Set(); clock=1_000; url='https://chatgpt.com/c/A'; scrolled=false;
  set(selector,values){this.map.set(selector,Array.isArray(values)?values:[values]);}
  queryOne(selector){return this.map.get(selector)?.[0]??null;}
  queryAll(selector){return [...(this.map.get(selector)??[])];}
  isVisible(handle){return handle.visible!==false;}
  readText(handle){return handle.text??'';}
  readComposer(handle){return handle.draft??'';}
  writeComposer(handle,message){handle.draft=message;this.trigger();}
  getAttribute(handle,name){return handle.attrs?.[name]??null;}
  isDisabled(handle){return handle.disabled===true||handle.attrs?.['aria-disabled']==='true';}
  click(handle){handle.clicks+=1;}
  observe(callback){this.observers.add(callback);return()=>this.observers.delete(callback);}
  scrollToBottom(){this.scrolled=true;}
  now(){return this.clock;}
  isoNow(){return new Date(this.clock).toISOString();}
  currentUrl(){return this.url;}
  trigger(){for(const observer of [...this.observers])observer();}
}
function adapterFixture({send=true,url='https://chatgpt.com/c/A'}={}) {
  const dom=new FakeDom(); dom.url=url;
  const composer=element({attrs:{contenteditable:'true'}});
  const sendButton=element({attrs:{'data-testid':'send-button'}});
  dom.set('#prompt-textarea[contenteditable="true"]',composer);
  dom.set('#prompt-textarea',[composer]);
  dom.set('textarea[name="prompt-textarea"]',[element({visible:false})]);
  dom.set('button[data-testid="send-button"]',send?[sendButton]:[]);
  dom.set('button[data-testid="stop-button"]',[]);
  dom.set('button[aria-label]',[]);
  dom.set('button',[]);
  dom.set('[data-message-author-role="assistant"]',[]);
  dom.set('[role="alert"]',[]);
  return {dom,composer,sendButton,adapter:new ChatGptAdapter(dom,{streamObservationMinIntervalMs:20})};
}

function repositoriesHarness(){return new ApplicationRepositories(new MemoryDriver());}
function managerHarness(repositories=repositoriesHarness()){
  let tick=0;
  const manager=new DurableRunManager(new DurableRunRepository(repositories,{now:()=>new Date(Date.parse('2026-08-24T05:40:00Z')+tick++*1000).toISOString(),id:()=>crypto.randomUUID()}));
  return {repositories,manager};
}
async function stoppedRepeat(manager,secret='RUN SECRET'){
  let run=(await manager.create({targetTabId:7,targetWindowId:1,commandId:crypto.randomUUID(),messageTemplate:secret,totalIterations:2,delaySeconds:5,autoContinue:true,autoScroll:false,preventDiscard:true})).snapshot;
  return (await manager.stop(run.id,run.generation,crypto.randomUUID())).snapshot;
}

function legacyTerminal(secret='LEGACY SECRET'){
  return {schemaVersion:1,id:'11111111-1111-4111-8111-111111111111',generation:2,lifecycleState:'stopped',targetTabId:7,targetWindowId:1,resumeState:null,suspensionReason:null,failure:null,execution:{mode:'repeat',messageTemplate:secret,totalIterations:2,completedIterations:0,activeIteration:null,activeMessage:null,activeDelayAfterSeconds:null,delaySeconds:7,autoContinue:true,autoScroll:false,preventDiscard:true,assistantBaselineSignature:null,nextDueAt:null},createdAt:'2026-08-24T05:00:00Z',updatedAt:'2026-08-24T05:01:00Z'};
}

function portabilityHarness(){
  const repositories=repositoriesHarness();const area=new MemoryStorageArea();let tick=0;const now=()=>new Date(Date.parse('2026-08-24T06:00:00Z')+tick++*1000).toISOString();
  const settings=new SettingsService(new NamespacedChromeStorage(area,'sync'),now);
  const portability=new PortabilityService(repositories,settings,'0.0.24',now);
  return {repositories,settings,portability};
}

test('STEP-08 selector registry separates structural anchors, transient capabilities, and diagnostics; idle missing Send remains healthy', () => {
  assert.equal(CHATGPT_SELECTOR_REGISTRY.composer.role,'structural');
  assert.deepEqual(CHATGPT_SELECTOR_REGISTRY.composer.candidates,['#prompt-textarea[contenteditable="true"]']);
  assert.equal(CHATGPT_SELECTOR_REGISTRY.send.role,'capability');
  assert.equal(CHATGPT_SELECTOR_REGISTRY.voice.role,'capability');
  assert.equal(CHATGPT_SELECTOR_REGISTRY.pageAlert.role,'diagnostic');
  const {adapter}=adapterFixture({send:false});
  const snapshot=adapter.snapshot();
  assert.equal(snapshot.schemaVersion,CHATGPT_ADAPTER_SCHEMA_VERSION);
  assert.equal(snapshot.ready,true);
  assert.equal(snapshot.sendAvailable,false);
  assert.deepEqual(snapshot.degradationCodes,[]);
  const diagnostics=adapter.diagnostics();
  assert.equal(diagnostics.status,'ready');
  assert.equal(diagnostics.capabilities.find(x=>x.key==='send').status,'absent');
  assert.equal(diagnostics.capabilities.find(x=>x.key==='voice').status,'absent');
});

test('STEP-08 visible editable composer is mandatory; hidden fallback is ignored and ambiguity fails closed', async () => {
  const hiddenOnly=adapterFixture();
  hiddenOnly.dom.set('#prompt-textarea[contenteditable="true"]',[]);
  hiddenOnly.dom.set('#prompt-textarea',[]);
  const snapshot=hiddenOnly.adapter.snapshot();
  assert.equal(snapshot.ready,false);
  assert.ok(snapshot.degradationCodes.includes('composer_missing'));
  await assert.rejects(()=>hiddenOnly.adapter.send('never'),/Visible editable ChatGPT composer was not found/);

  const ambiguous=adapterFixture();
  ambiguous.dom.set('#prompt-textarea[contenteditable="true"]',[element(),element()]);
  const diagnostics=ambiguous.adapter.diagnostics();
  assert.ok(diagnostics.reasonCodes.includes('composer_ambiguous'));
  assert.equal(diagnostics.capabilities.find(x=>x.key==='composer').status,'ambiguous');
  await assert.rejects(()=>ambiguous.adapter.send('never'),/Multiple visible editable ChatGPT composers/);
});

test('STEP-08 unsupported route, drift hint, page alert, rate-limit and command mismatch expose explicit reason codes', async () => {
  const unsupported=adapterFixture({url:'https://chatgpt.com/projects'});
  assert.ok(unsupported.adapter.snapshot().degradationCodes.includes('unsupported_route'));
  const server=new ChatGptAdapterServer(unsupported.adapter);
  const response=requireMessageEnvelope(await server.handle(createRequest({requestSequence:1,intent:'command',source:'background',target:'content',operation:'chatgpt.send',payload:{message:'no'}})));
  assert.equal(response.outcome.ok,false);
  assert.equal(!response.outcome.ok&&response.outcome.error.details.reasonCode,'unsupported_route');

  const drift=adapterFixture();drift.dom.set('#prompt-textarea[contenteditable="true"]',[]);drift.dom.set('#prompt-textarea',[element()]);
  assert.deepEqual(drift.adapter.snapshot().degradationCodes.slice(0,2),['composer_missing','adapter_drift']);

  const limited=adapterFixture();limited.dom.set('[role="alert"]',[element({text:'Too many requests. Try again later.'})]);
  assert.ok(limited.adapter.snapshot().degradationCodes.includes('likely_rate_limited'));
  await assert.rejects(()=>limited.adapter.send('blocked'),/rate limited/i);
});

test('STEP-08 streaming assistant mutations are event-driven but bounded instead of update-per-text-mutation', async () => {
  const {dom,adapter}=adapterFixture();
  const stop=element({attrs:{'data-testid':'stop-button'}}); const assistant=element({text:'start'});
  const observations=[]; const unsubscribe=adapter.observe(value=>observations.push(value));
  dom.set('button[data-testid="stop-button"]',[stop]);dom.set('[data-message-author-role="assistant"]',[assistant]);dom.clock+=1;dom.trigger();await Promise.resolve();
  assert.equal(observations.length,2,'response start is a semantic immediate update');
  for(let i=0;i<12;i++){assistant.text=`stream ${i}`;dom.clock+=1;dom.trigger();await Promise.resolve();}
  assert.equal(observations.length,2,'stream text is coalesced within the bounded window');
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(observations.length,3);
  assert.equal(observations.at(-1).reason,'coalesced_stream');
  dom.set('button[data-testid="stop-button"]',[]);dom.clock+=30;dom.trigger();await Promise.resolve();
  assert.equal(observations.length,4,'busy-to-idle completion is immediate');
  unsubscribe();
});

test('STEP-08 response completion and Continue semantics remain deadline-bounded without polling ownership', () => {
  const baseline=adapterFixture().adapter.snapshot();
  const tracker=new ResponseCompletionTracker(baseline.assistantFingerprint,1_000,{responseStartTimeoutMs:120_000,responseStableMs:3_500});
  assert.equal(tracker.observe(baseline,1_000).state,'waiting_start');
  const active={...baseline,busy:true,assistantFingerprint:'af2:11111111111111111111111111111111',assistantMessageCount:1};
  assert.equal(tracker.observe(active,2_000).state,'active');
  assert.equal(tracker.observe({...active,continueAvailable:true},2_100).state,'continue_available');
  const quiet={...active,busy:false};
  assert.equal(tracker.observe(quiet,5_600).state,'stable');
});

test('STEP-08 Repeat and Queue terminal transitions compact prompt-bearing and transient execution content', async () => {
  const {manager}=managerHarness();
  const repeat=await stoppedRepeat(manager,'REPEAT SECRET PROMPT');
  assert.equal(repeat.schemaVersion,RUN_STATE_SCHEMA_VERSION);
  assert.equal(repeat.execution.messageTemplate,TERMINAL_COMPACTED_MESSAGE);
  assert.equal(JSON.stringify(repeat).includes('REPEAT SECRET PROMPT'),false);
  assert.equal(repeat.execution.activeMessage,null);
  assert.equal(repeat.execution.responseStartedAt,null);

  let queue=(await manager.create({targetTabId:7,targetWindowId:1,commandId:crypto.randomUUID(),mode:'queue',queueId:'22222222-2222-4222-8222-222222222222',queueRevision:1,queueItems:[{id:'33333333-3333-4333-8333-333333333333',position:0,source:'literal',templateId:null,templateRevision:null,content:'QUEUE SECRET PROMPT',delayAfterSeconds:null}],delaySeconds:5,autoContinue:true,autoScroll:false,preventDiscard:false})).snapshot;
  queue=(await manager.stop(queue.id,queue.generation,crypto.randomUUID())).snapshot;
  assert.equal(queue.execution.items[0].content,TERMINAL_COMPACTED_MESSAGE);
  assert.equal(JSON.stringify(queue).includes('QUEUE SECRET PROMPT'),false);
});

test('STEP-08 history, run projection and toolbar projection remain prompt-free after terminal compaction', async () => {
  const {repositories,manager}=managerHarness(); const run=await stoppedRepeat(manager,'HISTORY SECRET PROMPT');
  const history=await new RunHistoryService(repositories).list(100);
  const runProjection=projectRunPresentation(run,{now:Date.parse(run.updatedAt)});
  const toolbar=projectToolbarStatus([run],[],Date.parse(run.updatedAt));
  const serialized=JSON.stringify({history,runProjection,toolbar});
  assert.equal(serialized.includes('HISTORY SECRET PROMPT'),false);
  assert.equal(serialized.includes('activeMessage'),false);
});

test('STEP-08 full backup stays format v1 but exports compact terminal state; configuration export contains no run history', async () => {
  const h=portabilityHarness(); const {manager}=managerHarness(h.repositories); await stoppedRepeat(manager,'BACKUP RUN SECRET');
  const configuration=await h.portability.export('configuration');
  assert.equal(configuration.formatVersion,1); assert.equal('history' in configuration.data,false); assert.equal(JSON.stringify(configuration).includes('BACKUP RUN SECRET'),false);
  const backup=await h.portability.export('full_backup');
  assert.equal(backup.formatVersion,1); assert.equal(backup.data.history.length,1);
  assert.equal(JSON.stringify(backup).includes('BACKUP RUN SECRET'),false);
  assert.equal(backup.data.history[0].run.execution.messageTemplate,TERMINAL_COMPACTED_MESSAGE);
  const preview=await h.portability.preview(backup,'merge');
  assert.ok(preview.warnings.some(value=>/compacted/i.test(value)));
});

test('STEP-08 legacy v0.0.16-era terminal run/full-backup state normalizes compactly and unknown schemas fail explicitly', async () => {
  const normalized=requireRunSnapshot(legacyTerminal('OLD TERMINAL SECRET'));
  assert.equal(normalized.schemaVersion,RUN_STATE_SCHEMA_VERSION);
  assert.equal(normalized.execution.messageTemplate,TERMINAL_COMPACTED_MESSAGE);
  assert.equal(JSON.stringify(normalized).includes('OLD TERMINAL SECRET'),false);
  assert.throws(()=>requireRunSnapshot({...legacyTerminal(),schemaVersion:99}),/unsupported run state schema/);

  const h=portabilityHarness();const {manager}=managerHarness(h.repositories);await stoppedRepeat(manager,'CURRENT SECRET');const current=await h.portability.export('full_backup');
  const legacy=clone(current);legacy.appVersion='0.0.16';legacy.data.history[0].run=legacyTerminal('LEGACY BACKUP SECRET');
  const imported=requirePortableEnvelope(legacy);
  assert.equal(imported.data.history[0].run.schemaVersion,RUN_STATE_SCHEMA_VERSION);
  assert.equal(JSON.stringify(imported).includes('LEGACY BACKUP SECRET'),false);
});

test('STEP-08 logical migration 4→5 compacts terminal content but preserves active recovery content', async () => {
  const repositories=repositoriesHarness(); const {manager}=managerHarness(repositories);
  const terminalSource=await stoppedRepeat(manager,'TERMINAL MIGRATION SECRET');
  let active=(await manager.create({targetTabId:8,targetWindowId:1,commandId:crypto.randomUUID(),messageTemplate:'ACTIVE RECOVERY SECRET',totalIterations:1,delaySeconds:5,autoContinue:true,autoScroll:false,preventDiscard:true})).snapshot;
  const terminalLegacy={...terminalSource,schemaVersion:4,execution:{...terminalSource.execution,messageTemplate:'TERMINAL MIGRATION SECRET'}};
  const activeLegacy={...active,schemaVersion:4};
  await repositories.write(['metadata','runs'],async tx=>{
    const runs=tx.repository('runs'); await tx.repository('metadata').put({key:'logicalModelVersion',value:4,updatedAt:active.updatedAt});
    await runs.put({schemaVersion:1,id:terminalLegacy.id,logicalVersion:4,state:terminalLegacy,createdAt:terminalLegacy.createdAt,updatedAt:terminalLegacy.updatedAt});
    await runs.put({schemaVersion:1,id:activeLegacy.id,logicalVersion:4,state:activeLegacy,createdAt:activeLegacy.createdAt,updatedAt:activeLegacy.updatedAt});
  });
  const result=await migrateLogicalModel(repositories,LOGICAL_MIGRATIONS,()=> '2026-08-24T06:30:00Z');
  assert.deepEqual(result,{fromVersion:4,toVersion:LOGICAL_MODEL_VERSION,applied:1});
  const rows=await repositories.readonly(['runs'],async tx=>await tx.repository('runs').list());
  const terminal=rows.find(row=>row.id===terminalLegacy.id); const activeRow=rows.find(row=>row.id===activeLegacy.id);
  assert.equal(terminal.logicalVersion,RUN_STATE_SCHEMA_VERSION);assert.equal(JSON.stringify(terminal).includes('TERMINAL MIGRATION SECRET'),false);
  assert.equal(activeRow.logicalVersion,RUN_STATE_SCHEMA_VERSION);assert.equal(activeRow.state.execution.messageTemplate,'ACTIVE RECOVERY SECRET');
});

test('STEP-08 source boundaries retain event-driven execution, current permissions, and no prompt-bearing diagnostics/controller/action payloads', async () => {
  const [adapter,content,config,diagnostics,inpage,toolbar,versions]=await Promise.all([
    readFile(new URL('../src/chatgpt/adapter.ts',import.meta.url),'utf8'),readFile(new URL('../entrypoints/chatgpt.content.ts',import.meta.url),'utf8'),readFile(new URL('../wxt.config.ts',import.meta.url),'utf8'),readFile(new URL('../src/diagnostics/service.ts',import.meta.url),'utf8'),readFile(new URL('../src/presentation/inpage-controller.ts',import.meta.url),'utf8'),readFile(new URL('../src/presentation/toolbar-status.ts',import.meta.url),'utf8'),readFile(new URL('../src/persistence/versions.ts',import.meta.url),'utf8')]);
  assert.doesNotMatch(adapter,/setInterval|pollMs|400\s*ms/);assert.match(adapter,/queueMicrotask/);assert.match(adapter,/coalesced_stream/);assert.match(content,/adapter\.observe/);
  for(const permission of ['sidePanel','storage','alarms'])assert.match(config,new RegExp(`['"]${permission}['"]`));assert.doesNotMatch(config,/['"]tabs['"]/);
  assert.match(versions,/PHYSICAL_DB_VERSION = 1/);assert.match(versions,/LOGICAL_MODEL_VERSION = 5/);assert.match(versions,/EXPORT_FORMAT_VERSION = 1/);
  for(const source of [diagnostics,inpage,toolbar])assert.doesNotMatch(source,/composerDraft|assistantSignature/);
});
