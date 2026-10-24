import {
  initialListeningSession,
  MEDIA_LIMITS,
  parseListeningSession,
  type ListeningSession,
} from "@/domain/listening/session";
import { assertLocalWritesAllowed } from "@/infrastructure/materials/purge-signal";

export const MEDIA_DATABASE_NAME = "lexis.media.local.v1";
export const LISTENING_SAMPLE_ID = "lexis-original-coast-v1";
export interface LocalMediaAsset {
  id: string;
  owner: "local";
  title: string;
  fileName: string;
  mime: string;
  kind: "audio" | "video";
  byteLength: number;
  createdAt: string;
  blob: Blob;
}

export function sniffMedia(
  bytes: Uint8Array,
  fileName: string,
  declaredType: string,
): { mime: string; kind: "audio" | "video" } {
  const word = (offset: number, size: number) =>
    new TextDecoder().decode(bytes.subarray(offset, offset + size));
  if (bytes.length >= 12 && word(0, 4) === "RIFF" && word(8, 4) === "WAVE")
    return { mime: "audio/wav", kind: "audio" };
  if (word(0, 3) === "ID3" || (bytes[0] === 255 && (bytes[1] & 0xe0) === 0xe0))
    return { mime: "audio/mpeg", kind: "audio" };
  if (word(0, 4) === "OggS") return { mime: "audio/ogg", kind: "audio" };
  if (bytes.length >= 12 && word(4, 4) === "ftyp")
    return /\.m4a$/iu.test(fileName) || declaredType === "audio/mp4"
      ? { mime: "audio/mp4", kind: "audio" }
      : { mime: "video/mp4", kind: "video" };
  if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  )
    return declaredType.startsWith("audio/")
      ? { mime: "audio/webm", kind: "audio" }
      : { mime: "video/webm", kind: "video" };
  throw new Error(
    "This is not a supported audio/video file. Choose WAV, MP3, Ogg, M4A/MP4 or WebM supported by your browser.",
  );
}

function openDatabase(): Promise<IDBDatabase> {
  assertLocalWritesAllowed();
  return new Promise((resolve, reject) => {
    let failed = false;
    const request = indexedDB.open(MEDIA_DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("assets", { keyPath: "id" });
      db.createObjectStore("sessions", { keyPath: "id" });
    };
    request.onerror = () => {
      failed = true;
      reject(
        new Error(
          "Private media storage is unavailable. Your file has not been uploaded.",
        ),
      );
    };
    request.onblocked = () => {
      failed = true;
      reject(
        new Error("Close another LEXIS tab before opening media storage."),
      );
    };
    request.onsuccess = () => {
      try {
        assertLocalWritesAllowed();
      } catch (cause) {
        request.result.close();
        reject(cause);
        return;
      }
      if (failed) request.result.close();
      else resolve(request.result);
    };
  });
}

function checkAsset(value: unknown): LocalMediaAsset {
  if (!value || typeof value !== "object")
    throw new Error("A local media file could not be opened.");
  const asset = value as LocalMediaAsset;
  if (
    asset.owner !== "local" ||
    typeof asset.id !== "string" ||
    asset.id.length > 200 ||
    typeof asset.title !== "string" ||
    asset.title.length > 300 ||
    typeof asset.fileName !== "string" ||
    asset.fileName.length > 500 ||
    !["audio", "video"].includes(asset.kind) ||
    typeof asset.mime !== "string" ||
    asset.mime.length > 100 ||
    !Number.isFinite(Date.parse(asset.createdAt)) ||
    !(asset.blob instanceof Blob) ||
    asset.byteLength !== asset.blob.size ||
    asset.byteLength > MEDIA_LIMITS.maxFileBytes ||
    asset.byteLength <= 0
  )
    throw new Error(
      "A local media file is unreadable. Its data has not been replaced.",
    );
  return asset;
}

export async function listLocalMedia(): Promise<LocalMediaAsset[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("assets", "readonly");
    const request = transaction.objectStore("assets").getAll();
    request.onsuccess = () => {
      try {
        resolve((request.result as unknown[]).map(checkAsset));
      } catch (cause) {
        reject(cause);
      }
    };
    request.onerror = () =>
      reject(new Error("Your media list could not be opened."));
    transaction.oncomplete = () => database.close();
    transaction.onabort = () => {
      database.close();
      reject(new Error("Your media list could not be opened."));
    };
  });
}

