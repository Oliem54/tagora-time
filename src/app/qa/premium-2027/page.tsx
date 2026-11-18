import { notFound } from "next/navigation";
import {
  buildHororaPremium2027SyntheticDemo,
  isHororaPremium2027SyntheticDemoEnabled,
  readHororaPremium2027SyntheticDemoContext,
} from "@/app/lib/auth/horora-premium-2027-synthetic-demo.shared";

export const dynamic = "force-dynamic";

export default function HororaPremium2027SyntheticDemoPage() {
  if (!isHororaPremium2027SyntheticDemoEnabled(readHororaPremium2027SyntheticDemoContext())) {
    notFound();
  }

  const demo = buildHororaPremium2027SyntheticDemo();

  return (
    <main className="tagora-app-shell">
      <div className="tagora-app-content">
        <p>{demo.notice}</p>
        <section>
          <h1>{demo.owner.title}</h1>
          <ul>
            {demo.owner.directory.map((row) => (
              <li key={`${row.dossierId ?? "sans"}-${row.name}`}>
                {row.name} — {row.status}
                {row.editor ? "" : " — éditeur fermé"}
              </li>
            ))}
          </ul>
          <p>Droits gagnés : {demo.owner.rightsPreview.gained}</p>
          <p>Droits perdus : {demo.owner.rightsPreview.lost}</p>
          <p>Audit simulé : {demo.owner.auditSimulation}</p>
          <p>Retour arrière simulé, droits retrouvés : {demo.owner.rollbackPreview.gained}</p>
          <p>{demo.owner.writeAttempt.reason}</p>
        </section>
        <section>
          <h1>{demo.direction.title}</h1>
          <p>{demo.direction.dashboard}</p>
          <p>Équipe : {demo.direction.team.join(", ")}</p>
          <p>
            Approbation dans {demo.direction.assignedDepartment} :{" "}
            {demo.direction.approvalInsideDepartment ? "autorisée en démonstration" : "refusée"}
          </p>
          <p>
            Hors département : {demo.direction.outsideDepartment ? "autorisée" : "refusée"} (
            {demo.direction.outsideReason})
          </p>
          <p>
            Administration des rôles :{" "}
            {demo.direction.canAdministerRoles ? "ouverte" : "refusée"}
          </p>
        </section>
        <section>
          <h1>{demo.employee.title}</h1>
          <p>{demo.employee.dashboard}</p>
          <p>
            {demo.employee.profile}, dossier {demo.employee.dossierId}
          </p>
          <p>{demo.employee.punches.join(" · ")}</p>
          <p>{demo.employee.breaks.join(" · ")}</p>
          <p>{demo.employee.hours}</p>
          <p>{demo.employee.correctionRequest}</p>
          <p>
            Dossier {demo.employee.otherDossier.dossierId} : {demo.employee.otherDossier.reason}
          </p>
        </section>
      </div>
    </main>
  );
}
