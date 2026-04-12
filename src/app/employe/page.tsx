import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Employe",
  description: "Acces employe Tagora.",
};

export default function EmployePage() {
  redirect("/employe/login");
}
