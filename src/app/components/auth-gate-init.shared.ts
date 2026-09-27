export const AUTH_GATE_INIT_TIMEOUT_MS = 12_000;

export const AUTH_GATE_INIT_FAILURE_MESSAGE =
  "L'initialisation de TAGORA n'a pas abouti. Vous pouvez réessayer.";

export function resolveAuthGateInitView(input: {
  status: "checking" | "allowed";
  initFailed: boolean;
}): "allowed" | "retry" | "loading" {
  if (input.status === "allowed") return "allowed";
  if (input.initFailed) return "retry";
  return "loading";
}
