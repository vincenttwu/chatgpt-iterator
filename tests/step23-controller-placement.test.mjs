import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRequest, requireMessageEnvelope } from '../src/core/index.ts';
import { InPageControllerRuntimeServer } from '../src/runtime/index.ts';
import {
  DEFAULT_INPAGE_CONTROLLER_DOCK,
  INPAGE_CONTROLLER_DOCKS,
  dockInPageControllerFromPointer,
  moveInPageControllerDock,
  resolveInPageControllerPosition,
  projectInPageControllerStatus,
  requireInPageControllerPreference,
} from '../src/presentation/index.ts';

const text=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const viewport=(width=1280,height=800)=>({width,height,offsetLeft:0,offsetTop:0});

function target(){return {schemaVersion:2,tabId:17,windowId:3,active:true,title:'Chat',url:'https://chatgpt.com/c/A',browserStatus:'complete',lifecycleState:'ready',autoDiscardable:true,contentConnected:true,adapterReady:true,adapterBusy:false,pageAlert:null,conversation:{schemaVersion:3,kind:'conversation',conversationId:'A',pathname:'/c/A'}};}

class PreferenceStorage {
  value=undefined;
  async get(){return this.value===undefined?undefined:structuredClone(this.value);}
  async set(_key,value){this.value=structuredClone(value);}
  async remove(){this.value=undefined;}
}
const caller=()=>({kind:'chatgpt_content',extensionId:'ext',tabId:17,windowId:3,frameId:0,documentId:'doc',origin:'https://chatgpt.com',url:'https://chatgpt.com/c/A'});
function inpageRequest(operation,payload={}){return createRequest({requestSequence:1,intent:operation==='inpage.status'?'query':'command',source:'content',target:'background',operation,payload});}
function preferenceServer(storage){return new InPageControllerRuntimeServer(async()=>({list:async()=>[]}),undefined,async()=>target(),async()=>undefined,storage);}

test('STEP-07 canonical placement vocabulary is bounded and pointer dragging snaps only to named docks',()=>{
  assert.deepEqual([...INPAGE_CONTROLLER_DOCKS],['top_left','middle_left','bottom_left','top_right','middle_right','bottom_right']);
  assert.equal(DEFAULT_INPAGE_CONTROLLER_DOCK,'top_right');
  assert.equal(dockInPageControllerFromPointer(50,40,viewport()),'top_left');
  assert.equal(dockInPageControllerFromPointer(1200,400,viewport()),'middle_right');
  assert.equal(dockInPageControllerFromPointer(60,760,viewport()),'bottom_left');
  assert.equal(dockInPageControllerFromPointer(1200,760,viewport()),'bottom_right');
});

test('STEP-07 keyboard and non-drag movement maps remain within the same canonical vocabulary',()=>{
  assert.equal(moveInPageControllerDock('bottom_right','up'),'middle_right');
  assert.equal(moveInPageControllerDock('middle_right','up'),'top_right');
  assert.equal(moveInPageControllerDock('top_right','left'),'top_left');
  assert.equal(moveInPageControllerDock('top_left','down'),'middle_left');
  assert.equal(moveInPageControllerDock('bottom_left','down'),'bottom_left');
});

test('STEP-07 wide bottom-right placement is lifted above the sticky composer safe area',()=>{
  const position=resolveInPageControllerPosition('bottom_right',viewport(1440,900),{width:280,height:300},[{left:0,top:700,right:1440,bottom:900}]);
  assert.equal(position.dock,'bottom_right');
  assert.equal(position.left,1440-280-16);
  assert.ok(position.top+300<=688);
  assert.ok(position.top>=16);
});

test('STEP-07 narrow layouts clamp on-screen and avoid the known bottom composer region',()=>{
  const position=resolveInPageControllerPosition('bottom_left',viewport(360,640),{width:320,height:280},[{left:0,top:510,right:360,bottom:640}]);
  assert.equal(position.left,16);
  assert.ok(position.top>=16);
  assert.ok(position.top+280<=498);
  assert.ok(position.left+320<=344);
});

test('STEP-07 viewport/zoom corruption clamps safely and legacy preference records normalize to top-right',()=>{
  const position=resolveInPageControllerPosition('middle_right',{width:Number.NaN,height:-1,offsetLeft:Number.NaN,offsetTop:Number.NaN},{width:Number.POSITIVE_INFINITY,height:-2},[]);
  assert.ok(Number.isFinite(position.left));assert.ok(Number.isFinite(position.top));assert.ok(position.left>=0);assert.ok(position.top>=0);
  assert.deepEqual(requireInPageControllerPreference({schemaVersion:1,collapsed:false}),{schemaVersion:1,collapsed:false,dock:'top_right'});
  assert.throws(()=>requireInPageControllerPreference({schemaVersion:1,collapsed:true,dock:'freeform_10_20'}));
});

test('STEP-07 controller status carries normalized dock only and never arbitrary coordinates',()=>{
  const idle=projectInPageControllerStatus([],target(),{schemaVersion:1,collapsed:false,dock:'middle_left'},Date.parse('2026-08-24T05:00:00Z'));
  assert.equal(idle.dock,'middle_left');assert.equal(idle.collapsed,false);
  const serialized=JSON.stringify(idle);assert.equal(serialized.includes('leftPx'),false);assert.equal(serialized.includes('topPx'),false);assert.equal(serialized.includes('x"'),false);
});


