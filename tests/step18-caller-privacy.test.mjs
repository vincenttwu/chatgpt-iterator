import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequest, requireMessageEnvelope } from '../src/core/index.ts';
import { ApplicationRepositories, LOGICAL_MIGRATIONS, LOGICAL_MODEL_VERSION, PERSISTENCE_STORES, migrateLogicalModel } from '../src/persistence/index.ts';
import { BackgroundMessageRouter, FUTURE_MINI_CONTROLLER_ALLOWED_ACTIONS, TabRuntimeServer, resolveRuntimeCaller } from '../src/runtime/index.ts';
import { RUN_RUNTIME_OPERATIONS } from '../src/runs/types.ts';
import { TAB_RUNTIME_OPERATIONS } from '../src/tabs/types.ts';
import { ChatGptAdapter, ChatGptAdapterServer, assistantFingerprintFromLegacySignature, isAssistantFingerprint, requireChatGptAdapterSnapshot } from '../src/chatgpt/index.ts';
import { requireRunSnapshot } from '../src/runs/model.ts';
import { requirePortableEnvelope } from '../src/portability/index.ts';

const extensionId = 'abcdefghijklmnopabcdefghijklmnop';
const sidepanelSender = { id: extensionId, origin: `chrome-extension://${extensionId}`, url: `chrome-extension://${extensionId}/sidepanel.html` };
const contentSender = { id: extensionId, frameId: 0, origin: 'https://chatgpt.com', url: 'https://chatgpt.com/c/test', tab: { id: 17, windowId: 3, url: 'https://chatgpt.com/c/test' } };

const request = (source, operation, intent='query', payload={}) => createRequest({ requestSequence: 1, intent, source, target:'background', operation, payload });
const v2Snapshot = () => ({ schemaVersion:2, ready:true, busy:false, composerPresent:true, composerHasDraft:false, sendAvailable:true, continueAvailable:false, stopAvailable:false, assistantFingerprint:'af2:11111111111111111111111111111111', assistantMessageCount:1, pageAlert:null });

function stub(handler=async req=>({handled:req.operation})) { return { handle: handler }; }

test('STEP-02 derives Side Panel and top-frame ChatGPT caller classes from actual MessageSender metadata', () => {
  const panel = resolveRuntimeCaller(sidepanelSender, extensionId);
  assert.equal(panel.kind, 'sidepanel');
  assert.equal(panel.tabId, null);
  const content = resolveRuntimeCaller(contentSender, extensionId);
  assert.equal(content.kind, 'chatgpt_content');
  assert.equal(content.tabId, 17);
  assert.equal(content.frameId, 0);
  assert.throws(() => resolveRuntimeCaller({ ...contentSender, frameId: 1 }, extensionId), /top frame/);
  assert.throws(() => resolveRuntimeCaller({ ...contentSender, origin: 'https://example.com', url: 'https://example.com/' }, extensionId), /allowed ChatGPT origin/);
  assert.throws(() => resolveRuntimeCaller({ ...contentSender, id: 'foreign-extension' }, extensionId), /not this extension/);
});

test('STEP-02 forged envelope source cannot turn a content sender into a Side Panel caller', async () => {
  let runCalls = 0;
  const router = new BackgroundMessageRouter(stub(), stub(), stub(async()=>{ runCalls += 1; return {unexpected:true}; }), undefined, undefined, undefined, undefined, undefined, undefined, undefined, extensionId);
  const response = requireMessageEnvelope(await router.handle(request('sidepanel', RUN_RUNTIME_OPERATIONS.list), contentSender));
  assert.equal(response.kind, 'response');
  assert.equal(response.outcome.ok, false);
  assert.equal(!response.outcome.ok && response.outcome.error.code, 'invalid_message');
  assert.equal(runCalls, 0);
});

test('STEP-02 top-frame ChatGPT content can publish adapter state only for its own sender.tab context', async () => {
  const calls = [];
  const registry = {
    async noteAdapterState(tabId, windowId, snapshot) { calls.push({tabId, windowId, snapshot}); return { schemaVersion:1, revision:1, targets:[], binding:null, lastTermination:null }; },
    async refresh(){ throw new Error('not used'); }, async bind(){ throw new Error('not used'); }, unbind(){ throw new Error('not used'); },
  };
  const tabServer = new TabRuntimeServer(registry);
  const router = new BackgroundMessageRouter(stub(), tabServer, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, extensionId);
  const response = requireMessageEnvelope(await router.handle(request('content', TAB_RUNTIME_OPERATIONS.adapterState, 'command', { snapshot: v2Snapshot() }), contentSender));
  assert.equal(response.outcome.ok, true);
  assert.deepEqual(calls.map(({tabId,windowId})=>[tabId,windowId]), [[17,3]]);
  const forbidden = requireMessageEnvelope(await router.handle(request('content', RUN_RUNTIME_OPERATIONS.stop, 'command', { runId: crypto.randomUUID(), expectedGeneration: 1 }), contentSender));
  assert.equal(forbidden.outcome.ok, false);
  assert.equal(calls.length, 1);
});

