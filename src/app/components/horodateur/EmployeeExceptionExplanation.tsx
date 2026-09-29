import { describeEmployeeException } from "@/app/lib/employee-punch-guidance.shared";

type EmployeeExceptionExplanationProps = {
  exceptionType: string;
  reasonLabel?: string | null;
  status?: string | null;
  details?: string | null;
  scope: "current_shift" | "history";
};

export default function EmployeeExceptionExplanation({
  exceptionType,
  reasonLabel,
  status,
  details,
  scope,
}: EmployeeExceptionExplanationProps) {
  const copy = describeEmployeeException({
    exceptionType,
    reasonLabel,
    status,
    scope,
  });

  return (
    <div className="ui-stack-xs">
      <strong>{copy.title}</strong>
      <span className="ui-text-muted">{copy.scopeLabel}</span>
      <span>{copy.explanation}</span>
      <span>Action attendue : {copy.expectedAction}</span>
      <span>Statut : {copy.statusLabel}</span>
      {details?.trim() ? <span className="ui-text-muted">Détail : {details}</span> : null}
    </div>
  );
}