test('STEP-07 background owns normalized dock persistence and returns it through privacy-safe status',async()=>{
  const storage=new PreferenceStorage();const server=preferenceServer(storage);
  let response=requireMessageEnvelope(await server.handle(inpageRequest('inpage.setdock',{dock:'bottom_left'}),caller()));
  assert.equal(response.outcome.ok,true);assert.equal(response.outcome.value.dock,'bottom_left');assert.deepEqual(storage.value,{schemaVersion:1,collapsed:true,dock:'bottom_left'});
  response=requireMessageEnvelope(await server.handle(inpageRequest('inpage.setcollapsed',{collapsed:false}),caller()));
  assert.equal(response.outcome.ok,true);assert.equal(response.outcome.value.collapsed,false);assert.equal(response.outcome.value.dock,'bottom_left');assert.deepEqual(storage.value,{schemaVersion:1,collapsed:false,dock:'bottom_left'});
});

test('STEP-07 corrupted stored placement recovers to safe canonical default without blocking status',async()=>{
  const storage=new PreferenceStorage();storage.value={schemaVersion:1,collapsed:false,dock:'999px,999px'};const server=preferenceServer(storage);
  const response=requireMessageEnvelope(await server.handle(inpageRequest('inpage.status'),caller()));
  assert.equal(response.outcome.ok,true);assert.equal(response.outcome.value.dock,'top_right');assert.equal(response.outcome.value.collapsed,true);assert.deepEqual(storage.value,{schemaVersion:1,collapsed:true,dock:'top_right'});
});

test('STEP-07 DOM surface has dedicated trusted drag handling and equivalent single-pointer/keyboard placement controls',async()=>{
  const dom=await text('src/presentation/inpage-controller-dom.ts');
  for(const token of ["className='drag-handle'","addEventListener('pointerdown'","addEventListener('pointermove'","addEventListener('pointerup'","event.isTrusted","dock-grid","aria-pressed","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Home","reset-position","min-height:44px"]){assert.match(dom,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));}
  assert.match(dom,/prefers-reduced-motion:reduce/);assert.match(dom,/forced-colors:active/);assert.match(dom,/visualViewport/);assert.match(dom,/ResizeObserver/);assert.match(dom,/collisionRects/);assert.match(dom,/attachShadow\(\{ mode:'closed' \}\)/);
  assert.doesNotMatch(dom,/localStorage|sessionStorage/);
});

test('STEP-07 ChatGPT-specific collision selectors stay centralized in src/chatgpt and content consumes only the layout advisor',async()=>{
  const layout=await text('src/chatgpt/layout.ts');const content=await text('entrypoints/chatgpt.content.ts');const dom=await text('src/presentation/inpage-controller-dom.ts');
  assert.match(layout,/#thread-bottom-container/);assert.ok(layout.includes('[data-composer-surface="true"]'));assert.match(layout,/ResizeObserver/);
  assert.match(content,/BrowserChatGptLayoutAdvisor/);assert.match(content,/layoutAdvisor\.collisionRects\(\)/);assert.match(content,/layoutAdvisor\.refresh\(\)/);assert.doesNotMatch(content,/#thread-bottom-container|data-composer-surface/);assert.doesNotMatch(dom,/#thread-bottom-container|data-composer-surface/);
});

test('STEP-07 runtime persists only canonical dock plus collapse preference and rejects arbitrary placement payloads',async()=>{
  const runtime=await text('src/runtime/inpage-controller-runtime-server.ts');const controller=await text('src/presentation/inpage-controller.ts');
  assert.match(runtime,/INPAGE_CONTROLLER_OPERATIONS\.setDock/);assert.match(runtime,/isInPageControllerDock\(dock\)/);assert.match(runtime,/\{ \.\.\.current, dock \}/);assert.doesNotMatch(runtime,/leftPx|topPx|clientX|clientY/);
  assert.match(controller,/setDock: 'inpage\.setdock'/);assert.match(controller,/dock: InPageControllerDock/);assert.equal((controller.match(/INPAGE_CONTROLLER_SCHEMA_VERSION = 1/g)??[]).length,1);
});

test('STEP-07 preserves product scope, localization, permission surface, no popup and no polling execution loop',async()=>{
  const wxt=await text('wxt.config.ts');const content=await text('entrypoints/chatgpt.content.ts');const messages=await text('src/ui/messages.ts');const locale=JSON.parse(await text('public/_locales/en/messages.json'));const versions=await text('src/persistence/versions.ts');
  assert.doesNotMatch(wxt,/default_popup/);assert.deepEqual([...wxt.matchAll(/'([^']+)'/g)].map(m=>m[1]).filter(v=>['sidePanel','storage','alarms','tabs'].includes(v)),['sidePanel','storage','alarms']);assert.doesNotMatch(content,/setInterval\(/);
  for(const key of ['inPagePosition','moveInPageController','resetInPageControllerPosition','dockTopLeft','dockMiddleLeft','dockBottomLeft','dockTopRight','dockMiddleRight','dockBottomRight']){assert.match(messages,new RegExp(`${key}:`));assert.equal(typeof locale[key]?.message,'string');}
  assert.match(versions,/PHYSICAL_DB_VERSION = 1/);assert.match(versions,/LOGICAL_MODEL_VERSION = 5/);assert.match(versions,/EXPORT_FORMAT_VERSION = 1/);
});
