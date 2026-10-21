"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="standalone">
      <p className="eyebrow">LEXIS</p>
      <h1>Something interrupted this moment.</h1>
      <p>Your saved learning data has not been cleared.</p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
