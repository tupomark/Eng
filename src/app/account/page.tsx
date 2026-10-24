import Link from "next/link";
import { Shell } from "@/components/shell";
import { AccountForm } from "@/components/account/account-form";
import { createAuthServerContext } from "@/infrastructure/supabase/server";
import styles from "@/components/account/account.module.css";

export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parameters = await searchParams;
  const context = await createAuthServerContext(false);
  let userEmail: string | null = null;
  let unavailable = false;
  if (context) {
    try {
      const { data, error } = await context.client.auth.getUser();
      userEmail = data.user?.email ?? null;
      unavailable = Boolean(error && error.name !== "AuthSessionMissingError");
    } catch {
      unavailable = true;
    }
  }
  return (
    <Shell title="Account">
      <div className={styles.container}>
        <header className="page-heading">
          <p className="eyebrow">YOUR PERSONAL SPACE</p>
          <h1>Account</h1>
          <p className="muted">A separate home for your identity.</p>
        </header>
        <section className={`glass-panel ${styles.panel}`}>
          <h2>{context ? "Your account" : "Local learning is available"}</h2>
          {!context && (
            <p role="status">
              Account sign-in awaits configuration. You can keep reading and
              practising on this device without an account.
            </p>
          )}
          {unavailable && (
            <p role="alert">
              The account service is temporarily unavailable. Local learning is
              still accessible; retry this page later.
            </p>
          )}
          {parameters.notice === "callback-incomplete" && (
            <p role="alert">
              This sign-in link could not be completed. It may have expired or
              been opened in another browser. Request a new link and open it in
              the browser where you started.
            </p>
          )}
          <AccountForm
            configured={Boolean(context)}
            userEmail={userEmail}
            recovery={parameters.mode === "recovery"}
          />
          <div className={styles.note}>
            <p>
              Learning currently stays in the separate local workspace. Signing
              in does not upload books, drafts or history. Cloud transfer and
              cross-device learning are awaiting configuration and verification.
            </p>
            <Link href="/core" className="text-link">
              Open local history and export
            </Link>
          </div>
        </section>
      </div>
    </Shell>
  );
}
