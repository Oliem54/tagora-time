import type { ReactNode } from "react";
import { cn } from "./cn";

type FormFieldProps = {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
};

export default function FormField({
  label,
  hint,
  error,
  required = false,
  className,
  children,
}: FormFieldProps) {
  return (
    <label className={cn("ui-form-field", className)}>
      <span className="ui-form-field-label">
        {label}
        {required ? <span className="ui-form-field-required"> *</span> : null}
      </span>
      {hint ? <span className="ui-form-field-hint">{hint}</span> : null}
      <div className="ui-form-field-control">{children}</div>
      {error ? <span className="ui-form-field-error">{error}</span> : null}
    </label>
  );
}
