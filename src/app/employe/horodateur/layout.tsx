import type { Metadata } from "next";
import type { ReactNode } from "react";
import styles from "./horodateur-employe.module.css";

export const metadata: Metadata = {
  title: "Horodateur employé",
  description: "TAGORA HORORA — Horodateur employé.",
};

export default function EmployeHorodateurLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <div className={styles.shell}>{children}</div>;
}
