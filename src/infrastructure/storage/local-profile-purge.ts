import { LOCAL_PURGE_MARKER } from "./preferences";
import { suspendLocalWrites } from "./local-write-guard";
import { PROFILE_EPOCH_KEY } from "../profile/operation";

export const LOCAL_PURGE_CONFIRMATION = "DELETE LOCAL PROFILE";
const KNOWN_DATABASES = [
  "lexis.writing.v1",
  "lexis.media.local.v1",
  "lexis.profile-backup.v1",
];
const PURGE_TIMEOUT_MS = 5000;

export interface PurgeKeyStore {
  keys(): string[];
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}
export interface PurgeWorker {
  scope: string;
  scripts: string[];
  prepare(): Promise<void>;
  unregister(): Promise<boolean>;
}
/** Browser capabilities are injected so failure/retry and resource boundaries are testable. */
export interface LocalProfileEnvironment {
  origin: string;
  local: PurgeKeyStore;
  session: PurgeKeyStore;
  databases(): Promise<{ names: string[]; exhaustive: boolean }>;
  deleteDatabase(name: string): Promise<void>;
  caches(): Promise<string[]>;
  deleteCache(name: string): Promise<boolean>;
  workers(): Promise<PurgeWorker[]>;
  prepare(): Promise<void>;
  /** Nonprivate document generation, injectable for deterministic recovery checks. */
  newEpoch?(): string;
}
export interface LocalProfilePreview {
  localKeys: string[];
  sessionKeys: string[];
  databases: string[];
  databaseDiscoveryComplete: boolean;
  caches: string[];
  serviceWorkers: string[];
  warnings: string[];
  pending: boolean;
  deletionStatus: "deleting" | "partial" | "complete" | "unknown" | null;
}
export interface LocalProfilePurgeResult {
  complete: boolean;
  deleted: LocalProfilePreview;
  failures: string[];
  remaining: LocalProfilePreview;
}

function ownKey(name: string) {
  return name.startsWith("lexis.");
}
function privateLocalKey(name: string) {
  // The generation token contains no learner data and survives deletion so a
  // frozen pre-deletion page cannot adopt the fresh profile's first write.
  return (
    ownKey(name) && name !== LOCAL_PURGE_MARKER && name !== PROFILE_EPOCH_KEY
  );
}
function ownCache(name: string) {
  return name.startsWith("lexis-") || ownKey(name);
}
function ownWorker(
  worker: Pick<PurgeWorker, "scripts" | "scope">,
  origin: string,
) {
  if (!worker.scripts.length) return false;
  try {
    if (new URL(worker.scope).origin !== origin) return false;
  } catch {
    return false;
  }
  return worker.scripts.every((script) => {
    try {
      const url = new URL(script);
      return (
        url.origin === origin &&
        url.pathname === "/sw.js" &&
        !url.search &&
        !url.hash
      );
    } catch {
      return false;
    }
  });
}
function emptyPreview(): LocalProfilePreview {
  return {
    localKeys: [],
    sessionKeys: [],
    databases: [],
    databaseDiscoveryComplete: true,
    caches: [],
    serviceWorkers: [],
    warnings: [],
    pending: false,
    deletionStatus: null,
  };
}
function unique(values: string[]) {
  return [...new Set(values)].sort();
}
function timeout<T>(operation: Promise<T>, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(message)),
      PURGE_TIMEOUT_MS,
    );
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function previewLocalProfile(
  environment = browserPurgeEnvironment(),
): Promise<LocalProfilePreview> {
  const result = emptyPreview();
  try {
    result.localKeys = environment.local.keys().filter(privateLocalKey).sort();
    const raw = environment.local.get(LOCAL_PURGE_MARKER);
    result.pending = raw !== null;
    if (raw !== null) {
      let status: unknown;
      try {
        status = (JSON.parse(raw) as { status?: unknown } | null)?.status;
      } catch {
        /* Keep an unreadable marker blocking writes. */
      }
      result.deletionStatus =
        status === "deleting" || status === "partial" || status === "complete"
          ? status
          : "unknown";
    }
  } catch {
    result.warnings.push("Local browser storage could not be inspected.");
  }
  try {
    result.sessionKeys = environment.session.keys().filter(ownKey).sort();
  } catch {
    result.warnings.push("Temporary context storage could not be inspected.");
  }
  try {
    const databases = await timeout(
      environment.databases(),
      "Database inspection timed out.",
    );
    result.databases = unique(databases.names.filter(ownKey));
    result.databaseDiscoveryComplete = databases.exhaustive;
    if (!databases.exhaustive)
      result.warnings.push(
        "This browser exposes only known LEXIS database stores; unknown legacy databases cannot be enumerated.",
      );
  } catch {
    result.databaseDiscoveryComplete = false;
    result.warnings.push(
      "Local document and media databases could not be inspected.",
    );
  }
  try {
    result.caches = (
      await timeout(environment.caches(), "Cache inspection timed out.")
    )
      .filter(ownCache)
      .sort();
  } catch {
    result.warnings.push("Offline caches could not be inspected.");
  }
  try {
    result.serviceWorkers = (
      await timeout(environment.workers(), "Worker inspection timed out.")
    )
      .filter((worker) => ownWorker(worker, environment.origin))
      .map((worker) => worker.scope)
      .sort();
  } catch {
    result.warnings.push(
      "Offline worker registrations could not be inspected.",
    );
  }
  return result;
}

