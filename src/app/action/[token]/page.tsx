import {
  APP_ACTION_TYPES,
  APP_ACTION_TARGET_TYPES,
} from "@/app/lib/app-action-tokens.shared";
import {
  findAppActionTokenByRawToken,
  getAppActionTokenPageContext,
} from "@/app/lib/app-action-tokens.server";
import { isHorodateurExceptionPending } from "@/app/lib/app-action-handlers.server";

import ActionTokenClient from "./ActionTokenClient";

type ActionTokenPageProps = {
  params: Promise<{ token: string }>;
};

export default async function ActionTokenPage({ params }: ActionTokenPageProps) {
  const { token } = await params;
  const decodedToken = decodeURIComponent(token);

  let targetAlreadyHandled = false;

  try {
    const row = await findAppActionTokenByRawToken(decodedToken);
    if (
      row &&
      row.status === "pending" &&
      row.action_type === APP_ACTION_TYPES.horodateurExceptionReview &&
      row.target_type === APP_ACTION_TARGET_TYPES.horodateurException
    ) {
      targetAlreadyHandled = !(await isHorodateurExceptionPending(row.target_id));
    }
  } catch {
    targetAlreadyHandled = false;
  }

  const initialView = await getAppActionTokenPageContext(decodedToken, {
    targetAlreadyHandled,
  });

  return <ActionTokenClient token={decodedToken} initialView={initialView} />;
}
