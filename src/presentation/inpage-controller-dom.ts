import {
  advanceInPageControllerTemporal,
  nextInPageTemporalRefreshDelay,
  type InPageControllerSnapshot,
} from './inpage-controller.ts';
import {
  DEFAULT_INPAGE_CONTROLLER_DOCK,
  dockInPageControllerFromPointer,
  moveInPageControllerDock,
  resolveInPageControllerPosition,
  type InPageCollisionRect,
  type InPageControllerDock,
  type InPageViewport,
} from './inpage-placement.ts';
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
  readonly position: string;
  readonly move: string;
  readonly resetPosition: string;
  readonly docks: Readonly<Record<InPageControllerDock, string>>;
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
const DOCK_FALLBACK: Readonly<Record<InPageControllerDock, string>> = Object.freeze({
  top_left:'Top left', middle_left:'Middle left', bottom_left:'Bottom left',
  top_right:'Top right', middle_right:'Middle right', bottom_right:'Bottom right',
});
const DOCK_ICON: Readonly<Record<InPageControllerDock, string>> = Object.freeze({
  top_left:'↖', middle_left:'←', bottom_left:'↙', top_right:'↗', middle_right:'→', bottom_right:'↘',
});

export function createInPageControllerCopy(resolve: (key:string, fallback:string) => string): InPageControllerCopy {
  const lifecycle = Object.fromEntries(Object.entries(LIFECYCLE_FALLBACK).map(([key, fallback]) => [key, resolve(key, fallback)])) as unknown as Readonly<Record<RunPresentationLabelKey, string>>;
  const attention = Object.fromEntries(Object.entries(ATTENTION_FALLBACK).map(([key, fallback]) => [key, resolve(key, fallback)])) as unknown as Readonly<Record<Exclude<RunPresentationAttentionKey, null>, string>>;
  const docks = Object.freeze({
    top_left:resolve('dockTopLeft',DOCK_FALLBACK.top_left),
    middle_left:resolve('dockMiddleLeft',DOCK_FALLBACK.middle_left),
    bottom_left:resolve('dockBottomLeft',DOCK_FALLBACK.bottom_left),
    top_right:resolve('dockTopRight',DOCK_FALLBACK.top_right),
    middle_right:resolve('dockMiddleRight',DOCK_FALLBACK.middle_right),
    bottom_right:resolve('dockBottomRight',DOCK_FALLBACK.bottom_right),
  });
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
    position:resolve('inPagePosition','Position'),
    move:resolve('moveInPageController','Move ChatGPT Iterator'),
    resetPosition:resolve('resetInPageControllerPosition','Reset position'),
    docks,
    lifecycle:Object.freeze(lifecycle),
    attention:Object.freeze(attention),
  });
}

export interface InPageControllerCallbacks {
  readonly setCollapsed: (collapsed:boolean) => void;
  readonly setDock: (dock:InPageControllerDock) => void;
  readonly pause: (runId:string, generation:number) => void;
  readonly resume: (runId:string, generation:number) => void;
  readonly stop: (runId:string, generation:number) => void;
  readonly openSidePanel: () => void;
  readonly collisionRects?: () => readonly InPageCollisionRect[];
}

function button(document: Document, label: string, action: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.addEventListener('click', (event) => { if (event.isTrusted) action(); });
  return element;
}

function dockButton(document: Document, dock: InPageControllerDock, label: string, action: () => void): HTMLButtonElement {
  const element = button(document, DOCK_ICON[dock], action);
  element.className = 'dock-button';
  element.dataset.dock = dock;
  element.setAttribute('aria-label', label);
  element.title = label;
  return element;
}