export async function saveLocalMedia(
  file: File,
  canPlay: (mime: string) => boolean,
  verifyPlayable?: (blob: Blob, kind: "audio" | "video") => Promise<void>,
): Promise<LocalMediaAsset> {
  if (!file.size || file.size > MEDIA_LIMITS.maxFileBytes)
    throw new Error("Choose a nonempty audio/video file up to 25 MB.");
  const type = sniffMedia(
    new Uint8Array(await file.slice(0, 64).arrayBuffer()),
    file.name,
    file.type,
  );
  if (!canPlay(type.mime))
    throw new Error(
      "This browser cannot play that media type. Convert a copy to WAV/MP3 or a supported MP4 before importing.",
    );
  if (verifyPlayable)
    await verifyPlayable(file.slice(0, file.size, type.mime), type.kind);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  const id =
    "media-" +
    Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  const asset: LocalMediaAsset = {
    id,
    owner: "local",
    title: file.name.replace(/\.[^.]+$/u, "").slice(0, 300),
    fileName: file.name.slice(0, 500),
    mime: type.mime,
    kind: type.kind,
    byteLength: file.size,
    createdAt: new Date().toISOString(),
    blob: file.slice(0, file.size, type.mime),
  };
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("assets", "readwrite");
    const store = transaction.objectStore("assets");
    let result = asset;
    let failure =
      "The file could not be saved on this device. Your existing media is intact.";
    const existing = store.get(id);
    existing.onsuccess = () => {
      try {
        assertLocalWritesAllowed();
      } catch {
        transaction.abort();
        return;
      }
      if (existing.result) {
        try {
          result = checkAsset(existing.result);
        } catch {
          transaction.abort();
        }
        return;
      }
      const count = store.count();
      count.onsuccess = () => {
        try {
          assertLocalWritesAllowed();
        } catch {
          transaction.abort();
          return;
        }
        if (count.result >= MEDIA_LIMITS.maxFiles) {
          failure =
            "This device supports 10 media files. Remove one before adding another.";
          transaction.abort();
        } else store.add(asset);
      };
    };
    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onabort = () => {
      database.close();
      reject(new Error(failure));
    };
    transaction.onerror = () => {
      database.close();
      reject(new Error(failure));
    };
  });
}

export async function loadListeningSession(
  sourceId: string,
): Promise<ListeningSession> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("sessions", "readonly");
    const request = transaction
      .objectStore("sessions")
      .get(`session:${sourceId}`);
    request.onsuccess = () => {
      try {
        const loaded =
          request.result === undefined
            ? initialListeningSession(sourceId)
            : parseListeningSession(request.result);
        if (loaded.sourceId !== sourceId)
          throw new Error("Source identity mismatch");
        resolve(loaded);
      } catch {
        reject(
          new Error(
            "Your listening session could not be opened. Its original data has been kept.",
          ),
        );
      }
    };
    request.onerror = () =>
      reject(new Error("Your listening position could not be opened."));
    transaction.oncomplete = () => database.close();
    transaction.onabort = () => {
      database.close();
      reject(new Error("Your listening position could not be opened."));
    };
  });
}

export async function commitListeningSession(
  session: ListeningSession,
  expectedRevision: number,
): Promise<ListeningSession> {
  const next = parseListeningSession({
    ...session,
    revision: expectedRevision + 1,
  });
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("sessions", "readwrite");
    const store = transaction.objectStore("sessions");
    let conflict = false;
    let unreadable = false;
    const request = store.get(next.id);
    request.onsuccess = () => {
      let stored: ListeningSession | undefined;
      try {
        assertLocalWritesAllowed();
        stored =
          request.result === undefined
            ? undefined
            : parseListeningSession(request.result);
      } catch {
        unreadable = true;
        transaction.abort();
        return;
      }
      if ((stored?.revision ?? 0) !== expectedRevision) {
        conflict = true;
        transaction.abort();
        return;
      }
      store.put(next);
    };
    transaction.oncomplete = () => {
      database.close();
      resolve(next);
    };
    transaction.onabort = () => {
      database.close();
      reject(
        new Error(
          conflict
            ? "This listening session changed in another tab. Your current position is kept for this visit; reopen before saving again."
            : unreadable
              ? "This listening session cannot be safely updated. Its original data has been preserved; reopen after any local removal completes."
              : "This listening session could not be saved. Your previous saved session remains intact.",
        ),
      );
    };
    transaction.onerror = () => {
      database.close();
      reject(
        new Error(
          "This listening session could not be saved. Your previous saved session remains intact.",
        ),
      );
    };
  });
}

export async function deleteLocalMedia(sourceId: string): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      ["assets", "sessions"],
      "readwrite",
    );
    transaction.objectStore("assets").delete(sourceId);
    transaction.objectStore("sessions").delete(`session:${sourceId}`);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onabort = () => {
      database.close();
      reject(
        new Error(
          "The file could not be deleted. Your existing media remains available.",
        ),
      );
    };
  });
}

export async function clearLocalListeningData(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(MEDIA_DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(
        new Error(
          "Local media could not be deleted. Its existing data is still present.",
        ),
      );
    request.onblocked = () =>
      reject(
        new Error(
          "Close other LEXIS media tabs before deleting local recordings.",
        ),
      );
  });
}
