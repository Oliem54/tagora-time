import Link from "next/link";
import type { FormEvent, ReactNode } from "react";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import FormField from "@/app/components/ui/FormField";

type TimeLoginFormProps = {
  email: string;
  password: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitting: boolean;
  message: string;
  messageType: "success" | "error" | null;
  forgotPasswordHref: string;
  submitLabel?: string;
  submittingLabel?: string;
  footer?: ReactNode;
};

export default function TimeLoginForm({
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  submitting,
  message,
  messageType,
  forgotPasswordHref,
  submitLabel = "Connexion",
  submittingLabel = "Connexion…",
  footer,
}: TimeLoginFormProps) {
  return (
    <form className="time-public-login-form" onSubmit={onSubmit} noValidate>
      <FeedbackMessage message={message} type={messageType} />

      <div className="time-public-fields">
        <FormField label="Adresse courriel" required>
          <input
            className="tagora-input time-public-input"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="votre@courriel.com"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            disabled={submitting}
            required
          />
        </FormField>

        <FormField label="Mot de passe" required>
          <input
            className="tagora-input time-public-input"
            type="password"
            autoComplete="current-password"
            placeholder="Votre mot de passe"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            disabled={submitting}
            required
          />
        </FormField>
      </div>

      <div className="time-public-form-meta">
        <Link href={forgotPasswordHref} className="time-public-inline-link">
          Mot de passe oublié ?
        </Link>
      </div>

      <button
        type="submit"
        className="time-public-submit"
        disabled={submitting}
      >
        {submitting ? submittingLabel : submitLabel}
      </button>

      {footer}
    </form>
  );
}
