export type DomHandle = unknown;

export interface ChatGptDomEnvironment {
  queryOne(selector: string): DomHandle | null;
  queryAll(selector: string): readonly DomHandle[];
  isVisible(handle: DomHandle): boolean;
  readText(handle: DomHandle): string;
  readComposer(handle: DomHandle): string;
  writeComposer(handle: DomHandle, message: string): void;
  getAttribute(handle: DomHandle, name: string): string | null;
  isDisabled(handle: DomHandle): boolean;
  click(handle: DomHandle): void;
  observe(callback: () => void): () => void;
  scrollToBottom(): void;
  now(): number;
  isoNow(): string;
}

function requireElement(handle: DomHandle): Element {
  if (!(handle instanceof Element)) throw new TypeError('DOM handle is not an Element');
  return handle;
}

function nativeValueSetter(element: HTMLInputElement | HTMLTextAreaElement): ((this: HTMLInputElement | HTMLTextAreaElement, value: string) => void) | undefined {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  return Object.getOwnPropertyDescriptor(prototype, 'value')?.set as ((this: HTMLInputElement | HTMLTextAreaElement, value: string) => void) | undefined;
}

export class BrowserChatGptDomEnvironment implements ChatGptDomEnvironment {
  readonly #document: Document;
  readonly #window: Window;

  constructor(documentValue: Document = document, windowValue: Window = window) {
    this.#document = documentValue;
    this.#window = windowValue;
  }

  queryOne(selector: string): DomHandle | null { return this.#document.querySelector(selector); }
  queryAll(selector: string): readonly DomHandle[] { return Array.from(this.#document.querySelectorAll(selector)); }

  isVisible(handle: DomHandle): boolean {
    const element = requireElement(handle);
    const style = this.#window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity || 1) !== 0
      && rect.width > 0
      && rect.height > 0;
  }

  readText(handle: DomHandle): string {
    const element = requireElement(handle);
    return ((element as HTMLElement).innerText || element.textContent || '').trim();
  }

  readComposer(handle: DomHandle): string {
    const element = requireElement(handle);
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) return element.value.trim();
    return ((element as HTMLElement).innerText || element.textContent || '').trim();
  }

  writeComposer(handle: DomHandle, message: string): void {
    const element = requireElement(handle);
    (element as HTMLElement).focus?.();
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      const setter = nativeValueSetter(element);
      if (setter === undefined) throw new Error('Native composer value setter was not found');
      setter.call(element, message);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    element.textContent = '';
    this.#document.execCommand('insertText', false, message);
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: message }));
  }

  getAttribute(handle: DomHandle, name: string): string | null { return requireElement(handle).getAttribute(name); }

  isDisabled(handle: DomHandle): boolean {
    const element = requireElement(handle) as HTMLButtonElement;
    return Boolean(element.disabled) || element.getAttribute('aria-disabled') === 'true';
  }

  click(handle: DomHandle): void { (requireElement(handle) as HTMLElement).click(); }

  observe(callback: () => void): () => void {
    const root = this.#document.documentElement;
    if (root === null) return () => undefined;
    const observer = new MutationObserver(callback);
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-disabled', 'aria-label', 'data-testid', 'disabled', 'hidden'],
    });
    return () => observer.disconnect();
  }

  scrollToBottom(): void {
    this.#window.scrollTo({ top: this.#document.documentElement.scrollHeight, behavior: 'smooth' });
  }

  now(): number { return Date.now(); }
  isoNow(): string { return new Date().toISOString(); }
}
