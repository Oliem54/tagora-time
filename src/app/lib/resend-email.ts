import "server-only";

import { isValidEmail } from "@/app/lib/account-requests.shared";

export type ResendFromEmailResolution = {
  fromEmail: string | null;
  reason:
    | "missing"
    | "invalid_format"
    | "contains_display_name"
    | "contains_quotes"
    | null;
  diagnostics: {
    hasValue: boolean;
    hadSurroundingWhitespace: boolean;
    hadWrappingQuotes: boolean;
    hadDisplayNameFormat: boolean;
    extractedAddressValid: boolean;
  };
};

function unwrapWrappingQuotes(value: string) {
  const trimmed = value.trim();
  const isDoubleQuoted = trimmed.startsWith("\"") && trimmed.endsWith("\"");
  const isSingleQuoted = trimmed.startsWith("'") && trimmed.endsWith("'");

  if ((isDoubleQuoted || isSingleQuoted) && trimmed.length >= 2) {
    return {
      value: trimmed.slice(1, -1).trim(),
      hadWrappingQuotes: true,
    };
  }

  return {
    value: trimmed,
    hadWrappingQuotes: false,
  };
}

function extractEmailAddress(value: string) {
  const angleMatch = value.match(/<\s*([^<>@\s]+@[^<>@\s]+)\s*>/);
  if (angleMatch?.[1]) {
    return {
      value: angleMatch[1].trim().toLowerCase(),
      hadDisplayNameFormat: true,
    };
  }

  return {
    value: value.trim().toLowerCase(),
    hadDisplayNameFormat: false,
  };
}

export function resolveResendFromEmail(rawValue: string | undefined): ResendFromEmailResolution {
  const normalizedInput = String(rawValue ?? "");
  const hadSurroundingWhitespace = normalizedInput.trim() !== normalizedInput;
  const { value: unquotedValue, hadWrappingQuotes } = unwrapWrappingQuotes(normalizedInput);
  const { value: extractedAddress, hadDisplayNameFormat } =
    extractEmailAddress(unquotedValue);
  const extractedAddressValid = isValidEmail(extractedAddress);

  if (!unquotedValue) {
    return {
      fromEmail: null,
      reason: "missing",
      diagnostics: {
        hasValue: false,
        hadSurroundingWhitespace,
        hadWrappingQuotes,
        hadDisplayNameFormat,
        extractedAddressValid: false,
      },
    };
  }

  if (!extractedAddressValid) {
    return {
      fromEmail: null,
      reason: "invalid_format",
      diagnostics: {
        hasValue: true,
        hadSurroundingWhitespace,
        hadWrappingQuotes,
        hadDisplayNameFormat,
        extractedAddressValid,
      },
    };
  }

  const reason =
    hadDisplayNameFormat
      ? "contains_display_name"
      : hadWrappingQuotes
        ? "contains_quotes"
        : null;

  return {
    fromEmail: extractedAddress,
    reason,
    diagnostics: {
      hasValue: true,
      hadSurroundingWhitespace,
      hadWrappingQuotes,
      hadDisplayNameFormat,
      extractedAddressValid,
    },
  };
}
