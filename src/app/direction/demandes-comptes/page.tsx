import { Suspense } from "react";
import DirectionEmployeeAccountsClient from "./DirectionEmployeeAccountsClient";

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="tagora-app-shell account-requests-page">
          <div className="tagora-app-content">
            <p className="tagora-note">Chargement…</p>
          </div>
        </main>
      }
    >
      <DirectionEmployeeAccountsClient />
    </Suspense>
  );
}
