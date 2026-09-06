"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import TimePublicShell from "@/app/components/time-public/TimePublicShell";
import HororaStateBanner from "@/app/components/horora/HororaStateBanner";

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
    <TimePublicShell brandSize="login" compact showWordmark={false}>
      <HororaStateBanner
        tone="danger"
        title="Une erreur est survenue"
        action={
          <button type="button" className="ui-button ui-button-primary" onClick={() => reset()}>
            Reessayer
          </button>
        }
      >
        {process.env.NODE_ENV === "development"
          ? error.message
          : "Veuillez reessayer dans un instant."}
      </HororaStateBanner>
    </TimePublicShell>
  );
}
