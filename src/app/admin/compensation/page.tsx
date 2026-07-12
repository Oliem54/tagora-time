import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Livre de commissions",
  description: "Livre de commissions — admin finance.",
};

export default function AdminCompensationIndexPage() {
  redirect("/admin/compensation/ventes");
}
