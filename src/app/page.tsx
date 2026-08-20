import type { Metadata } from "next";
import TimeEntryHub from "./components/time-public/TimeEntryHub";

export const metadata: Metadata = {
  title: "Accueil",
  description: "TAGORA HORORA — pointage, heures et opérations pour les employés et la direction.",
};

export default function Page() {
  return <TimeEntryHub />;
}
