import type { Metadata } from "next";
import DirectionPayrollAccountantReportClient from "./DirectionPayrollAccountantReportClient";

export const metadata: Metadata = {
  title: "Rapport comptable de paie",
  description: "Preparer, verifier, emettre et exporter le rapport comptable HORORA.",
};

export default function DirectionPayrollAccountantReportPage() {
  return <DirectionPayrollAccountantReportClient />;
}