function element(input={}) { return { visible:true, text:'', draft:'', disabled:false, attrs:{}, clicks:0, ...input }; }
class FakeDom {
  map=new Map(); observers=new Set();
  set(selector, values){this.map.set(selector, Array.isArray(values)?values:[values]);} queryOne(selector){return this.map.get(selector)?.[0]??null;} queryAll(selector){return [...(this.map.get(selector)??[])];}
  isVisible(h){return h.visible!==false;} readText(h){return h.text??'';} readComposer(h){return h.draft??'';} writeComposer(h,m){h.draft=m;this.trigger();} getAttribute(h,n){return h.attrs?.[n]??null;} isDisabled(h){return h.disabled===true;} click(h){h.clicks+=1;} observe(cb){this.observers.add(cb);return()=>this.observers.delete(cb);} scrollToBottom(){} now(){return 1000;} isoNow(){return new Date(1000).toISOString();} trigger(){for(const cb of this.observers)cb();}
}
function adapterFixture(){const dom=new FakeDom();const composer=element({draft:'PRIVATE DRAFT'});const send=element({attrs:{'data-testid':'send-button'}});dom.set('#prompt-textarea',composer);dom.set('button[data-testid="send-button"]',send);dom.set('button[data-testid="stop-button"]',[]);dom.set('button[aria-label]',[]);dom.set('button',[]);dom.set('[role="alert"]',[]);dom.set('[data-message-author-role="assistant"]',[element({text:'PRIVATE ASSISTANT RESPONSE'})]);return{dom,composer,send,adapter:new ChatGptAdapter(dom)};}

test('STEP-02 adapter v2 exports only draft presence and opaque deterministic assistant fingerprint', () => {
  const { adapter } = adapterFixture();
  const first = adapter.snapshot(); const second = adapter.snapshot();
  assert.equal(first.schemaVersion, 3);
  assert.equal(first.composerHasDraft, true);
  assert.equal(isAssistantFingerprint(first.assistantFingerprint), true);
  assert.equal(first.assistantFingerprint, second.assistantFingerprint);
  const serialized = JSON.stringify(first);
  assert.equal(serialized.includes('PRIVATE DRAFT'), false);
  assert.equal(serialized.includes('PRIVATE ASSISTANT RESPONSE'), false);
  assert.equal('composerDraft' in first, false);
  assert.equal('assistantSignature' in first, false);
});

test('STEP-02 legacy adapter snapshot is explicitly normalized without forwarding raw text', () => {
  const normalized = requireChatGptAdapterSnapshot({ schemaVersion:1, ready:true, busy:false, composerPresent:true, composerDraft:'SECRET DRAFT', sendAvailable:true, continueAvailable:false, stopAvailable:false, assistantSignature:'1:16:SECRET ASSISTANT', assistantMessageCount:1, pageAlert:null });
  assert.equal(normalized.schemaVersion, 3);
  assert.equal(normalized.composerHasDraft, true);
  assert.equal(isAssistantFingerprint(normalized.assistantFingerprint), true);
  assert.equal(JSON.stringify(normalized).includes('SECRET'), false);
});

test('STEP-02 send baseline safety remains fail-closed with opaque fingerprints and legacy server compatibility', async () => {
  const { adapter, composer, send, dom } = adapterFixture();
  composer.draft='';
  const baseline = adapter.snapshot().assistantFingerprint;
  dom.set('[data-message-author-role="assistant"]',[element({text:'CHANGED RESPONSE'})]);
  await assert.rejects(() => adapter.send('do not send', 50, baseline), /baseline changed/);
  assert.equal(send.clicks, 0);
  dom.set('[data-message-author-role="assistant"]',[element({text:'PRIVATE ASSISTANT RESPONSE'})]);
  const legacy = '1:26:PRIVATE ASSISTANT RESPONSE';
  const server = new ChatGptAdapterServer(adapter);
  const req = createRequest({requestSequence:2,intent:'command',source:'background',target:'content',operation:'chatgpt.send',payload:{message:'safe message',expectedAssistantBaselineSignature:legacy}});
  const response = requireMessageEnvelope(await server.handle(req));
  assert.equal(response.outcome.ok, true);
});

