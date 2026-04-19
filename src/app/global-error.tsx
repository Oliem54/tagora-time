"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="fr">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white p-6 text-center antialiased">
        <h1 className="text-lg font-semibold text-neutral-900">Erreur critique</h1>
        <p className="max-w-md text-sm text-neutral-600">
          {process.env.NODE_ENV === "development" ? error.message : "L application a rencontre un probleme."}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
        >
          Reessayer
        </button>
      </body>
    </html>
  );
}
