import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type PasswordGateMode = "protected" | "setup-error" | "dev-bypass";

export type PasswordGateStatus = {
  mode: PasswordGateMode;
  configured: boolean;
  requiresPassword: boolean;
  message: string;
};

function readPasswordGateStatus(): PasswordGateStatus {
  const password = String(process.env.KATLAS_APP_PASSWORD ?? "").trim();
  const deployedOnVercel = process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
  const configured = password.length > 0;

  if (configured) {
    return {
      mode: "protected",
      configured: true,
      requiresPassword: true,
      message: "Password gate is enabled.",
    };
  }

  if (deployedOnVercel) {
    return {
      mode: "setup-error",
      configured: false,
      requiresPassword: true,
      message: "KATLAS_APP_PASSWORD is missing. Add it in Vercel environment variables.",
    };
  }

  return {
    mode: "dev-bypass",
    configured: false,
    requiresPassword: false,
    message: "Password gate is bypassed because KATLAS_APP_PASSWORD is not set locally.",
  };
}

export const getPasswordGateStatus = createServerFn({ method: "GET" }).handler(async () =>
  readPasswordGateStatus(),
);

export const verifyPasswordGate = createServerFn({ method: "POST" })
  .inputValidator(z.object({ password: z.string() }))
  .handler(async ({ data }) => {
    const status = readPasswordGateStatus();
    const password = String(process.env.KATLAS_APP_PASSWORD ?? "").trim();

    if (status.mode === "dev-bypass") {
      return { ok: true, status };
    }

    if (status.mode === "setup-error") {
      return { ok: false, status, message: status.message };
    }

    if (data.password === password) {
      return { ok: true, status };
    }

    return {
      ok: false,
      status,
      message: "Incorrect password.",
    };
  });