function clamp(value: number, minimum: number, maximum: number): number { return Math.min(Math.max(value, minimum), Math.max(minimum, maximum)); }

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
  readonly #dragHandle: HTMLButtonElement;
  readonly #status: HTMLDivElement;
  readonly #detail: HTMLDivElement;
  readonly #timing: HTMLDivElement;
  readonly #attention: HTMLDivElement;
  readonly #actions: HTMLDivElement;
  readonly #dockButtons = new Map<InPageControllerDock, HTMLButtonElement>();
  readonly #resizeObserver: ResizeObserver;
  readonly #onViewportChange = () => this.reposition();
  #snapshot: InPageControllerSnapshot|undefined;
  #timer: number|undefined;
  #dragPointer: number|undefined;
  #dragOffsetX = 0;
  #dragOffsetY = 0;
  #pendingDock: InPageControllerDock|undefined;

  constructor(document: Document, window: Window, copy: InPageControllerCopy, callbacks: InPageControllerCallbacks) {
    this.#document = document;
    this.#window = window;
    this.#copy = copy;
    this.#callbacks = callbacks;
    this.#host = document.createElement('div');
    this.#host.id = 'chatgpt-iterator-controller-host';
    this.#host.style.cssText = 'all:initial;position:fixed;top:72px;left:16px;z-index:2147483646;pointer-events:none;';
    this.#shadow = this.#host.attachShadow({ mode:'closed' });
    const style = document.createElement('style');
    style.textContent = `
      :host{color-scheme:light dark}*{box-sizing:border-box}.surface{font:13px/1.35 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:CanvasText}
      button,summary{font:inherit;color:inherit}button{background:Canvas;border:1px solid GrayText;min-height:44px;padding:0 12px;border-radius:12px;cursor:pointer}button:hover,summary:hover{background:ButtonFace}button:focus-visible,summary:focus-visible{outline:2px solid Highlight;outline-offset:2px}button:disabled{opacity:.55;cursor:default}
      .launcher{pointer-events:auto;min-width:48px;border-radius:999px;box-shadow:0 2px 14px rgb(0 0 0 / .18);font-weight:650}.launcher[data-tone="attention"],.launcher[data-tone="error"]{border-width:2px}.launcher[data-tone="paused"]{border-style:dashed}.launcher[data-tone="active"],.launcher[data-tone="waiting"]{border-color:Highlight}
      .card{pointer-events:auto;width:min(280px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow:auto;background:Canvas;border:1px solid GrayText;border-radius:16px;box-shadow:0 8px 28px rgb(0 0 0 / .22);padding:12px}.card[hidden]{display:none}.header{display:flex;align-items:center;gap:8px;margin-bottom:8px}.title{font-weight:700;flex:1}.drag-handle,.collapse{min-width:44px;padding:0 10px}.drag-handle{touch-action:none;cursor:grab}.drag-handle:active{cursor:grabbing}.status{font-weight:650;margin:4px 0}.detail,.timing,.attention{margin-top:5px}.attention:empty,.timing:empty{display:none}.actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}.actions button:last-child:nth-child(odd){grid-column:1/-1}
      .position{margin-top:10px}.position summary{display:flex;min-height:44px;align-items:center;border-radius:10px;padding:0 10px;cursor:pointer;list-style:none}.position summary::-webkit-details-marker{display:none}.position summary::after{content:'⌄';margin-inline-start:auto}.position[open] summary::after{content:'⌃'}.dock-grid{display:grid;grid-template-columns:repeat(3,minmax(44px,1fr));gap:6px;margin-top:6px}.dock-button{padding:0;font-size:18px}.dock-button[aria-pressed="true"]{outline:2px solid Highlight;outline-offset:-3px}.reset-position{grid-column:1/-1}
      @media (max-width:520px){.card{width:min(250px,calc(100vw - 24px))}.dock-grid{grid-template-columns:repeat(2,minmax(44px,1fr))}}@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important;animation:none!important}}@media (forced-colors:active){button,.card,summary{forced-color-adjust:auto;box-shadow:none}.dock-button[aria-pressed="true"]{outline:2px solid Highlight}}
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
    this.#dragHandle = document.createElement('button');
    this.#dragHandle.type='button'; this.#dragHandle.className='drag-handle'; this.#dragHandle.textContent='⠿'; this.#dragHandle.setAttribute('aria-label',copy.move); this.#dragHandle.title=copy.move;
    const title = document.createElement('div'); title.className='title'; title.textContent=copy.appName;
    this.#collapse = button(document, '−', () => this.#callbacks.setCollapsed(true));
    this.#collapse.className='collapse'; this.#collapse.setAttribute('aria-label',copy.collapse);
    header.append(this.#dragHandle,title,this.#collapse);
    this.#status=document.createElement('div'); this.#status.className='status'; this.#status.setAttribute('role','status'); this.#status.setAttribute('aria-live','polite'); this.#status.setAttribute('aria-atomic','true');
    this.#detail=document.createElement('div'); this.#detail.className='detail';
    this.#timing=document.createElement('div'); this.#timing.className='timing';
    this.#attention=document.createElement('div'); this.#attention.className='attention';
    const position=document.createElement('details'); position.className='position';
    const positionSummary=document.createElement('summary'); positionSummary.textContent=copy.position;
    const dockGrid=document.createElement('div'); dockGrid.className='dock-grid';
    for (const dock of ['top_left','middle_left','bottom_left','top_right','middle_right','bottom_right'] as const) {
      const element=dockButton(document,dock,copy.docks[dock],()=>this.#chooseDock(dock));
      this.#dockButtons.set(dock,element); dockGrid.append(element);
    }
    const reset=button(document,copy.resetPosition,()=>this.#chooseDock(DEFAULT_INPAGE_CONTROLLER_DOCK)); reset.className='reset-position'; dockGrid.append(reset);
    position.append(positionSummary,dockGrid);
    this.#actions=document.createElement('div'); this.#actions.className='actions';
    this.#card.append(header,this.#status,this.#detail,this.#timing,this.#attention,position,this.#actions);
    surface.append(this.#launcher,this.#card);
    this.#shadow.append(surface);
    this.#shadow.addEventListener('keydown',(event) => {
      const keyboard = event as KeyboardEvent;
      if (keyboard.key !== 'Escape' || this.#card.hidden) return;
      keyboard.preventDefault();
      this.#callbacks.setCollapsed(true);
      this.#launcher.focus();
    });
    this.#dragHandle.addEventListener('pointerdown',(event)=>this.#beginDrag(event));
    this.#dragHandle.addEventListener('pointermove',(event)=>this.#continueDrag(event));
    this.#dragHandle.addEventListener('pointerup',(event)=>this.#finishDrag(event));
    this.#dragHandle.addEventListener('pointercancel',(event)=>this.#cancelDrag(event));
    this.#dragHandle.addEventListener('keydown',(event)=>this.#moveByKeyboard(event));
    document.documentElement.append(this.#host);
    this.#window.addEventListener('resize',this.#onViewportChange,{passive:true});
    this.#window.visualViewport?.addEventListener('resize',this.#onViewportChange,{passive:true});
    this.#window.visualViewport?.addEventListener('scroll',this.#onViewportChange,{passive:true});
    this.#resizeObserver = new ResizeObserver(()=>this.reposition());
    this.#resizeObserver.observe(this.#launcher); this.#resizeObserver.observe(this.#card);
  }

  update(snapshot: InPageControllerSnapshot): void { this.#snapshot=snapshot; this.#pendingDock=undefined; this.#render(); }
  showError(message: string): void { this.#status.textContent=this.#copy.appName; this.#detail.textContent=message; }
  reposition(): void { if (this.#dragPointer !== undefined) return; this.#applyResolvedPosition(this.#pendingDock ?? this.#snapshot?.dock ?? DEFAULT_INPAGE_CONTROLLER_DOCK); }
  destroy(): void {
    if (this.#timer !== undefined) this.#window.clearTimeout(this.#timer);
    this.#resizeObserver.disconnect();
    this.#window.removeEventListener('resize',this.#onViewportChange);
    this.#window.visualViewport?.removeEventListener('resize',this.#onViewportChange);
    this.#window.visualViewport?.removeEventListener('scroll',this.#onViewportChange);
    this.#host.remove();
  }

  #viewport(): InPageViewport {
    const visual = this.#window.visualViewport;
    return visual === null || visual === undefined
      ? { width:this.#window.innerWidth, height:this.#window.innerHeight, offsetLeft:0, offsetTop:0 }
      : { width:visual.width, height:visual.height, offsetLeft:visual.offsetLeft, offsetTop:visual.offsetTop };
  }

  #activeRect(): DOMRect {
    return (this.#card.hidden ? this.#launcher : this.#card).getBoundingClientRect();
  }

  #applyResolvedPosition(dock: InPageControllerDock): void {
    const rect=this.#activeRect();
    const resolved=resolveInPageControllerPosition(dock,this.#viewport(),{width:rect.width || 48,height:rect.height || 44},this.#callbacks.collisionRects?.() ?? []);
    this.#host.style.left=`${resolved.left}px`; this.#host.style.top=`${resolved.top}px`; this.#host.dataset.dock=dock;
  }

  #chooseDock(dock: InPageControllerDock): void {
    this.#pendingDock=dock;
    this.#applyResolvedPosition(dock);
    this.#callbacks.setDock(dock);
  }

  #beginDrag(event: PointerEvent): void {
    if (!event.isTrusted || event.button !== 0 || this.#card.hidden) return;
    const rect=this.#card.getBoundingClientRect();
    this.#dragPointer=event.pointerId; this.#dragOffsetX=event.clientX-rect.left; this.#dragOffsetY=event.clientY-rect.top;
    this.#dragHandle.setPointerCapture(event.pointerId); this.#host.dataset.dragging='true'; event.preventDefault();
  }

  #continueDrag(event: PointerEvent): void {
    if (!event.isTrusted || event.pointerId !== this.#dragPointer) return;
    const viewport=this.#viewport(); const rect=this.#card.getBoundingClientRect();
    const left=clamp(event.clientX-this.#dragOffsetX,viewport.offsetLeft+8,viewport.offsetLeft+viewport.width-rect.width-8);
    const top=clamp(event.clientY-this.#dragOffsetY,viewport.offsetTop+8,viewport.offsetTop+viewport.height-rect.height-8);
    this.#host.style.left=`${Math.round(left)}px`; this.#host.style.top=`${Math.round(top)}px`; event.preventDefault();
  }

  #finishDrag(event: PointerEvent): void {
    if (!event.isTrusted || event.pointerId !== this.#dragPointer) return;
    const dock=dockInPageControllerFromPointer(event.clientX,event.clientY,this.#viewport());
    this.#dragHandle.releasePointerCapture(event.pointerId); this.#dragPointer=undefined; delete this.#host.dataset.dragging; event.preventDefault();
    this.#chooseDock(dock);
  }

  #cancelDrag(event: PointerEvent): void {
    if (event.pointerId !== this.#dragPointer) return;
    if (this.#dragHandle.hasPointerCapture(event.pointerId)) this.#dragHandle.releasePointerCapture(event.pointerId);
    this.#dragPointer=undefined; delete this.#host.dataset.dragging; this.reposition();
  }

  #moveByKeyboard(event: KeyboardEvent): void {
    if (!event.isTrusted) return;
    const dock=this.#pendingDock ?? this.#snapshot?.dock ?? DEFAULT_INPAGE_CONTROLLER_DOCK;
    let next: InPageControllerDock|undefined;
    if (event.key === 'ArrowUp') next=moveInPageControllerDock(dock,'up');
    else if (event.key === 'ArrowDown') next=moveInPageControllerDock(dock,'down');
    else if (event.key === 'ArrowLeft') next=moveInPageControllerDock(dock,'left');
    else if (event.key === 'ArrowRight') next=moveInPageControllerDock(dock,'right');
    else if (event.key === 'Home') next=DEFAULT_INPAGE_CONTROLLER_DOCK;
    if (next === undefined) return;
    event.preventDefault(); this.#chooseDock(next);
  }

  #render(): void {
    if (this.#snapshot === undefined) return;
    if (this.#timer !== undefined) { this.#window.clearTimeout(this.#timer); this.#timer=undefined; }
    const snapshot = advanceInPageControllerTemporal(this.#snapshot, Date.now());
    this.#launcher.hidden = !snapshot.collapsed;
    this.#card.hidden = snapshot.collapsed;
    this.#launcher.setAttribute('aria-expanded', String(!snapshot.collapsed));
    for (const [dock,element] of this.#dockButtons) element.setAttribute('aria-pressed',String(dock === snapshot.dock));
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
    this.reposition();
    const next = nextInPageTemporalRefreshDelay(this.#snapshot, Date.now());
    if (next !== null) this.#timer=this.#window.setTimeout(()=>{this.#timer=undefined;this.#render();},next);
  }
}
