import {
  advanceInPageControllerTemporal,
  nextInPageTemporalRefreshDelay,
  type InPageControllerSnapshot,
} from './inpage-controller.ts';
import type { RunPresentationAttentionKey, RunPresentationLabelKey } from './run-projection.ts';

export interface InPageControllerCopy {
  readonly appName: string;
  readonly controllerLabel: string;
  readonly expand: string;
  readonly collapse: string;
  readonly noRun: string;
  readonly multipleRuns: string;
  readonly progress: string;
  readonly currentIteration: string;
  readonly delayRemaining: string;
  readonly pausedDelayRemaining: string;
  readonly responseElapsed: string;
  readonly responseIndeterminate: string;
  readonly pause: string;
  readonly resume: string;
  readonly stop: string;
  readonly openSidePanel: string;
  readonly lifecycle: Readonly<Record<RunPresentationLabelKey, string>>;
  readonly attention: Readonly<Record<Exclude<RunPresentationAttentionKey, null>, string>>;
}

const LIFECYCLE_FALLBACK: Readonly<Record<RunPresentationLabelKey, string>> = Object.freeze({
  runStateReady:'Ready', runStateRunning:'Running', runStateWaitingResponse:'Waiting for response', runStateWaitingDelay:'Waiting for delay', runStatePaused:'Paused',
  runStateFrozen:'Tab frozen', runStateDiscarded:'Tab discarded', runStateReconnecting:'Reconnecting target', runStateCompleted:'Completed', runStateFailed:'Failed', runStateStopped:'Stopped',
});
const ATTENTION_FALLBACK: Readonly<Record<Exclude<RunPresentationAttentionKey, null>, string>> = Object.freeze({
  frozenExplanation:'The target tab is frozen.',
  discardedExplanation:'The target tab was discarded.',
  targetReconnectExplanation:'The target page is reconnecting.',
  browserSessionResetExplanation:'Open the Side Panel and rebind the intended target.',
  conversationChangedExplanation:'The ChatGPT conversation changed. Open the Side Panel to rebind before continuing.',
  failedExplanation:'The run failed.',
});

export function createInPageControllerCopy(resolve: (key:string, fallback:string) => string): InPageControllerCopy {
  const lifecycle = Object.fromEntries(Object.entries(LIFECYCLE_FALLBACK).map(([key, fallback]) => [key, resolve(key, fallback)])) as unknown as Readonly<Record<RunPresentationLabelKey, string>>;
  const attention = Object.fromEntries(Object.entries(ATTENTION_FALLBACK).map(([key, fallback]) => [key, resolve(key, fallback)])) as unknown as Readonly<Record<Exclude<RunPresentationAttentionKey, null>, string>>;
  return Object.freeze({
    appName:resolve('appName','ChatGPT Iterator'),
    controllerLabel:resolve('inPageController','ChatGPT Iterator mini controller'),
    expand:resolve('expandInPageController','Expand ChatGPT Iterator'),
    collapse:resolve('collapseInPageController','Collapse ChatGPT Iterator'),
    noRun:resolve('inPageNoActiveRun','No active run on this ChatGPT tab.'),
    multipleRuns:resolve('inPageMultipleRuns','Multiple active runs target this tab. Open the Side Panel to manage them.'),
    progress:resolve('progress','Progress'),
    currentIteration:resolve('currentIteration','Current iteration'),
    delayRemaining:resolve('delayRemaining','Next send in'),
    pausedDelayRemaining:resolve('pausedDelayRemaining','Paused delay remaining'),
    responseElapsed:resolve('responseElapsed','Response wait elapsed'),
    responseIndeterminate:resolve('responseTimingIndeterminate','No completion ETA'),
    pause:resolve('pause','Pause'),
    resume:resolve('resume','Resume'),
    stop:resolve('stop','Stop'),
    openSidePanel:resolve('openSidePanel','Open Side Panel'),
    lifecycle:Object.freeze(lifecycle),
    attention:Object.freeze(attention),
  });
}

export interface InPageControllerCallbacks {
  readonly setCollapsed: (collapsed:boolean) => void;
  readonly pause: (runId:string, generation:number) => void;
  readonly resume: (runId:string, generation:number) => void;
  readonly stop: (runId:string, generation:number) => void;
  readonly openSidePanel: () => void;
}

function button(document: Document, label: string, action: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.addEventListener('click', (event) => { if (event.isTrusted) action(); });
  return element;
}

