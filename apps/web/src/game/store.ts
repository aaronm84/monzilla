import { migrateSave, newMemberSave, type MemberSave } from '@monzilla/core';

/**
 * Where a member's save lives. The local store is the fallback and also the
 * cache in front of Firestore, so the game always starts instantly.
 */
export interface SaveBackend {
  readonly kind: 'local' | 'firebase';
  load(): Promise<MemberSave | null>;
  save(save: MemberSave): Promise<void>;
  /** Called when a newer save arrives from another device. */
  onRemoteChange?(handler: (save: MemberSave) => void): () => void;
}

const LOCAL_KEY = 'monzilla:save:v1';

export class LocalBackend implements SaveBackend {
  readonly kind = 'local' as const;

  async load(): Promise<MemberSave | null> {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (!raw) return null;
      return migrateSave(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  async save(save: MemberSave): Promise<void> {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(save));
    } catch {
      // Private mode or full storage: the game keeps running in memory.
    }
  }
}

type Listener = (save: MemberSave) => void;

/**
 * Single in-memory source of truth for the running game. Scenes read from
 * it and call update(); writes are persisted with a short debounce so a
 * flurry of taps becomes one write.
 */
export class GameStore {
  private current: MemberSave;
  private listeners = new Set<Listener>();
  private pending: ReturnType<typeof setTimeout> | null = null;
  private backends: SaveBackend[];

  constructor(initial: MemberSave, backends: SaveBackend[]) {
    this.current = initial;
    this.backends = backends;
    for (const b of backends) {
      b.onRemoteChange?.((remote) => {
        if (remote.updatedAt > this.current.updatedAt) {
          this.current = remote;
          this.emit();
        }
      });
    }
  }

  get save(): MemberSave {
    return this.current;
  }

  update(fn: (save: MemberSave) => MemberSave): MemberSave {
    this.current = { ...fn(this.current), updatedAt: Date.now() };
    this.emit();
    this.schedulePersist();
    return this.current;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Write immediately (used when leaving the page). */
  async flush(): Promise<void> {
    if (this.pending) {
      clearTimeout(this.pending);
      this.pending = null;
    }
    await Promise.all(this.backends.map((b) => b.save(this.current)));
  }

  private emit() {
    for (const l of this.listeners) l(this.current);
  }

  private schedulePersist() {
    if (this.pending) clearTimeout(this.pending);
    this.pending = setTimeout(() => {
      this.pending = null;
      void this.flush();
    }, 400);
  }
}

/** Build the store: local first (instant), Firebase layered on when configured. */
export async function openStore(extra: SaveBackend | null): Promise<GameStore> {
  const local = new LocalBackend();
  const backends: SaveBackend[] = extra ? [local, extra] : [local];

  let save = await local.load();
  if (extra) {
    const remote = await extra.load().catch(() => null);
    if (remote && (!save || remote.updatedAt >= save.updatedAt)) save = remote;
  }
  if (!save) {
    const memberId = `m_${Math.random().toString(36).slice(2, 10)}`;
    save = newMemberSave(memberId, 'Explorer', `${memberId}:${Date.now()}`);
  }

  const store = new GameStore(save, backends);
  window.addEventListener('pagehide', () => void store.flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void store.flush();
  });
  await store.flush();
  return store;
}
