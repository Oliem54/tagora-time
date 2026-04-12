import type { User } from "@supabase/supabase-js";

const PASSWORD_MIN_LENGTH = 12;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPasswordFlag(metadata: unknown) {
  if (!isPlainObject(metadata)) {
    return false;
  }

  return (
    metadata.must_change_password === true ||
    metadata.password_change_required === true ||
    metadata.temporary_password === true ||
    metadata.password_temporaire === true
  );
}

export function getPasswordPolicyMessage() {
  return "12 caracteres minimum avec une majuscule, une minuscule et un chiffre.";
}

export function validatePasswordStrength(password: string) {
  const value = password.trim();

  if (value.length < PASSWORD_MIN_LENGTH) {
    return getPasswordPolicyMessage();
  }

  if (!/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/[0-9]/.test(value)) {
    return getPasswordPolicyMessage();
  }

  return null;
}

export function validatePasswordChangeInput(options: {
  currentPassword?: string;
  newPassword: string;
  confirmPassword: string;
  requireCurrentPassword?: boolean;
}) {
  const requireCurrentPassword = options.requireCurrentPassword !== false;
  const currentPassword = options.currentPassword ?? "";
  const newPassword = options.newPassword ?? "";
  const confirmPassword = options.confirmPassword ?? "";

  if (requireCurrentPassword && !currentPassword.trim()) {
    return "Entrez votre mot de passe actuel.";
  }

  if (!newPassword.trim()) {
    return "Entrez un nouveau mot de passe.";
  }

  if (!confirmPassword.trim()) {
    return "Confirmez le nouveau mot de passe.";
  }

  if (newPassword !== confirmPassword) {
    return "La confirmation ne correspond pas.";
  }

  if (requireCurrentPassword && currentPassword === newPassword) {
    return "Choisissez un mot de passe different.";
  }

  return validatePasswordStrength(newPassword);
}

export function buildCompletedPasswordMetadata(
  existingMetadata?: Record<string, unknown> | null
) {
  return {
    ...(existingMetadata ?? {}),
    must_change_password: false,
    password_change_required: false,
    temporary_password: false,
    password_temporaire: false,
    password_changed_at: new Date().toISOString(),
  };
}

export function buildRequiredPasswordMetadata(
  existingMetadata?: Record<string, unknown> | null
) {
  return {
    ...(existingMetadata ?? {}),
    must_change_password: true,
    password_change_required: true,
    temporary_password: true,
    password_temporaire: true,
  };
}

export function hasPasswordChangeRequired(user: User | null | undefined) {
  if (!user) {
    return false;
  }

  const userMetadata = isPlainObject(user.user_metadata) ? user.user_metadata : null;
  const appMetadata = isPlainObject(user.app_metadata) ? user.app_metadata : null;

  if (readPasswordFlag(userMetadata)) {
    return true;
  }

  if (typeof userMetadata?.password_changed_at === "string") {
    return false;
  }

  return readPasswordFlag(appMetadata);
}