function clone(v){return structuredClone(v);} const keyFor=(store,value)=>store==='metadata'?value.key:value.id;
class MemoryDriver { state=new Map(PERSISTENCE_STORES.map(n=>[n,new Map()])); async transaction(stores,mode,work){const before=structuredClone([...this.state].map(([n,m])=>[n,[...m]]));const port={store:(name)=>({get:async key=>{const v=this.state.get(name).get(key);return v===undefined?undefined:clone(v)},getAll:async()=>[...this.state.get(name).values()].map(clone),getAllByIndex:async()=>[],put:async value=>{if(mode!=='readwrite')throw Error('readonly');this.state.get(name).set(keyFor(name,value),clone(value));},delete:async key=>{this.state.get(name).delete(key)}})};try{return await work(port)}catch(e){this.state=new Map(before.map(([n,rows])=>[n,new Map(rows)]));throw e}} close(){} }

const legacyRunState = { schemaVersion:1, id:'11111111-1111-4111-8111-111111111111', generation:4, lifecycleState:'waiting_response', targetTabId:17, targetWindowId:3, resumeState:null, suspensionReason:null, failure:null, execution:{mode:'repeat',messageTemplate:'Continue',totalIterations:2,completedIterations:0,activeIteration:1,activeMessage:'Continue',activeDelayAfterSeconds:null,delaySeconds:7,autoContinue:true,autoScroll:true,preventDiscard:true,assistantBaselineSignature:'1:26:PRIVATE ASSISTANT RESPONSE',nextDueAt:null},createdAt:'2026-08-24T03:00:00Z',updatedAt:'2026-08-24T03:01:00Z' };

test('STEP-02 run-state v1 compatibility and logical migration scrub text-bearing assistant baselines to v2', async () => {
  const normalized=requireRunSnapshot(legacyRunState);
  assert.equal(normalized.schemaVersion,3); assert.equal(isAssistantFingerprint(normalized.execution.assistantBaselineFingerprint),true); assert.equal(JSON.stringify(normalized).includes('PRIVATE ASSISTANT RESPONSE'),false);
  const driver=new MemoryDriver(); const repositories=new ApplicationRepositories(driver);
  await repositories.write(['metadata','runs'],async tx=>{await tx.repository('metadata').put({key:'logicalModelVersion',value:1,updatedAt:'2026-08-24T03:00:00Z'});await tx.repository('runs').put({schemaVersion:1,id:legacyRunState.id,logicalVersion:1,state:legacyRunState,createdAt:legacyRunState.createdAt,updatedAt:legacyRunState.updatedAt});});
  const result=await migrateLogicalModel(repositories,LOGICAL_MIGRATIONS,()=> '2026-08-24T03:02:00Z'); assert.deepEqual(result,{fromVersion:1,toVersion:LOGICAL_MODEL_VERSION,applied:2});
  const stored=await repositories.readonly(['runs'],async tx=>await tx.repository('runs').get(legacyRunState.id));
  assert.equal(stored.logicalVersion,LOGICAL_MODEL_VERSION); assert.equal(stored.state.schemaVersion,3); assert.equal(JSON.stringify(stored).includes('PRIVATE ASSISTANT RESPONSE'),false);
  assert.equal(stored.state.execution.assistantBaselineFingerprint,assistantFingerprintFromLegacySignature('1:26:PRIVATE ASSISTANT RESPONSE'));
});



test('STEP-02 portable format v1 remains readable while normalizing legacy run baselines to run-state v2', () => {
  const terminalLegacy = structuredClone(legacyRunState);
  terminalLegacy.lifecycleState = 'stopped';
  const envelope = requirePortableEnvelope({
    product:'chatgpt-iterator', formatVersion:1, kind:'full_backup', appVersion:'0.0.16', exportedAt:'2026-08-24T03:10:00Z',
    data:{ templates:[], presets:[], queues:[], settings:{defaultPresetId:null,defaultDelaySeconds:7,defaultAutoContinue:true,defaultAutoScroll:true,defaultPreventDiscard:true,recoveryPolicy:'resume',historyLimit:100}, history:[{run:terminalLegacy,events:[{id:'22222222-2222-4222-8222-222222222222',sequence:0,eventType:'created',payload:{},occurredAt:'2026-08-24T03:00:00Z'}]}] }
  });
  const run=envelope.data.history[0].run;
  assert.equal(run.schemaVersion,3);
  assert.equal(isAssistantFingerprint(run.execution.assistantBaselineFingerprint),true);
  assert.equal(JSON.stringify(envelope).includes('PRIVATE ASSISTANT RESPONSE'),false);
});

test('STEP-02 future in-page controller authority is intentionally narrow and does not pre-enable creation/configuration', () => {
  assert.deepEqual([...FUTURE_MINI_CONTROLLER_ALLOWED_ACTIONS], ['pause','resume','stop']);
  assert.equal(FUTURE_MINI_CONTROLLER_ALLOWED_ACTIONS.includes('start'), false);
});
