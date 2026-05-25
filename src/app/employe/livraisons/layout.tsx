import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../../direction/livraison-ramassage-ui.css";

export const metadata: Metadata = {
  title: "Livraisons employe",
  description: "Livraisons employe Tagora.",
};

export default function EmployeLivraisonsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
