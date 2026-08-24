import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { projectToolbarStatus, ToolbarStatusController } from '../src/presentation/index.ts';

const nowIso='2026-08-24T04:00:00.000Z';
function execution(overrides={}){return {mode:'repeat',totalIterations:5,completedIterations:2,activeIteration:3,activeMessage:null,activeDelayAfterSeconds:null,delaySeconds:10,autoContinue:true,autoScroll:true,preventDiscard:true,assistantBaselineFingerprint:null,responseStartedAt:null,nextDueAt:null,remainingDelayMs:null,messageTemplate:'Continue',...overrides};}
function run(state='running',overrides={}){return {schemaVersion:4,id:crypto.randomUUID(),generation:1,lifecycleState:state,targetTabId:1,targetWindowId:1,conversationBinding:{kind:'conversation',conversationId:'abc'},resumeState:null,suspensionReason:null,failure:null,execution:execution(),createdAt:nowIso,updatedAt:nowIso,...overrides};}
function target(tabId=1,overrides={}){return {schemaVersion:2,tabId,windowId:1,active:true,title:'ChatGPT',url:'https://chatgpt.com/c/abc',browserStatus:'complete',lifecycleState:'ready',autoDiscardable:true,contentConnected:true,adapterReady:true,adapterBusy:false,pageAlert:null,conversation:{kind:'conversation',conversationId:'abc',pathname:'/c/abc'},...overrides};}
async function text(path){return await readFile(new URL(`../${path}`,import.meta.url),'utf8');}

test('STEP-05 single-run badge/title come from shared projection including exact delay countdown',()=>{
  const now=Date.parse(nowIso);const waiting=run('waiting_delay',{execution:execution({activeIteration:null,nextDueAt:'2026-08-24T04:00:06.000Z'})});
  const model=projectToolbarStatus([waiting],[target()],{now});
  assert.equal(model.global.badgeText,'2/5');assert.match(model.global.title,/Waiting for delay/);assert.match(model.global.title,/Next send in 6s/);assert.match(model.global.title,/Iteration 3\/5/);assert.equal(model.tabs[0].badgeText,'2/5');assert.ok(model.nextRefreshAt>now&&model.nextRefreshAt<=now+1010);
});

test('STEP-05 paused and attention states are textual and never color-only',()=>{
  const paused=run('paused',{resumeState:'waiting_delay',suspensionReason:'user',execution:execution({activeIteration:null,remainingDelayMs:4000})});
  let model=projectToolbarStatus([paused],[target()]);assert.equal(model.global.badgeText,'P');assert.match(model.global.title,/Paused/);assert.match(model.global.title,/Paused delay remaining 4s/);
  const changed=run('paused',{resumeState:'running',suspensionReason:'conversation_changed'});model=projectToolbarStatus([changed],[target()]);assert.equal(model.global.badgeText,'!');assert.match(model.global.title,/explicit rebind is required/);
  const targetAttention=run('running');model=projectToolbarStatus([targetAttention],[target(1,{lifecycleState:'frozen'})]);assert.equal(model.global.badgeText,'!');assert.match(model.global.title,/need attention/);
});

test('STEP-05 multi-run aggregation is deterministic globally and per tab',()=>{
  const first=run('running',{id:'00000000-0000-4000-8000-000000000001',targetTabId:1});
  const second=run('paused',{id:'00000000-0000-4000-8000-000000000002',targetTabId:2,resumeState:'running',suspensionReason:'user'});
  const model=projectToolbarStatus([second,first],[target(1),target(2,{conversation:{kind:'conversation',conversationId:'abc',pathname:'/c/abc'}})]);
  assert.equal(model.global.badgeText,'2');assert.match(model.global.title,/2 active runs/);assert.deepEqual(model.tabs.map(x=>x.tabId),[1,2]);assert.equal(model.tabs[0].badgeText,'3/5');assert.equal(model.tabs[1].badgeText,'P');
});

test('STEP-05 multiple runs in one tab use a count instead of pretending one run is canonical',()=>{
  const model=projectToolbarStatus([run('running'),run('waiting_response',{execution:execution({responseStartedAt:nowIso})})],[target()],{now:Date.parse(nowIso)+5000});
  assert.equal(model.global.badgeText,'2');assert.equal(model.tabs.length,1);assert.equal(model.tabs[0].badgeText,'2');assert.match(model.tabs[0].title,/2 active runs/);
});

