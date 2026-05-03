import { Suspense } from "react";
import EmployeHorodateurQrClient from "./EmployeHorodateurQrClient";

export default function EmployeHorodateurQrPage() {
  return (
    <Suspense
      fallback={
        <main className="page-container">
          <p className="tagora-note">Chargement du pointage QR…</p>
        </main>
      }
    >
      <EmployeHorodateurQrClient />
    </Suspense>
  );
}
