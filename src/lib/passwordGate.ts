export const passwordGateAccessKey = "katlas-password-gate-access-v1";
export const passwordGateCredentialKey = "katlas-password-gate-credential-v1";
export const passwordGateLockEvent = "katlas-password-gate-lock";

export function hasPasswordGateAccess() {
  if (typeof window === "undefined") return false;
  return (
    window.sessionStorage.getItem(passwordGateAccessKey) === "unlocked" &&
    window.sessionStorage.getItem(passwordGateCredentialKey) !== null
  );
}

export function markPasswordGateUnlocked(password = "") {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(passwordGateAccessKey, "unlocked");
  window.sessionStorage.setItem(passwordGateCredentialKey, password);
}

export function getPasswordGateCredential() {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(passwordGateCredentialKey) ?? "";
}

export function lockPasswordGate() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(passwordGateAccessKey);
  window.sessionStorage.removeItem(passwordGateCredentialKey);
  window.dispatchEvent(new Event(passwordGateLockEvent));
}
