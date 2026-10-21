import Link from "next/link";
export default function NotFound() {
  return (
    <main className="standalone">
      <p className="eyebrow">LEXIS · 404</p>
      <h1>A little off the path.</h1>
      <Link className="button primary" href="/">
        Return home
      </Link>
    </main>
  );
}
