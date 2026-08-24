import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRequest, requireMessageEnvelope } from '../src/core/index.ts';
import { ApplicationRepositories, PERSISTENCE_STORES } from '../src/persistence/index.ts';
import {
  advanceInPageControllerTemporal,
  INPAGE_CONTROLLER_OPERATIONS,
  nextInPageTemporalRefreshDelay,
  projectInPageControllerStatus,
  projectRunPresentation,
} from '../src/presentation/index.ts';
import { DurableRunManager, DurableRunRepository, requireRunSnapshot } from '../src/runs/index.ts';
import { BackgroundMessageRouter, InPageControllerRuntimeServer } from '../src/runtime/index.ts';

const text = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const clone=(value)=>structuredClone(value);
const keyFor=(store,value)=>store==='metadata'?value.key:value.id;
function matchesIndex(store,index,value,query){if(query===undefined)return true;if(store==='runEvents'&&index==='byRunId')return value.runId===query;return true;}
class MemoryDriver { state=new Map(PERSISTENCE_STORES.map(name=>[name,new Map()])); async transaction(stores,mode,work){const before=new Map([...this.state].map(([n,v])=>[n,new Map([...v].map(([k,x])=>[k,clone(x)]))]));const port={store:(name)=>({get:async(k)=>{const v=this.state.get(name).get(k);return v===undefined?undefined:clone(v);},getAll:async()=>[...this.state.get(name).values()].map(clone),getAllByIndex:async(i,q)=>[...this.state.get(name).values()].filter(v=>matchesIndex(name,i,v,q)).map(clone),put:async(v)=>{if(mode!=='readwrite')throw Error('readonly');this.state.get(name).set(keyFor(name,v),clone(v));},delete:async(k)=>{if(mode!=='readwrite')throw Error('readonly');this.state.get(name).delete(k);}})};try{return await work(port);}catch(e){this.state=before;throw e;}} close(){} }
class MemoryStorage { value=undefined; async get(){return this.value===undefined?undefined:clone(this.value);} async set(_key,value){this.value=clone(value);} async remove(){this.value=undefined;} }
function harness(){const repositories=new ApplicationRepositories(new MemoryDriver());let nowMs=Date.parse('2026-08-24T05:00:00Z');const repository=new DurableRunRepository(repositories,{now:()=>new Date(nowMs).toISOString(),id:()=>crypto.randomUUID()});return{manager:new DurableRunManager(repository),advance:(ms)=>{nowMs+=ms;},now:()=>nowMs};}
const conversation=(id='A')=>({schemaVersion:3,kind:'conversation',conversationId:id,pathname:`/c/${id}`});
const target=(tabId=17,windowId=3,id='A')=>({schemaVersion:2,tabId,windowId,active:true,title:'Chat',url:`https://chatgpt.com/c/${id}`,browserStatus:'complete',lifecycleState:'ready',autoDiscardable:true,contentConnected:true,adapterReady:true,adapterBusy:false,pageAlert:null,conversation:conversation(id)});
const caller=(tabId=17,windowId=3)=>({kind:'chatgpt_content',extensionId:'ext',tabId,windowId,frameId:0,documentId:'doc',origin:'https://chatgpt.com',url:'https://chatgpt.com/c/A'});
function request(operation,intent='query',payload={}){return createRequest({requestSequence:1,intent,source:'content',target:'background',operation,payload});}
async function createRunning(manager,tabId=17,windowId=3,id='A',message='PRIVATE MESSAGE') {let run=(await manager.create({targetTabId:tabId,targetWindowId:windowId,commandId:crypto.randomUUID(),messageTemplate:message,totalIterations:3,delaySeconds:10,autoContinue:true,autoScroll:true,preventDiscard:false,conversationContext:conversation(id)})).snapshot;return (await manager.start(run.id,run.generation,crypto.randomUUID())).snapshot;}
function serverFor(manager,{currentTarget=target(),storage=new MemoryStorage(),execution={activate(){},async cancel(){}},opened=[]}={}){return{storage,opened,server:new InPageControllerRuntimeServer(async()=>manager,async()=>execution,async(tabId,windowId)=>currentTarget?.tabId===tabId&&currentTarget?.windowId===windowId?currentTarget:undefined,async(tabId,windowId)=>{opened.push([tabId,windowId]);},storage)};}

function timingRun(){return requireRunSnapshot({schemaVersion:4,id:crypto.randomUUID(),generation:3,lifecycleState:'waiting_delay',targetTabId:17,targetWindowId:3,conversationBinding:{kind:'conversation',conversationId:'A'},resumeState:null,suspensionReason:null,failure:null,execution:{mode:'repeat',messageTemplate:'SECRET',totalIterations:5,completedIterations:2,activeIteration:null,activeMessage:null,activeDelayAfterSeconds:null,delaySeconds:10,autoContinue:true,autoScroll:true,preventDiscard:false,assistantBaselineFingerprint:null,responseStartedAt:null,nextDueAt:'2026-08-24T05:00:06.000Z',remainingDelayMs:null},createdAt:'2026-08-24T05:00:00.000Z',updatedAt:'2026-08-24T05:00:00.000Z'});}

