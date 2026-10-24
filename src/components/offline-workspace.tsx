"use client";
import { useSyncExternalStore } from "react";
import { DocumentReader } from "./materials/document-reader";
import { useMaterials } from "./materials/use-materials";
import { DictionaryWorkspace } from "./dictionary-workspace";
import { Shell } from "./shell";
import { OfflineSettings } from "./pwa";
const subscribe = () => () => {};
const decodePath = (path: string) => {
  try {
    return decodeURIComponent(path);
  } catch {
    return "";
  }
};
const locationSnapshot = () =>
  window.location.pathname + window.location.search;
export function OfflineWorkspace() {
  const path = useSyncExternalStore(
    subscribe,
    locationSnapshot,
    () => "/offline",
  );
  const url = new URL(path, "https://lexis.invalid");
  const materials = useMaterials();
  const documentId = url.pathname.startsWith("/reader/")
    ? decodePath(url.pathname.slice(8))
    : url.searchParams.get("document");
  if (documentId)
    return <DocumentReader documentId={documentId.slice(0, 200)} />;
  if (url.pathname === "/dictionary")
    return (
      <DictionaryWorkspace
        initialQuery={(url.searchParams.get("q") ?? "").slice(0, 200)}
        initialSenseId={(url.searchParams.get("sense") ?? "").slice(0, 200)}
        visitToken={(url.searchParams.get("visit") ?? "").slice(0, 200)}
        returnHref={url.searchParams.get("return") ?? "/offline"}
      />
    );
  return (
    <Shell title="Offline">
      <div className="page-heading">
        <p className="eyebrow">ON THIS DEVICE</p>
        <h1>A space without the network.</h1>
        <p className="intro-copy">
          Read your locally stored texts and use the editorial dictionary. No
          AI, live voice or cloud access is implied.
        </p>
      </div>
      <OfflineSettings />
      {materials.error && <p role="alert">{materials.error}</p>}
      <section aria-label="Offline reading">
        <h2>Your local documents</h2>
        {!materials.ready ? (
          <p role="status">Opening local materials…</p>
        ) : materials.state.documents.filter((item) => !item.archivedAt)
            .length ? (
          materials.state.documents
            .filter((item) => !item.archivedAt)
            .map((item) => (
              <p key={item.id}>
                <a
                  className="button secondary"
                  href={`/offline?document=${encodeURIComponent(item.id)}`}
                >
                  {item.title}
                </a>
              </p>
            ))
        ) : (
          <p>
            No local books yet. Import a permitted TXT or DRM-free EPUB while
            connected. Stored material can be evicted by your browser.
          </p>
        )}
      </section>
      <section className="device-panel">
        <h2>Editorial dictionary</h2>
        <form action="/dictionary" method="get">
          <label className="search-field">
            Word or form
            <input
              name="q"
              maxLength={200}
              aria-label="Offline dictionary word"
              required
            />
          </label>
          <button className="button secondary">Look up offline</button>
        </form>
        <p className="muted">
          Eight authored entries only. Unknown words need a configured external
          source or your own later curation.
        </p>
      </section>
    </Shell>
  );
}