test('STEP-05 controller writes global/per-tab state and clears stale tab overrides after terminal completion',async()=>{
  const writes=[];let runs=[run('running')];const action={setBadgeText:d=>writes.push(['badge',d]),setTitle:d=>writes.push(['title',d])};
  const controller=new ToolbarStatusController(action,{runs:async()=>runs,targets:()=>[target()]},{schedule:()=>({}),cancel:()=>{}});
  await controller.refresh();assert.ok(writes.some(([kind,d])=>kind==='badge'&&d.tabId===1&&d.text==='3/5'));
  runs=[run('completed')];await controller.refresh();assert.ok(writes.some(([kind,d])=>kind==='badge'&&d.tabId===1&&d.text===''));assert.deepEqual(writes.at(-2),['badge',{text:'',tabId:1}]);assert.deepEqual(writes.at(-1),['title',{title:'ChatGPT Iterator',tabId:1}]);controller.dispose();
});

test('STEP-05 presentation-only boundary timer refreshes a delay title without driving execution',async()=>{
  let now=Date.parse(nowIso);let scheduled=null;const writes=[];const waiting=run('waiting_delay',{execution:execution({activeIteration:null,nextDueAt:'2026-08-24T04:00:02.000Z'})});
  const controller=new ToolbarStatusController({setBadgeText:d=>writes.push(['badge',d]),setTitle:d=>writes.push(['title',d])},{runs:async()=>[waiting],targets:()=>[target()]},{now:()=>now,schedule:(cb,delay)=>{scheduled={cb,delay};return 1;},cancel:()=>{}});
  await controller.refresh();assert.match(writes.find(([k,d])=>k==='title'&&!('tabId' in d))[1].title,/Next send in 2s/);assert.ok(scheduled.delay<=1010);
  now+=1005;const before=writes.length;scheduled.cb();await new Promise(resolve=>setImmediate(resolve));assert.ok(writes.slice(before).some(([k,d])=>k==='title'&&/Next send in 1s/.test(d.title)));controller.dispose();
});

test('STEP-05 a fresh controller reconstructs toolbar state from durable runs after worker restart',async()=>{
  const writes=[];const durable=run('paused',{resumeState:'running',suspensionReason:'user'});const controller=new ToolbarStatusController({setBadgeText:d=>writes.push(['badge',d]),setTitle:d=>writes.push(['title',d])},{runs:async()=>[durable],targets:()=>[target()]},{schedule:()=>1,cancel:()=>{}});
  await controller.refresh();assert.ok(writes.some(([k,d])=>k==='badge'&&!('tabId' in d)&&d.text==='P'));assert.ok(writes.some(([k,d])=>k==='title'&&!('tabId' in d)&&/Paused/.test(d.title)));controller.dispose();
});

test('STEP-05 background owns action status while toolbar click remains Side Panel and no popup/permission appears',async()=>{
  const bg=await text('entrypoints/background.ts');const wxt=await text('wxt.config.ts');const pkg=JSON.parse(await text('package.json'));
  assert.match(bg,/new ToolbarStatusController/);assert.match(bg,/toolbarStatusController\.refresh/);assert.match(bg,/openPanelOnActionClick: true/);assert.doesNotMatch(wxt,/default_popup/);assert.equal(pkg.version,'0.0.21');
  assert.deepEqual([...wxt.matchAll(/'([^']+)'/g)].map(m=>m[1]).filter(v=>['sidePanel','storage','alarms','tabs'].includes(v)),['sidePanel','storage','alarms']);
});

test('STEP-05 user-visible toolbar attention copy remains synchronized with Chrome locale catalog',async()=>{
  const fallback=await text('src/ui/messages.ts');const locale=JSON.parse(await text('public/_locales/en/messages.json'));const toolbar=await text('src/presentation/toolbar-status.ts');
  assert.match(fallback,/toolbarNeedsAttention: 'need attention'/);assert.equal(locale.toolbarNeedsAttention.message,'need attention');assert.match(toolbar,/setTitle/);assert.doesNotMatch(toolbar,/setBadgeBackgroundColor/);
});