test('STEP-06 local status exposes projection/control identity only and never prompt-bearing run state',()=>{
  const status=projectInPageControllerStatus([timingRun()],target(),true,Date.parse('2026-08-24T05:00:00Z'));
  assert.equal(status.state,'single');assert.equal(status.runId!==null,true);assert.equal(status.generation,3);assert.equal(status.projection.delayRemainingSeconds,6);assert.equal(status.projection.currentIteration,3);assert.deepEqual(status.projection,projectRunPresentation(timingRun(),{now:Date.parse('2026-08-24T05:00:00Z'),target:target()}));
  const serialized=JSON.stringify(status);assert.equal(serialized.includes('SECRET'),false);assert.equal(serialized.includes('messageTemplate'),false);assert.equal(serialized.includes('activeMessage'),false);
});

test('STEP-06 temporal display advances locally from shared projection without an execution or ChatGPT polling loop',()=>{
  const base=projectInPageControllerStatus([timingRun()],target(),true,Date.parse('2026-08-24T05:00:00Z'));
  const advanced=advanceInPageControllerTemporal(base,Date.parse('2026-08-24T05:00:02.250Z'));
  assert.equal(advanced.projection.delayRemainingMs,3750);assert.equal(advanced.projection.delayRemainingSeconds,4);assert.ok(nextInPageTemporalRefreshDelay(advanced,Date.parse('2026-08-24T05:00:02.250Z'))>=25);
});

test('STEP-06 multiple nonterminal runs on one tab fail closed to read-only ambiguity',()=>{
  const a=timingRun();const b=requireRunSnapshot({...structuredClone(a),id:crypto.randomUUID(),generation:4});
  const status=projectInPageControllerStatus([a,b],target(),false,Date.parse('2026-08-24T05:00:00Z'));
  assert.equal(status.state,'multiple');assert.equal(status.activeRunCount,2);assert.equal(status.runId,null);assert.equal(status.generation,null);assert.equal(status.projection,null);
});

test('STEP-06 Pause Resume Stop use durable manager generation fencing and the shared execution controller',async()=>{
  const h=harness();let run=await createRunning(h.manager);const calls=[];const runtime=serverFor(h.manager,{execution:{activate(snapshot){calls.push(['activate',snapshot.id,snapshot.lifecycleState]);},async cancel(id){calls.push(['cancel',id]);}}}).server;
  let response=requireMessageEnvelope(await runtime.handle(request(INPAGE_CONTROLLER_OPERATIONS.pause,'command',{runId:run.id,expectedGeneration:run.generation}),caller()));assert.equal(response.outcome.ok,true);assert.equal(response.outcome.value.projection.lifecycleState,'paused');assert.deepEqual(calls[0],['cancel',run.id]);
  let persisted=await h.manager.get(run.id);response=requireMessageEnvelope(await runtime.handle(request(INPAGE_CONTROLLER_OPERATIONS.resume,'command',{runId:run.id,expectedGeneration:persisted.generation}),caller()));assert.equal(response.outcome.ok,true);assert.equal(response.outcome.value.projection.lifecycleState,'running');assert.equal(calls.at(-1)[0],'activate');
  persisted=await h.manager.get(run.id);response=requireMessageEnvelope(await runtime.handle(request(INPAGE_CONTROLLER_OPERATIONS.stop,'command',{runId:run.id,expectedGeneration:persisted.generation}),caller()));assert.equal(response.outcome.ok,true);assert.equal(response.outcome.value.state,'idle');assert.equal((await h.manager.get(run.id)).lifecycleState,'stopped');assert.equal(calls.at(-1)[0],'cancel');
});


test('STEP-06 forged Side Panel source metadata from content cannot enter in-page controller authority',async()=>{
  const extensionId='iterator-extension';let inpageCalls=0;const stub={async handle(){return {unexpected:true};}};const inpage={async handle(){inpageCalls+=1;return {unexpected:true};}};
  const router=new BackgroundMessageRouter(stub,stub,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,extensionId,inpage);
  const sender={id:extensionId,tab:{id:17,windowId:3,url:'https://chatgpt.com/c/A'},frameId:0,origin:'https://chatgpt.com',url:'https://chatgpt.com/c/A'};
  const forged=createRequest({requestSequence:1,intent:'command',source:'sidepanel',target:'background',operation:INPAGE_CONTROLLER_OPERATIONS.stop,payload:{runId:crypto.randomUUID(),expectedGeneration:1}});
  const response=requireMessageEnvelope(await router.handle(forged,sender));assert.equal(response.outcome.ok,false);assert.equal(response.outcome.error.code,'invalid_message');assert.equal(inpageCalls,0);
});

