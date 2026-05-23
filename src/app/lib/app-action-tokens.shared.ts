export const APP_ACTION_TOKEN_STATUSES = [
  "pending",
  "used",
  "expired",
  "cancelled",
] as const;

export type AppActionTokenStatus = (typeof APP_ACTION_TOKEN_STATUSES)[number];

export const APP_ACTION_RESPONSES = ["accept", "reject"] as const;

export type AppActionResponse = (typeof APP_ACTION_RESPONSES)[number];

export const APP_ACTION_TYPES = {
  horodateurExceptionReview: "horodateur_exception_review",
} as const;

export type AppActionType =
  (typeof APP_ACTION_TYPES)[keyof typeof APP_ACTION_TYPES];

export const APP_ACTION_MODULES = {
  horodateur: "horodateur",
} as const;

export type AppActionModule =
  (typeof APP_ACTION_MODULES)[keyof typeof APP_ACTION_MODULES];

export const APP_ACTION_TARGET_TYPES = {
  horodateurException: "horodateur_exception",
} as const;

export type AppActionTargetType =
  (typeof APP_ACTION_TARGET_TYPES)[keyof typeof APP_ACTION_TARGET_TYPES];

export type AppActionTokenDetailRow = {
  label: string;
  value: string;
};

export type AppActionTokenMetadata = {
  title?: string;
  summary?: string;
  detailRows?: AppActionTokenDetailRow[];
  managementUrl?: string;
  managementLabel?: string;
};

export type AppActionTokenPageView =
  | {
      state: "ready";
      title: string;
      summary: string;
      detailRows: AppActionTokenDetailRow[];
      expiresAtLabel: string;
    }
  | {
      state: "used";
      message: string;
      response: AppActionResponse | null;
    }
  | {
      state: "expired";
      message: string;
    }
  | {
      state: "invalid";
      message: string;
    }
  | {
      state: "already_handled";
      message: string;
    }
  | {
      state: "config_error";
      message: string;
    };

export function isAppActionTokensHorodateurEnabled(): boolean {
  return process.env.APP_ACTION_TOKENS_HORODATEUR === "1";
}

export function isValidAppActionRawToken(rawToken: string): boolean {
  const trimmed = rawToken.trim();
  if (trimmed.length < 16 || trimmed.length > 128) {
    return false;
  }
  return /^[A-Za-z0-9_-]+$/.test(trimmed);
}
