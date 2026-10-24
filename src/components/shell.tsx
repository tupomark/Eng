"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  House,
  BookOpen,
  Layers3,
  AudioLines,
  Orbit,
  Search,
  ArrowUpRight,
  Command,
  Check,
} from "lucide-react";
import { seedEntries, findEntry } from "@/infrastructure/dictionary/seed";
import { useLearning } from "./learning-provider";
import { Modal } from "./modal";
import { usePreferences } from "./preferences-provider";
import { useMaterials } from "./materials/use-materials";
import { GRAMMAR_CONCEPTS } from "@/domain/writing/grammar";

const navigation = [
  { href: "/", label: "Home", icon: House },
  { href: "/library", label: "Library", icon: BookOpen },
  { href: "/learn", label: "Learn", icon: Layers3 },
  { href: "/tutor", label: "Tutor", icon: AudioLines },
  { href: "/core", label: "Core", icon: Orbit },
];
const destinations = [
  ...navigation,
  { href: "/settings", label: "Settings", icon: House },
  { href: "/offline", label: "Offline workspace", icon: House },
  { href: "/tutor/chat", label: "Text Tutor", icon: AudioLines },
  { href: "/dictionary", label: "Dictionary", icon: BookOpen },
  { href: "/library/import", label: "Import materials", icon: BookOpen },
  { href: "/library/inbox", label: "Smart Inbox", icon: Layers3 },
  { href: "/learn/practice", label: "Smart Cards FSRS", icon: Layers3 },
  { href: "/writing", label: "Writing Studio", icon: BookOpen },
  { href: "/grammar", label: "Grammar Atlas", icon: BookOpen },
  { href: "/listening", label: "Listening Studio", icon: AudioLines },
  { href: "/core/network", label: "Meaning connections", icon: Orbit },
  { href: "/goals", label: "Goals", icon: Orbit },
  { href: "/core/observatory", label: "Knowledge Observatory", icon: Orbit },
  { href: "/account", label: "Account and privacy", icon: House },
  { href: "/core/restore", label: "Restore learning backup", icon: Layers3 },
];
export function Shell({
  children,
  title = "Your learning space",
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const pathname = usePathname();
  const { preferences } = usePreferences();
  const navLabel = (label: string) =>
    preferences.uiLanguage === "ru"
      ? ({
          Home: "Главная",
          Library: "Библиотека",
          Learn: "Практика",
          Tutor: "Тьютор",
          Core: "Профиль",
        }[label] ?? label)
      : label;
  const [command, setCommand] = useState(false);
  const { error, ready } = useLearning();
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommand((value) => !value);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link
          prefetch={false}
          className="brand"
          href="/"
          aria-label="LEXIS home"
        >
          <span className="brand-symbol">
            l<span>·</span>
          </span>
          LEXIS<span className="brand-period">.</span>
        </Link>
        <p className="sidebar-caption">A language, becoming yours.</p>
        <nav className="desktop-nav" aria-label="Main navigation">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link
              prefetch={false}
              key={href}
              href={href}
              className={pathname === href ? "nav-item active" : "nav-item"}
              aria-current={pathname === href ? "page" : undefined}
            >
              <Icon size={19} strokeWidth={1.6} />
              {navLabel(label)}
              {pathname === href && <span className="nav-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="local-indicator" /> Personal space{" "}
          <span className="tiny muted">On this device</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="breadcrumb">
            My workspace <span>/</span> <strong>{title}</strong>
          </span>
          <span className="mobile-brand">LEXIS.</span>
          <div className="topbar-actions">
            <button
              className="command-button"
              onClick={() => setCommand(true)}
              aria-label="Open LEXIS Command"
            >
              <Search size={16} />
              <span>LEXIS Command</span>
              <kbd>⌘ K</kbd>
            </button>
            <Link
              prefetch={false}
              href="/settings"
              className="avatar"
              aria-label="Settings and privacy"
            >
              L
            </Link>
          </div>
        </header>
        <main id="main" className="main-content">
          {!ready && (
            <p role="status" className="status-banner">
              Opening your local learning space…
            </p>
          )}
          {error && (
            <p role="alert" className="status-banner error">
              {error} <Link href="/core">Open Core</Link>
            </p>
          )}
          {children}
        </main>
        <footer className="workspace-footer">
          <span>Thoughtful practice. Lasting understanding.</span>
          <span>
            <i /> Local learning · no cloud sync
          </span>
        </footer>
      </div>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {navigation.map(({ href, label, icon: Icon }) => (
          <Link
            prefetch={false}
            key={href}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
          >
            <Icon size={21} strokeWidth={1.6} />
            <span>{navLabel(label)}</span>
          </Link>
        ))}
      </nav>
      <CommandPalette open={command} close={() => setCommand(false)} />
    </div>
  );
}
function CommandPalette({ open, close }: { open: boolean; close: () => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const router = useRouter();
  const { save, state, ready } = useLearning();
  const materials = useMaterials();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const documents = normalizedQuery
    ? materials.state.documents
        .filter(
          (item) =>
            !item.archivedAt &&
            item.title.toLocaleLowerCase().includes(normalizedQuery),
        )
        .slice(0, 8)
    : [];
  const concepts = normalizedQuery
    ? GRAMMAR_CONCEPTS.filter((item) =>
        (item.title + " " + item.description + " " + item.russianRule)
          .toLocaleLowerCase()
          .includes(normalizedQuery),
      ).slice(0, 6)
    : [];
  const unavailable = normalizedQuery
    ? state.saved
        .filter(
          (item) =>
            !seedEntries.some((entry) =>
              entry.senses.some((sense) => sense.id === item.senseId),
            ) &&
            (item.context + " " + item.senseId)
              .toLocaleLowerCase()
              .includes(normalizedQuery),
        )
        .slice(0, 6)
    : [];
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) {
      searchRef.current?.focus();
    }
  }, [open]);
  const filtered = destinations.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase()),
  );
  const words = query.trim()
    ? seedEntries.filter(
        (entry) =>
          entry.lexeme.lemma.includes(query.trim().toLowerCase()) ||
          findEntry(query)?.lexeme.id === entry.lexeme.id ||
          entry.senses.some((sense) =>
            sense.translation
              .toLocaleLowerCase()
              .includes(query.trim().toLocaleLowerCase()),
          ),
      )
    : [];
  const entry = words.find((word) => word.lexeme.id === selected);
  return (
    <Modal
      open={open}
      onClose={close}
      title="LEXIS Command"
      className="command-modal"
    >
      <label className="search-field">
        <Search size={19} />
        <input
          ref={searchRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(null);
          }}
          placeholder="Search spaces or words…"
          aria-label="Search LEXIS"
          autoComplete="off"
        />
      </label>
      <div className="command-results">
        {documents.length > 0 && (
          <p className="eyebrow">Your local documents</p>
        )}
        {documents.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              close();
              router.push(`/reader/${encodeURIComponent(item.id)}`);
            }}
          >
            <BookOpen size={18} />
            {item.title}
            <span className="muted">On this device</span>
          </button>
        ))}
        {concepts.length > 0 && (
          <p className="eyebrow">Grammar concepts · LEXIS editorial</p>
        )}
        {concepts.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              close();
              router.push(`/grammar?concept=${encodeURIComponent(item.id)}`);
            }}
          >
            <Layers3 size={18} />
            {item.title}
          </button>
        ))}
        {unavailable.length > 0 && (
          <p className="eyebrow">Saved contexts · source unavailable</p>
        )}
        {unavailable.map((item) => (
          <button
            key={item.senseId}
            onClick={() => {
              close();
              router.push(`/library?q=${encodeURIComponent(normalizedQuery)}`);
            }}
          >
            <BookOpen size={18} />
            <span>{item.context.slice(0, 120)}</span>
          </button>
        ))}
        {filtered.map(({ href, label, icon: Icon }) => (
          <button
            key={href}
            onClick={() => {
              close();
              router.push(href);
            }}
          >
            <Icon size={18} />
            Open {label}
            <ArrowUpRight size={15} />
          </button>
        ))}
        {words.map((word) => (
          <button
            key={word.lexeme.id}
            onClick={() => setSelected(word.lexeme.id)}
          >
            <BookOpen size={18} />
            {word.lexeme.lemma}
            <span className="muted">{word.lexeme.partOfSpeech}</span>
          </button>
        ))}
        {!filtered.length &&
          !words.length &&
          !documents.length &&
          !concepts.length &&
          !unavailable.length && (
            <p className="muted">
              No matching spaces or words in the starter dictionary.
            </p>
          )}
      </div>
      {entry && (
        <div className="command-definition">
          <p className="eyebrow">
            {entry.lexeme.lemma} · {entry.lexeme.ipa}
          </p>
          {entry.senses.map((sense) => {
            const saved = state.saved.some((item) => item.senseId === sense.id);
            return (
              <div key={sense.id}>
                <p>{sense.definition}</p>
                <p className="muted" lang="ru">
                  {sense.translation}
                </p>
                <button
                  className="button secondary small"
                  disabled={saved || !ready}
                  onClick={() => save(sense.id, sense.example)}
                >
                  {saved ? (
                    <>
                      <Check size={15} />
                      Saved
                    </>
                  ) : (
                    "Save this meaning"
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
      <p className="tiny muted command-hint">
        <Command size={13} /> K to open · Esc to close
      </p>
    </Modal>
  );
}
