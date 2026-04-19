"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function Error({
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
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-lg font-semibold text-neutral-900">Une erreur est survenue</h1>
      <p className="max-w-md text-sm text-neutral-600">
        {process.env.NODE_ENV === "development" ? error.message : "Veuillez reessayer dans un instant."}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
      >
        Reessayer
      </button>
    </div>
  );
}
