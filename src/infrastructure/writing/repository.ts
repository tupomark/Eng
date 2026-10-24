import {
  assertWritingWorkspace,
  emptyWritingWorkspace,
  type WritingWorkspace,
} from "@/domain/writing/workspace";
import { assertLocalWritesAllowed } from "@/infrastructure/materials/purge-signal";

const DATABASE = "lexis.writing.v1";
const STORE = "workspaces";
export const WRITING_CHANGED_EVENT = "lexis-writing-changed";

/** Commands execute in a native read/write transaction, preserving concurrent branches. */
export class WritingRepository {
  private database: Promise<IDBDatabase> | null = null;
  private stopped = false;
  private transactions = new Set<IDBTransaction>();
  constructor(private readonly owner = "local") {}

  /** Pause before deletion; pending opens and commands cannot recreate this DB. */
  async stopForLocalPurge(): Promise<void> {
    this.stopped = true;
    for (const transaction of this.transactions) {
      try {
        transaction.abort();
      } catch {
        /* A completed transaction is already durable and will be deleted. */
      }
    }
    try {
      (await this.database)?.close();
    } catch {
      /* A failed open has no live handle. */
    }
    this.database = null;
  }

  private assertActive() {
    if (this.stopped)
      throw new Error(
        "Writing is paused for local data removal. Reopen LEXIS after deletion completes.",
      );
    assertLocalWritesAllowed();
  }

  private open(): Promise<IDBDatabase> {
    this.assertActive();
    this.database ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      let failed = false;
      const fail = (message: string) => {
        failed = true;
        reject(new Error(message));
      };
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => {
        const database = request.result;
        if (failed || this.stopped) {
          database.close();
          if (this.stopped)
            reject(
              new Error("Writing storage was closed for local data removal."),
            );
          return;
        }
        database.onversionchange = () => {
          database.close();
          this.database = null;
        };
        resolve(database);
      };
      request.onerror = () =>
        fail(
          "Writing storage could not be opened. Your existing data has been kept.",
        );
      request.onblocked = () =>
        fail("Close other LEXIS tabs to finish opening writing storage.");
    });
    return this.database.catch((error) => {
      this.database = null;
      throw error;
    });
  }

  async read(): Promise<WritingWorkspace> {
    const database = await this.open();
    this.assertActive();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, "readonly");
      const request = transaction.objectStore(STORE).get(this.owner);
      request.onsuccess = () => {
        try {
          const value: unknown =
            request.result ?? emptyWritingWorkspace(this.owner);
          assertWritingWorkspace(value, this.owner);
          resolve(value);
        } catch (error) {
          reject(error);
        }
      };
      request.onerror = () =>
        reject(
          new Error(
            "Writing data could not be read. Existing data is unchanged.",
          ),
        );
    });
  }

  async command(
    change: (current: WritingWorkspace) => WritingWorkspace,
  ): Promise<WritingWorkspace> {
    const database = await this.open();
    this.assertActive();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      this.transactions.add(transaction);
      const store = transaction.objectStore(STORE);
      const request = store.get(this.owner);
      let next: WritingWorkspace;
      let commandError: unknown;
      request.onsuccess = () => {
        try {
          this.assertActive();
          const current: unknown =
            request.result ?? emptyWritingWorkspace(this.owner);
          assertWritingWorkspace(current, this.owner);
          next = change(current);
          assertWritingWorkspace(next, this.owner);
          store.put(next, this.owner);
        } catch (error) {
          commandError = error;
          transaction.abort();
        }
      };
      transaction.oncomplete = () => {
        this.transactions.delete(transaction);
        if (this.stopped) {
          reject(new Error("Writing was paused for local data removal."));
          return;
        }
        window.dispatchEvent(new Event(WRITING_CHANGED_EVENT));
        // No private draft text is broadcast to other tabs.
        if (typeof BroadcastChannel !== "undefined") {
          const channel = new BroadcastChannel(WRITING_CHANGED_EVENT);
          channel.postMessage({ owner: this.owner });
          channel.close();
        }
        resolve(next!);
      };
      transaction.onabort = transaction.onerror = () => {
        this.transactions.delete(transaction);
        reject(
          commandError ??
            new Error(
              "This writing change could not be saved. Your text is still in the editor; download a copy and retry.",
            ),
        );
      };
    });
  }

  /** Export remains possible when a newer/corrupt workspace cannot be validated. */
  async rawBackup(): Promise<unknown> {
    const database = await this.open();
    this.assertActive();
    return new Promise((resolve, reject) => {
      const request = database
        .transaction(STORE, "readonly")
        .objectStore(STORE)
        .get(this.owner);
      request.onsuccess = () =>
        resolve(request.result ?? emptyWritingWorkspace(this.owner));
      request.onerror = () =>
        reject(new Error("Writing data could not be exported."));
    });
  }
}
