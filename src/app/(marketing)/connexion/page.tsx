import { redirect } from "next/navigation";
import { hororaNexusLoginRedirectTarget } from "@/app/lib/auth/horora-nexus-routing.shared";

export default function ConnexionPage() {
  redirect(hororaNexusLoginRedirectTarget());
}
