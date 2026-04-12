import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Direction",
  description: "Acces direction Tagora.",
};

export default function DirectionPage() {
  redirect("/direction/login");
}
