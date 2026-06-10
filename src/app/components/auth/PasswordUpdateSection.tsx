"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import FeedbackMessage from "@/app/components/FeedbackMessage";
import FormField from "@/app/components/ui/FormField";
import PrimaryButton from "@/app/components/ui/PrimaryButton";
import SecondaryButton from "@/app/components/ui/SecondaryButton";
import SectionCard from "@/app/components/ui/SectionCard";
import {
  assessPasswordUpdateMfaStepUp,
  getDefaultPasswordMfaReturnPath,
  isAal2PasswordUpdateError,
  PASSWORD_MFA_RECONNECT_HINT,
  PASSWORD_MFA_STEP_UP_AFTER_ERROR_MESSAGE,
  PASSWORD_MFA_STEP_UP_MESSAGE,
} from "@/app/lib/auth/password-mfa.client";
import {
  buildCompletedPasswordMetadata,
  getPasswordPolicyMessage,
  validatePasswordChangeInput,
} from "@/app/lib/auth/passwords";
import { supabase } from "@/app/lib/supabase/client";

type PasswordUpdateSectionProps = {
  title: string;
  subtitle: string;
  submitLabel: string;
  successMessage: string;
  requireCurrentPassword?: boolean;
  showPolicyHint?: boolean;
  mfaReturnPath?: string;
  reconnectHref?: string;
  onSuccess?: () => Promise<void> | void;
};

function resolveReconnectHref(explicit?: string): string {
  if (explicit) {
    return explicit;
  }

  if (typeof window === "undefined") {
    return "/employe/login";
  }

  const pathname = window.location.pathname;
  if (pathname.startsWith("/employe")) {
    return "/employe/login";
  }

  if (pathname.startsWith("/auth/nouveau-mot-de-passe")) {
    const role = new URLSearchParams(window.location.search).get("role");
    return role === "direction" ? "/direction/login" : "/employe/login";
  }

  return "/direction/login";
}

export default function PasswordUpdateSection({
  title,
  subtitle,
  submitLabel,
  successMessage,
  requireCurrentPassword = true,
  showPolicyHint = true,
  mfaReturnPath,
  reconnectHref,
  onSuccess,
}: PasswordUpdateSectionProps) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);
  const [saving, setSaving] = useState(false);
  const [mfaBannerMessage, setMfaBannerMessage] = useState<string | null>(null);
  const [mfaVerifyHref, setMfaVerifyHref] = useState<string | null>(null);

  const resolvedMfaReturnPath = useMemo(
    () => mfaReturnPath ?? getDefaultPasswordMfaReturnPath(),
    [mfaReturnPath]
  );

  const resolvedReconnectHref = useMemo(
    () => resolveReconnectHref(reconnectHref),
    [reconnectHref]
  );

  const refreshMfaStepUpState = useCallback(async () => {
    const assessment = await assessPasswordUpdateMfaStepUp(resolvedMfaReturnPath);
    if (assessment.stepUpRequired && assessment.verifyHref) {
      setMfaBannerMessage(PASSWORD_MFA_STEP_UP_MESSAGE);
      setMfaVerifyHref(assessment.verifyHref);
      return;
    }

    setMfaBannerMessage(null);
    setMfaVerifyHref(null);
  }, [resolvedMfaReturnPath]);

  useEffect(() => {
    void refreshMfaStepUpState();
  }, [refreshMfaStepUpState]);

  function showMfaStepUpRequired(useAfterErrorMessage: boolean) {
    setMessage(
      useAfterErrorMessage
        ? PASSWORD_MFA_STEP_UP_AFTER_ERROR_MESSAGE
        : PASSWORD_MFA_STEP_UP_MESSAGE
    );
    setMessageType("error");
    void refreshMfaStepUpState();
  }

  async function handleReconnect() {
    await supabase.auth.signOut();
    router.replace(resolvedReconnectHref);
  }

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
      const stepUpAssessment = await assessPasswordUpdateMfaStepUp(resolvedMfaReturnPath);
      if (stepUpAssessment.stepUpRequired) {
        showMfaStepUpRequired(false);
        return;
      }

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

      const postRefreshStepUp = await assessPasswordUpdateMfaStepUp(resolvedMfaReturnPath);
      if (postRefreshStepUp.stepUpRequired) {
        showMfaStepUpRequired(false);
        return;
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
        if (isAal2PasswordUpdateError(error)) {
          showMfaStepUpRequired(true);
        } else {
          setMessage(error.message);
          setMessageType("error");
        }
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
      setMfaBannerMessage(null);
      setMfaVerifyHref(null);
      setMessage(successMessage);
      setMessageType("success");

      if (onSuccess) {
        await onSuccess();
      }
    } finally {
      setSaving(false);
    }
  }

  const showMfaActions = Boolean(mfaVerifyHref);

  return (
    <SectionCard title={title} subtitle={subtitle}>
      <div className="ui-stack-md">
        {mfaBannerMessage ? (
          <FeedbackMessage message={mfaBannerMessage} type="error" />
        ) : null}

        <FeedbackMessage message={message} type={messageType} />

        {showMfaActions ? (
          <div className="ui-stack-sm">
            <div className="tagora-actions" style={{ flexWrap: "wrap" }}>
              <SecondaryButton
                type="button"
                disabled={saving || !mfaVerifyHref}
                onClick={() => {
                  if (mfaVerifyHref) {
                    router.push(mfaVerifyHref);
                  }
                }}
              >
                Vérifier en deux étapes
              </SecondaryButton>
            </div>
            <p className="ui-text-muted" style={{ margin: 0 }}>
              {PASSWORD_MFA_RECONNECT_HINT}
            </p>
            <Link
              href={resolvedReconnectHref}
              className="ui-text-muted"
              style={{ fontSize: 14 }}
              onClick={(event) => {
                event.preventDefault();
                void handleReconnect();
              }}
            >
              Retour à la connexion
            </Link>
          </div>
        ) : null}

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

          {showPolicyHint ? (
            <p className="ui-text-muted" style={{ margin: 0 }}>
              {getPasswordPolicyMessage()}
            </p>
          ) : null}

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