/** No cloud/account removal. Keep the durable marker until a separately requested fresh start. */
export async function purgeLocalProfile(
  confirmation: string,
  environment = browserPurgeEnvironment(),
): Promise<LocalProfilePurgeResult> {
  if (confirmation !== LOCAL_PURGE_CONFIRMATION)
    throw new Error(
      `Type ${LOCAL_PURGE_CONFIRMATION} to remove this browser's LEXIS profile.`,
    );
  const deleted = emptyPreview();
  const failures: string[] = [];
  try {
    environment.local.set(
      LOCAL_PURGE_MARKER,
      JSON.stringify({ version: 1, status: "deleting" }),
    );
  } catch {
    throw new Error(
      "Deletion could not start because its safety marker could not be saved. No data was removed.",
    );
  }
  suspendLocalWrites();
  try {
    await timeout(
      environment.prepare(),
      "An open workspace did not finish stopping. Close other LEXIS tabs and retry deletion.",
    );
  } catch {
    failures.push(
      "Open workspaces could not be stopped safely. Close other LEXIS tabs and retry; deletion remains paused.",
    );
    return {
      complete: false,
      deleted,
      failures,
      remaining: await previewLocalProfile(environment),
    };
  }
  const attempt = async (
    action: () => void | Promise<unknown>,
    message: string,
  ) => {
    try {
      await timeout(Promise.resolve().then(action), message);
    } catch {
      failures.push(message);
    }
  };
  await attempt(async () => {
    for (const worker of await environment.workers())
      if (ownWorker(worker, environment.origin)) {
        await timeout(
          worker.prepare(),
          "The offline worker did not finish stopping its cache writes.",
        );
        if (!(await worker.unregister()))
          throw new Error("Worker removal refused.");
        deleted.serviceWorkers.push(worker.scope);
      }
  }, "The LEXIS offline worker could not be removed. Close other LEXIS tabs and retry.");
  // Stopped workers cannot repopulate caches while they are removed below.
  await attempt(() => {
    for (const key of environment.local.keys())
      if (privateLocalKey(key)) {
        environment.local.remove(key);
        deleted.localKeys.push(key);
      }
  }, "Some local profile records could not be removed.");
  await attempt(() => {
    for (const key of environment.session.keys())
      if (ownKey(key)) {
        environment.session.remove(key);
        deleted.sessionKeys.push(key);
      }
  }, "Some temporary context records could not be removed.");
  let databaseList: { names: string[]; exhaustive: boolean } | undefined;
  await attempt(async () => {
    databaseList = await environment.databases();
  }, "Local database stores could not be listed.");
  if (databaseList) {
    deleted.databaseDiscoveryComplete = databaseList.exhaustive;
    for (const name of unique(databaseList.names.filter(ownKey)))
      await attempt(async () => {
        await environment.deleteDatabase(name);
        deleted.databases.push(name);
      }, `Local database ${name} is still present or blocked. Close other LEXIS tabs and retry.`);
  }
  await attempt(async () => {
    for (const name of await environment.caches())
      if (ownCache(name)) {
        if (!(await environment.deleteCache(name)))
          throw new Error("Cache removal refused.");
        deleted.caches.push(name);
      }
  }, "Some LEXIS offline caches could not be removed.");
  const remaining = await previewLocalProfile(environment);
  if (!remaining.databaseDiscoveryComplete)
    remaining.databases = remaining.databases.filter(
      (name) => !deleted.databases.includes(name),
    );
  if (!remaining.databaseDiscoveryComplete)
    failures.push(
      "Known LEXIS databases were checked, but this browser cannot verify every legacy store. Clear this site's data in browser settings for a fully verified fresh start.",
    );
  const unreadable = remaining.warnings.filter(
    (warning) => !warning.startsWith("This browser exposes only known"),
  );
  if (unreadable.length) failures.push(...unreadable);
  if (
    remaining.localKeys.length ||
    remaining.sessionKeys.length ||
    remaining.databases.length ||
    remaining.caches.length ||
    remaining.serviceWorkers.length
  )
    failures.push(
      "Some LEXIS data remains. Keep other LEXIS tabs closed and retry deletion.",
    );
  const complete = failures.length === 0;
  try {
    environment.local.set(
      LOCAL_PURGE_MARKER,
      JSON.stringify({ version: 1, status: complete ? "complete" : "partial" }),
    );
  } catch {
    failures.push(
      "Deletion status could not be confirmed. Keep this page open and retry before starting a new profile.",
    );
  }
  return {
    complete: complete && failures.length === 0,
    deleted,
    failures,
    remaining,
  };
}

