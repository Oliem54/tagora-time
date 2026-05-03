import { redirect } from "next/navigation";

/** Alias : le centre d'alertes est partagé avec la direction. */
export default function AdminAlertesPage() {
  redirect("/direction/alertes");
}