test('STEP-06 verified content caller cannot operate another tab run',async()=>{
  const h=harness();const foreign=await createRunning(h.manager,99,8,'B');const runtime=serverFor(h.manager).server;
  const response=requireMessageEnvelope(await runtime.handle(request(INPAGE_CONTROLLER_OPERATIONS.stop,'command',{runId:foreign.id,expectedGeneration:foreign.generation}),caller(17,3)));
  assert.equal(response.outcome.ok,false);assert.equal(response.outcome.error.code,'invalid_message');assert.equal((await h.manager.get(foreign.id)).lifecycleState,'running');
});

test('STEP-06 Resume is conversation-guarded while Stop remains safely available on the bound tab',async()=>{
  const h=harness();let run=await createRunning(h.manager);run=(await h.manager.pause(run.id,run.generation,crypto.randomUUID())).snapshot;
  const mismatch=serverFor(h.manager,{currentTarget:target(17,3,'B')}).server;
  let response=requireMessageEnvelope(await mismatch.handle(request(INPAGE_CONTROLLER_OPERATIONS.resume,'command',{runId:run.id,expectedGeneration:run.generation}),caller()));assert.equal(response.outcome.ok,false);assert.equal(response.outcome.error.code,'stale_request');
  run=await h.manager.get(run.id);assert.equal(run.lifecycleState,'paused');assert.equal(run.suspensionReason,'conversation_changed');
  response=requireMessageEnvelope(await mismatch.handle(request(INPAGE_CONTROLLER_OPERATIONS.stop,'command',{runId:run.id,expectedGeneration:run.generation}),caller()));assert.equal(response.outcome.ok,true);assert.equal((await h.manager.get(run.id)).lifecycleState,'stopped');
});

test('STEP-06 collapse preference is background-owned and Open Side Panel uses the verified local tab',async()=>{
  const h=harness();const run=await createRunning(h.manager);const fixture=serverFor(h.manager);let response=requireMessageEnvelope(await fixture.server.handle(request(INPAGE_CONTROLLER_OPERATIONS.setCollapsed,'command',{collapsed:false}),caller()));assert.equal(response.outcome.ok,true);assert.equal(response.outcome.value.collapsed,false);assert.equal(fixture.storage.value.schemaVersion,1);assert.equal(fixture.storage.value.collapsed,false);assert.equal(typeof fixture.storage.value.dock,'string');
  response=requireMessageEnvelope(await fixture.server.handle(request(INPAGE_CONTROLLER_OPERATIONS.openPanel,'command',{}),caller()));assert.equal(response.outcome.ok,true);assert.deepEqual(fixture.opened,[[17,3]]);assert.equal((await h.manager.get(run.id)).lifecycleState,'running');
});

test('STEP-06 content surface remains Shadow-DOM isolated, accessible, secondary, and prompt-free after later placement evolution',async()=>{
  const content=await text('entrypoints/chatgpt.content.ts');const dom=await text('src/presentation/inpage-controller-dom.ts');
  assert.match(dom,/document\.documentElement\.append\(this\.#host\)/);assert.match(dom,/attachShadow\(\{ mode:'closed' \}\)/);assert.match(dom,/role','status'/);assert.match(dom,/aria-live','polite'/);assert.match(dom,/aria-expanded/);assert.match(dom,/event\.isTrusted/);assert.match(dom,/keyboard\.key !== 'Escape'/);assert.match(dom,/min-height:44px/);
  assert.match(content,/InPageControllerClient/);assert.match(content,/isInPageControllerInvalidation/);assert.doesNotMatch(content,/setInterval\(/);assert.match(dom,/event\.isTrusted/);assert.doesNotMatch(dom,/messageTemplate|activeMessage|history/i);
});

test('STEP-06 scope preserves Side Panel primary authority, permissions/schema, localization, and no toolbar popup',async()=>{
  const background=await text('entrypoints/background.ts');const router=await text('src/runtime/message-router.ts');const wxt=await text('wxt.config.ts');const pkg=JSON.parse(await text('package.json'));const messages=await text('src/ui/messages.ts');const locale=JSON.parse(await text('public/_locales/en/messages.json'));const roadmap=await text('agents/records/roadmaps/ROADMAP-0002--interaction-surface-and-runtime-hardening.md');
  assert.match(background,/sidePanel\.open\(\{ tabId \}\)/);assert.match(background,/openPanelOnActionClick: true/);assert.match(router,/INPAGE_OPERATIONS/);assert.match(router,/CONTENT_ENABLED_OPERATIONS/);assert.doesNotMatch(wxt,/default_popup/);assert.deepEqual([...wxt.matchAll(/'([^']+)'/g)].map(m=>m[1]).filter(v=>['sidePanel','storage','alarms','tabs'].includes(v)),['sidePanel','storage','alarms']);assert.ok(Number(pkg.version.split('.')[2])>=22);
  for(const key of ['inPageController','expandInPageController','collapseInPageController','inPageNoActiveRun','inPageMultipleRuns','openSidePanel']){assert.match(messages,new RegExp(`${key}:`));assert.equal(typeof locale[key]?.message,'string');}
  assert.match(roadmap,/Freeform dragging\/placement persistence \(STEP-07\)/);
});
