"use client";

import { useState } from "react";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import FormField from "@/app/components/ui/FormField";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import SectionCard from "@/app/components/ui/SectionCard";
import { supabase } from "@/app/lib/supabase/client";
import {
  buildCompletedPasswordMetadata,
  getPasswordPolicyMessage,
  validatePasswordChangeInput,
} from "@/app/lib/auth/passwords";

type PasswordUpdateSectionProps = {
  title: string;
  subtitle: string;
  submitLabel: string;
  successMessage: string;
  requireCurrentPassword?: boolean;
  onSuccess?: () => Promise<void> | void;
};

export default function PasswordUpdateSection({
  title,
  subtitle,
  submitLabel,
  successMessage,
  requireCurrentPassword = true,
  onSuccess,
}: PasswordUpdateSectionProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setMessageType(null);

    const validationError = validatePasswordChangeInput({
      currentPassword,
      newPassword,
      confirmPassword,
      requireCurrentPassword,
    });

    if (validationError) {
      setMessage(validationError);
      setMessageType("error");
      return;
    }

    setSaving(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setMessage("Session invalide.");
        setMessageType("error");
        return;
      }

      const validationResponse = await fetch("/api/auth/password/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
          requireCurrentPassword,
        }),
      });

      const validationPayload = await validationResponse.json();

      if (!validationResponse.ok) {
        setMessage(validationPayload.error || "Validation impossible.");
        setMessageType("error");
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      let activeAccessToken = session.access_token;

      if (requireCurrentPassword && userData.user?.email) {
        const { error: refreshError } = await supabase.auth.signInWithPassword({
          email: userData.user.email,
          password: currentPassword,
        });

        if (refreshError) {
          setMessage("Reconnectez-vous.");
          setMessageType("error");
          return;
        }

        const {
          data: { session: refreshedSession },
        } = await supabase.auth.getSession();

        if (refreshedSession?.access_token) {
          activeAccessToken = refreshedSession.access_token;
        }
      }

      const nextMetadata = buildCompletedPasswordMetadata(
        (userData.user?.user_metadata as Record<string, unknown> | null | undefined) ??
          null
      );

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
        data: nextMetadata,
      });

      if (error) {
        setMessage(error.message);
        setMessageType("error");
        return;
      }

      await fetch("/api/auth/password/complete", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${activeAccessToken}`,
        },
      }).catch(() => {
        // Le drapeau utilisateur a deja ete nettoye localement.
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage(successMessage);
      setMessageType("success");

      if (onSuccess) {
        await onSuccess();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title={title} subtitle={subtitle}>
      <div className="ui-stack-md">
        <FeedbackMessage message={message} type={messageType} />

        <form className="tagora-form-grid" onSubmit={handleSubmit}>
          {requireCurrentPassword ? (
            <FormField label="Mot de passe actuel">
              <input
                className="tagora-input"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="Votre mot de passe actuel"
              />
            </FormField>
          ) : null}

          <FormField label="Nouveau mot de passe">
            <input
              className="tagora-input"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Nouveau mot de passe"
            />
          </FormField>

          <FormField label="Confirmation">
            <input
              className="tagora-input"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirmez le mot de passe"
            />
          </FormField>

          <p className="ui-text-muted" style={{ margin: 0 }}>
            {getPasswordPolicyMessage()}
          </p>

          <div className="tagora-actions">
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? "Confirmation..." : submitLabel}
            </PrimaryButton>
          </div>
        </form>
      </div>
    </SectionCard>
  );
}
