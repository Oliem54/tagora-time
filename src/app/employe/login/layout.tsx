import type { Metadata } from "next";
import type { ReactNode } from "react";
import styles from "./employe-login.module.css";

export const metadata: Metadata = {
  title: "Connexion employé",
  description: "Connexion à l’espace employé TAGORA HORORA.",
};

export default function EmployeLoginLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <div className={styles.shell}>{children}</div>;
}
