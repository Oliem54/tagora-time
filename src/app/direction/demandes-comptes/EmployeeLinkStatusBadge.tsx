"use client";

import StatusBadge from "@/app/components/ui/StatusBadge";
import type { EmployeeLinkSummary } from "@/app/lib/account-access";

export default function EmployeeLinkStatusBadge({
  employeeLink,
}: {
  employeeLink?: EmployeeLinkSummary | null;
}) {
  if (!employeeLink || employeeLink.status === "missing") {
    return <StatusBadge label="Fiche employe manquante" tone="warning" />;
  }

  if (employeeLink.status === "created") {
    return <StatusBadge label="Employe cree" tone="success" />;
  }

  return <StatusBadge label="Employe deja existant" tone="info" />;
}

