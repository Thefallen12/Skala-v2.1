import SentryExampleClient from "./SentryExampleClient";

export const dynamic = "force-dynamic";

export default function SentryExamplePage() {
  const hasClientDsn = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN?.trim());
  const hasServerDsn = Boolean(
    (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN)?.trim(),
  );
  const hasAuthToken = Boolean(process.env.SENTRY_AUTH_TOKEN?.trim());
  const org = process.env.SENTRY_ORG?.trim() || "skala-prioritas";
  const project = process.env.SENTRY_PROJECT?.trim() || "skala-v21";

  return (
    <SentryExampleClient
      hasClientDsn={hasClientDsn}
      hasServerDsn={hasServerDsn}
      hasAuthToken={hasAuthToken}
      org={org}
      project={project}
    />
  );
}

