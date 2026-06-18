export const passwordGateAccessKey = "katlas-password-gate-access-v1";
export const passwordGateLockEvent = "katlas-password-gate-lock";

export function hasPasswordGateAccess() {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(passwordGateAccessKey) === "unlocked";
}

export function markPasswordGateUnlocked() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(passwordGateAccessKey, "unlocked");
}

export function lockPasswordGate() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(passwordGateAccessKey);
  window.dispatchEvent(new Event(passwordGateLockEvent));
}