export class InPageRunControllerView {
  readonly #document: Document;
  readonly #window: Window;
  readonly #copy: InPageControllerCopy;
  readonly #callbacks: InPageControllerCallbacks;
  readonly #host: HTMLDivElement;
  readonly #shadow: ShadowRoot;
  readonly #launcher: HTMLButtonElement;
  readonly #card: HTMLElement;
  readonly #collapse: HTMLButtonElement;
  readonly #status: HTMLDivElement;
  readonly #detail: HTMLDivElement;
  readonly #timing: HTMLDivElement;
  readonly #attention: HTMLDivElement;
  readonly #actions: HTMLDivElement;
  #snapshot: InPageControllerSnapshot|undefined;
  #timer: number|undefined;

  constructor(document: Document, window: Window, copy: InPageControllerCopy, callbacks: InPageControllerCallbacks) {
    this.#document = document;
    this.#window = window;
    this.#copy = copy;
    this.#callbacks = callbacks;
    this.#host = document.createElement('div');
    this.#host.id = 'chatgpt-iterator-controller-host';
    this.#host.style.cssText = 'all:initial;position:fixed;top:72px;right:16px;z-index:2147483646;pointer-events:none;';
    this.#shadow = this.#host.attachShadow({ mode:'closed' });
    const style = document.createElement('style');
    style.textContent = `
      :host{color-scheme:light dark}*{box-sizing:border-box}.surface{font:13px/1.35 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:CanvasText}
      button{font:inherit;color:inherit;background:Canvas;border:1px solid GrayText;min-height:44px;padding:0 12px;border-radius:12px;cursor:pointer}button:hover{background:ButtonFace}button:focus-visible{outline:2px solid Highlight;outline-offset:2px}button:disabled{opacity:.55;cursor:default}
      .launcher{pointer-events:auto;min-width:48px;border-radius:999px;box-shadow:0 2px 14px rgb(0 0 0 / .18);font-weight:650}.launcher[data-tone="attention"],.launcher[data-tone="error"]{border-width:2px}.launcher[data-tone="paused"]{border-style:dashed}.launcher[data-tone="active"],.launcher[data-tone="waiting"]{border-color:Highlight}
      .card{pointer-events:auto;width:min(280px,calc(100vw - 32px));background:Canvas;border:1px solid GrayText;border-radius:16px;box-shadow:0 8px 28px rgb(0 0 0 / .22);padding:12px}.card[hidden]{display:none}.header{display:flex;align-items:center;gap:8px;margin-bottom:8px}.title{font-weight:700;flex:1}.collapse{min-width:44px;padding:0 10px}.status{font-weight:650;margin:4px 0}.detail,.timing,.attention{margin-top:5px}.attention:empty,.timing:empty{display:none}.actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}.actions button:last-child:nth-child(odd){grid-column:1/-1}
      @media (max-width:520px){.card{width:min(250px,calc(100vw - 24px))}:host{right:12px}}@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}@media (forced-colors:active){button,.card{forced-color-adjust:auto;box-shadow:none}}
    `;
    this.#shadow.append(style);
    const surface = document.createElement('div');
    surface.className = 'surface';
    this.#launcher = button(document, '↻', () => this.#callbacks.setCollapsed(false));
    this.#launcher.className = 'launcher';
    this.#launcher.setAttribute('aria-controls','chatgpt-iterator-controller-card');
    this.#launcher.setAttribute('aria-expanded','false');
    this.#launcher.setAttribute('aria-label',copy.expand);
    this.#card = document.createElement('section');
    this.#card.id = 'chatgpt-iterator-controller-card';
    this.#card.className = 'card';
    this.#card.setAttribute('aria-label',copy.controllerLabel);
    this.#card.hidden = true;
    const header = document.createElement('div'); header.className='header';
    const title = document.createElement('div'); title.className='title'; title.textContent=copy.appName;
    this.#collapse = button(document, '−', () => this.#callbacks.setCollapsed(true));
    this.#collapse.className='collapse'; this.#collapse.setAttribute('aria-label',copy.collapse);
    header.append(title,this.#collapse);
    this.#status=document.createElement('div'); this.#status.className='status'; this.#status.setAttribute('role','status'); this.#status.setAttribute('aria-live','polite'); this.#status.setAttribute('aria-atomic','true');
    this.#detail=document.createElement('div'); this.#detail.className='detail';
    this.#timing=document.createElement('div'); this.#timing.className='timing';
    this.#attention=document.createElement('div'); this.#attention.className='attention';
    this.#actions=document.createElement('div'); this.#actions.className='actions';
    this.#card.append(header,this.#status,this.#detail,this.#timing,this.#attention,this.#actions);
    surface.append(this.#launcher,this.#card);
    this.#shadow.append(surface);
    this.#shadow.addEventListener('keydown',(event) => {
      const keyboard = event as KeyboardEvent;
      if (keyboard.key !== 'Escape' || this.#card.hidden) return;
      keyboard.preventDefault();
      this.#callbacks.setCollapsed(true);
      this.#launcher.focus();
    });
    document.documentElement.append(this.#host);
  }

  update(snapshot: InPageControllerSnapshot): void { this.#snapshot=snapshot; this.#render(); }
  showError(message: string): void { this.#status.textContent=this.#copy.appName; this.#detail.textContent=message; }
  destroy(): void { if (this.#timer !== undefined) this.#window.clearTimeout(this.#timer); this.#host.remove(); }

  #render(): void {
    if (this.#snapshot === undefined) return;
    if (this.#timer !== undefined) { this.#window.clearTimeout(this.#timer); this.#timer=undefined; }
    const snapshot = advanceInPageControllerTemporal(this.#snapshot, Date.now());
    this.#launcher.hidden = !snapshot.collapsed;
    this.#card.hidden = snapshot.collapsed;
    this.#launcher.setAttribute('aria-expanded', String(!snapshot.collapsed));
    this.#actions.replaceChildren();
    this.#attention.textContent='';
    this.#timing.textContent='';

    if (snapshot.state === 'idle') {
      this.#launcher.textContent='↻'; this.#launcher.dataset.tone='neutral'; this.#launcher.title=this.#copy.noRun;
      this.#status.textContent=this.#copy.noRun; this.#detail.textContent='';
    } else if (snapshot.state === 'multiple') {
      this.#launcher.textContent=`↻ ${snapshot.activeRunCount}`; this.#launcher.dataset.tone='attention'; this.#launcher.title=this.#copy.multipleRuns;
      this.#status.textContent=`${snapshot.activeRunCount} ${this.#copy.multipleRuns}`; this.#detail.textContent='';
    } else {
      const projection=snapshot.projection!;
      const compact = projection.needsAttention ? '!' : projection.lifecycleState === 'paused' ? 'P' : `${projection.currentIteration ?? projection.completed}/${projection.total}`;
      this.#launcher.textContent=`↻ ${compact}`; this.#launcher.dataset.tone=projection.tone;
      this.#launcher.title=`${this.#copy.lifecycle[projection.labelKey]} · ${this.#copy.progress} ${projection.completed}/${projection.total}`;
      this.#status.textContent=this.#copy.lifecycle[projection.labelKey];
      this.#detail.textContent=`${this.#copy.progress} ${projection.completed}/${projection.total}${projection.currentIteration === null ? '' : ` · ${this.#copy.currentIteration} ${projection.currentIteration}/${projection.total}`}`;
      if (projection.delayRemainingSeconds !== null) this.#timing.textContent=`${projection.delayFrozen ? this.#copy.pausedDelayRemaining : this.#copy.delayRemaining} ${projection.delayRemainingSeconds}s`;
      else if (projection.responseElapsedSeconds !== null) this.#timing.textContent=`${this.#copy.responseElapsed} ${projection.responseElapsedSeconds}s${projection.responseIndeterminate ? ` · ${this.#copy.responseIndeterminate}` : ''}`;
      if (projection.attentionKey !== null) this.#attention.textContent=this.#copy.attention[projection.attentionKey];
      const runId=snapshot.runId!, generation=snapshot.generation!;
      if (projection.actions.pause) this.#actions.append(button(this.#document,this.#copy.pause,()=>this.#callbacks.pause(runId,generation)));
      if (projection.actions.resume) this.#actions.append(button(this.#document,this.#copy.resume,()=>this.#callbacks.resume(runId,generation)));
      if (projection.actions.stop) this.#actions.append(button(this.#document,this.#copy.stop,()=>this.#callbacks.stop(runId,generation)));
    }
    this.#actions.append(button(this.#document,this.#copy.openSidePanel,this.#callbacks.openSidePanel));
    const next = nextInPageTemporalRefreshDelay(this.#snapshot, Date.now());
    if (next !== null) this.#timer=this.#window.setTimeout(()=>{this.#timer=undefined;this.#render();},next);
  }
}
