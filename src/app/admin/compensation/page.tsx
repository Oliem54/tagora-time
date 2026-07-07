import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Compensation",
  description: "Compensation Engine — ventes et accruals (admin finance).",
};

export default function AdminCompensationIndexPage() {
  redirect("/admin/compensation/ventes");
}
