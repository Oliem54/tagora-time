"use client";

import { useMemo } from "react";
import type { AccountAccessRequestRecord } from "@/app/lib/account-access";
import { buildAccountReconciliationDiagnostic } from "@/app/lib/account-reconcile.shared";

function formatBool(value: boolean | null | undefined, yes = "Oui", no = "Non") {
  if (value === true) return yes;
  if (value === false) return no;
  return "—";
}

function formatList(values: string[]) {
  return values.length > 0 ? values.join(", ") : "Aucune";
}

export default function AccountRequestReconcileDiagnostic({
  request,
}: {
  request: AccountAccessRequestRecord;
}) {
  const diagnostic = useMemo(
    () => buildAccountReconciliationDiagnostic(request),
    [request]
  );

  return (
    <section className="tagora-panel-muted ui-stack-sm" style={{ padding: 16, borderRadius: 14 }}>
      <h3 className="section-title" style={{ margin: 0, fontSize: 15 }}>
        Diagnostic réconciliation
      </h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 10,
          fontSize: 13,
        }}
      >
        <div>
          <span className="tagora-label">Statut demande</span>
          <div>{diagnostic.requestStatus}</div>
        </div>
        <div>
          <span className="tagora-label">Employé existant</span>
          <div>
            {diagnostic.employeeExists
              ? `#${diagnostic.employeeId}`
              : "Non"}
          </div>
        </div>
        <div>
          <span className="tagora-label">Compte auth lié (fiche)</span>
          <div>{formatBool(diagnostic.authLinkedOnProfile)}</div>
        </div>
        <div>
          <span className="tagora-label">Compte auth détecté</span>
          <div>{formatBool(diagnostic.authAccountExists)}</div>
        </div>
        <div>
          <span className="tagora-label">Fiche RH</span>
          <div>
            {diagnostic.employeeProfileActive === true
              ? "Active"
              : diagnostic.employeeProfileActive === false
                ? "Inactive"
                : "—"}
          </div>
        </div>
        <div>
          <span className="tagora-label">Portail</span>
          <div>
            {diagnostic.portalAccessDisabled
              ? "Désactivé"
              : diagnostic.portalActive
                ? "Actif"
                : "Inactif / absent"}
          </div>
        </div>
        <div>
          <span className="tagora-label">Téléphone demande</span>
          <div>{diagnostic.requestPhone || "—"}</div>
        </div>
        <div>
          <span className="tagora-label">Téléphone fiche</span>
          <div>{diagnostic.profilePhone || "—"}</div>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <span className="tagora-label">Permissions actuelles</span>
          <div>{formatList(diagnostic.currentPermissions)}</div>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <span className="tagora-label">Rôle portail actuel</span>
          <div>{diagnostic.currentRole || "—"}</div>
        </div>
      </div>

      {diagnostic.inconsistencies.length > 0 ? (
        <div className="ui-stack-xs" style={{ marginTop: 8 }}>
          <span className="tagora-label">Incohérences détectées</span>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {diagnostic.inconsistencies.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="tagora-note" style={{ margin: "8px 0 0" }}>
          Aucune incohérence bloquante détectée pour la réconciliation.
        </p>
      )}
    </section>
  );
}
