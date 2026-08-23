import type { ChatGptAdapterSnapshot } from '../chatgpt/types.ts';

export type ChatGptSnapshotListener = (snapshot: ChatGptAdapterSnapshot) => void;

export class ChatGptObservationHub {
  readonly #latest = new Map<number, ChatGptAdapterSnapshot>();
  readonly #listeners = new Map<number, Set<ChatGptSnapshotListener>>();

  note(tabId: number, snapshot: ChatGptAdapterSnapshot): void {
    this.#latest.set(tabId, snapshot);
    for (const listener of this.#listeners.get(tabId) ?? []) listener(snapshot);
  }

  latest(tabId: number): ChatGptAdapterSnapshot | undefined { return this.#latest.get(tabId); }

  subscribe(tabId: number, listener: ChatGptSnapshotListener): () => void {
    let listeners = this.#listeners.get(tabId);
    if (listeners === undefined) {
      listeners = new Set();
      this.#listeners.set(tabId, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners?.delete(listener);
      if (listeners?.size === 0) this.#listeners.delete(tabId);
    };
  }
}
