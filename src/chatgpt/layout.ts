import type { InPageCollisionRect } from '../presentation/inpage-placement.ts';

export const CHATGPT_LAYOUT_SELECTOR_REGISTRY = Object.freeze({
  threadBottom: '#thread-bottom-container',
  composerSurface: '[data-composer-surface="true"]',
});

function rectFor(element: Element, windowValue: Window): InPageCollisionRect | null {
  const style = windowValue.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) === 0) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return Object.freeze({ left:rect.left, top:rect.top, right:rect.right, bottom:rect.bottom });
}

export class BrowserChatGptLayoutAdvisor {
  readonly #document: Document;
  readonly #window: Window;
  #resizeObserver: ResizeObserver | undefined;
  #listener: (() => void) | undefined;
  #observedElements: readonly Element[] = Object.freeze([]);

  constructor(documentValue: Document = document, windowValue: Window = window) {
    this.#document = documentValue;
    this.#window = windowValue;
  }

  collisionRects(): readonly InPageCollisionRect[] {
    const primary = this.#document.querySelector(CHATGPT_LAYOUT_SELECTOR_REGISTRY.threadBottom);
    if (primary !== null) {
      const rect = rectFor(primary, this.#window);
      if (rect !== null) return Object.freeze([rect]);
    }
    const fallback = this.#document.querySelector(CHATGPT_LAYOUT_SELECTOR_REGISTRY.composerSurface);
    if (fallback === null) return Object.freeze([]);
    const rect = rectFor(fallback, this.#window);
    return rect === null ? Object.freeze([]) : Object.freeze([rect]);
  }

  refresh(): void {
    if (this.#resizeObserver === undefined) return;
    const elements = this.#layoutElements();
    if (elements.length === this.#observedElements.length && elements.every((element, index) => element === this.#observedElements[index])) return;
    this.#resizeObserver.disconnect();
    for (const element of elements) this.#resizeObserver.observe(element);
    this.#observedElements = Object.freeze([...elements]);
    this.#listener?.();
  }

  observe(listener: () => void): () => void {
    this.#listener = listener;
    this.#resizeObserver = new ResizeObserver(() => listener());
    this.#observedElements = Object.freeze([]);
    this.refresh();
    return () => {
      this.#resizeObserver?.disconnect();
      this.#resizeObserver = undefined;
      this.#listener = undefined;
      this.#observedElements = Object.freeze([]);
    };
  }

  #layoutElements(): readonly Element[] {
    const primary = this.#document.querySelector(CHATGPT_LAYOUT_SELECTOR_REGISTRY.threadBottom);
    if (primary !== null) return Object.freeze([primary]);
    const fallback = this.#document.querySelector(CHATGPT_LAYOUT_SELECTOR_REGISTRY.composerSurface);
    return fallback === null ? Object.freeze([]) : Object.freeze([fallback]);
  }
}