/** Call immediately before a full navigation, never to unlock a partially deleted profile. */
export function restartLocalProfile(
  environment = browserPurgeEnvironment(),
): void {
  const original = environment.local.get(LOCAL_PURGE_MARKER);
  let marker: unknown;
  try {
    marker = JSON.parse(original ?? "null");
  } catch {
    throw new Error(
      "Finish local deletion before starting a fresh profile. Its unreadable safety marker has been preserved.",
    );
  }
  if (
    !marker ||
    typeof marker !== "object" ||
    !("version" in marker) ||
    marker.version !== 1 ||
    !("status" in marker) ||
    marker.status !== "complete"
  )
    throw new Error("Finish local deletion before starting a fresh profile.");
  // Write and verify the new generation while the durable deletion barrier is
  // still present. Clearing it first would let a frozen old tab recreate data.
  const previousEpoch = environment.local.get(PROFILE_EPOCH_KEY);
  let epoch: string;
  try {
    epoch = environment.newEpoch?.() ?? crypto.randomUUID();
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(
        epoch,
      ) ||
      epoch === previousEpoch
    )
      throw new Error("A fresh generation could not be created.");
    environment.local.set(PROFILE_EPOCH_KEY, epoch);
    if (environment.local.get(PROFILE_EPOCH_KEY) !== epoch)
      throw new Error("The fresh generation could not be verified.");
  } catch {
    throw new Error(
      "The fresh profile could not be prepared safely. Deletion remains paused; retry before reopening ordinary work.",
    );
  }
  if (environment.local.get(LOCAL_PURGE_MARKER) !== original)
    throw new Error(
      "Local deletion changed while preparing the fresh profile. Its safety marker remains in place; retry deletion before continuing.",
    );
  environment.local.remove(LOCAL_PURGE_MARKER);
  if (environment.local.get(LOCAL_PURGE_MARKER) !== null)
    throw new Error(
      "The deletion safety marker could not be cleared. Retry starting a fresh profile before reopening ordinary work.",
    );
}

