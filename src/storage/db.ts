// The sketchbook's shelf: saved sheets in IndexedDB, on this device only. Every
// call is wrapped, so blocked storage (some private browsing modes, or a browser
// set to refuse site data) just means there is no sketchbook; the game carries on.

const DB_NAME = 'vivi-fashion-dresses';
const STORE = 'sheets';
const VERSION = 1;

export interface SavedSheet {
  readonly id: number;
  /** When it was saved (ms since the epoch). */
  readonly created: number;
  /** The full 1200 × 3000 PNG. */
  readonly image: Blob;
  /** A small PNG for the sketchbook's grid. */
  readonly thumb: Blob;
}

export type SheetSummary = Omit<SavedSheet, 'image'>;

/**
 * What is stored: the PNGs as plain bytes. WebKit's private and ephemeral sessions
 * refuse Blobs in IndexedDB ("Error preparing Blob/File data") but take ArrayBuffers.
 */
interface Stored {
  readonly id: number;
  readonly created: number;
  readonly image: ArrayBuffer;
  readonly thumb: ArrayBuffer;
}

const png = (bytes: ArrayBuffer): Blob => new Blob([bytes], { type: 'image/png' });

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
  });
}

export class Sketchbook {
  private readonly db: IDBDatabase;

  private constructor(db: IDBDatabase) {
    this.db = db;
  }

  /** Open the sketchbook, or null when this device won't keep one. */
  static async open(): Promise<Sketchbook | null> {
    try {
      const idb = globalThis.indexedDB;
      if (!idb) return null;
      const req = idb.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      };
      const book = new Sketchbook(await request(req));
      // Some private modes open the database but refuse to write: try one first.
      const probe = await book.add(new Blob(), new Blob());
      if (probe === null || !(await book.remove(probe))) return null;
      return book;
    } catch {
      return null;
    }
  }

  /** Every saved sheet, newest first, without the full images. */
  async list(): Promise<SheetSummary[]> {
    try {
      const all = await request(this.db.transaction(STORE, 'readonly').objectStore(STORE).getAll() as IDBRequest<Stored[]>);
      return all.map(({ id, created, thumb }) => ({ id, created, thumb: png(thumb) })).sort((a, b) => b.created - a.created || b.id - a.id);
    } catch {
      return [];
    }
  }

  async image(id: number): Promise<Blob | null> {
    try {
      const sheet = await request(this.db.transaction(STORE, 'readonly').objectStore(STORE).get(id) as IDBRequest<Stored | undefined>);
      return sheet ? png(sheet.image) : null;
    } catch {
      return null;
    }
  }

  /** Save a sheet; its id, or null if it couldn't be kept (storage full, say). */
  async add(image: Blob, thumb: Blob): Promise<number | null> {
    try {
      const [imageBytes, thumbBytes] = await Promise.all([image.arrayBuffer(), thumb.arrayBuffer()]);
      const tx = this.db.transaction(STORE, 'readwrite');
      const id = await request(tx.objectStore(STORE).add({ created: Date.now(), image: imageBytes, thumb: thumbBytes }));
      await done(tx);
      return id as number;
    } catch {
      return null;
    }
  }

  async remove(id: number): Promise<boolean> {
    try {
      const tx = this.db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      await done(tx);
      return true;
    } catch {
      return false;
    }
  }

  async clear(): Promise<boolean> {
    try {
      const tx = this.db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      await done(tx);
      return true;
    } catch {
      return false;
    }
  }
}
