import { redirect } from "next/navigation";
import { NEXUS_PUBLIC_LOGIN_URL } from "@/app/lib/canonical-domains";

export default function ConnexionPage() {
  redirect(NEXUS_PUBLIC_LOGIN_URL);
}