function keyStore(storage: Storage): PurgeKeyStore {
  return {
    keys: () =>
      Array.from({ length: storage.length }, (_, index) =>
        storage.key(index),
      ).filter((key): key is string => key !== null),
    get: (key) => storage.getItem(key),
    set: (key, value) => storage.setItem(key, value),
    remove: (key) => storage.removeItem(key),
  };
}
export function browserPurgeEnvironment(): LocalProfileEnvironment {
  const databaseFactory = window.indexedDB;
  return {
    origin: window.location.origin,
    local: keyStore(window.localStorage),
    session: keyStore(window.sessionStorage),
    databases: async () => {
      if (!databaseFactory) return { names: [], exhaustive: true };
      if (typeof databaseFactory.databases !== "function")
        return { names: [...KNOWN_DATABASES], exhaustive: false };
      return {
        names: (await databaseFactory.databases()).flatMap((database) =>
          database.name ? [database.name] : [],
        ),
        exhaustive: true,
      };
    },
    deleteDatabase: (name) =>
      new Promise((resolve, reject) => {
        if (!databaseFactory) {
          resolve();
          return;
        }
        const request = databaseFactory.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error("Database removal failed."));
        // A versionchange handler may close another tab's database. Let it settle until timeout.
      }),
    caches: async () => ("caches" in window ? window.caches.keys() : []),
    deleteCache: (name) => window.caches.delete(name),
    workers: async () => {
      if (!("serviceWorker" in navigator)) return [];
      return (await navigator.serviceWorker.getRegistrations()).map(
        (registration) => ({
          scope: registration.scope,
          scripts: [
            registration.active,
            registration.installing,
            registration.waiting,
          ].flatMap((worker) => (worker ? [worker.scriptURL] : [])),
          prepare: async () => {
            if (
              !ownWorker(
                {
                  scope: registration.scope,
                  scripts: [
                    registration.active,
                    registration.installing,
                    registration.waiting,
                  ].flatMap((worker) => (worker ? [worker.scriptURL] : [])),
                },
                window.location.origin,
              )
            )
              throw new Error(
                "The offline registration changed. Inspect it again before deletion.",
              );
            await Promise.all(
              [
                registration.active,
                registration.installing,
                registration.waiting,
              ]
                .filter((worker): worker is ServiceWorker => worker !== null)
                .map(
                  (worker) =>
                    new Promise<void>((resolve, reject) => {
                      const channel = new MessageChannel();
                      const timer = setTimeout(() => {
                        channel.port1.close();
                        channel.port2.close();
                        reject(
                          new Error(
                            "The offline worker did not acknowledge cleanup.",
                          ),
                        );
                      }, PURGE_TIMEOUT_MS);
                      channel.port1.onmessage = (
                        event: MessageEvent<unknown>,
                      ) => {
                        const data = event.data;
                        if (
                          !data ||
                          typeof data !== "object" ||
                          !("type" in data) ||
                          data.type !== "LEXIS_PURGE_READY"
                        )
                          return;
                        clearTimeout(timer);
                        channel.port1.close();
                        channel.port2.close();
                        resolve();
                      };
                      try {
                        worker.postMessage({ type: "LEXIS_PREPARE_PURGE" }, [
                          channel.port2,
                        ]);
                      } catch (error) {
                        clearTimeout(timer);
                        channel.port1.close();
                        channel.port2.close();
                        reject(error);
                      }
                    }),
                ),
            );
          },
          unregister: () => {
            if (
              !ownWorker(
                {
                  scope: registration.scope,
                  scripts: [
                    registration.active,
                    registration.installing,
                    registration.waiting,
                  ].flatMap((worker) => (worker ? [worker.scriptURL] : [])),
                },
                window.location.origin,
              )
            )
              throw new Error(
                "The offline registration changed. Inspect it again before deletion.",
              );
            return registration.unregister();
          },
        }),
      );
    },
    prepare: async () => {
      const pending: Promise<unknown>[] = [];
      window.dispatchEvent(
        new CustomEvent("lexis-local-purge", {
          detail: {
            register: (promise: Promise<unknown>) => pending.push(promise),
          },
        }),
      );
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("lexis-local-purge");
        channel.postMessage({ type: "prepare" });
        channel.close();
      }
      await Promise.all(pending);
    },
  };
}
