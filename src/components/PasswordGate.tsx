import { AlertTriangle, ArrowRight, Lock, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { verifyPasswordGate, type PasswordGateStatus } from "@/lib/passwordGate.functions";
import { SmokeyBackground } from "@/components/ui/smokey-background";

type PasswordGateProps = {
  status: PasswordGateStatus;
  onUnlocked: () => void;
};

export function PasswordGate({ status, onUnlocked }: PasswordGateProps) {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(status.message);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");
    try {
      const result = await verifyPasswordGate({ data: { password } });
      if (result.ok) {
        onUnlocked();
        return;
      }
      setMessage(result.message || result.status.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Password check failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const setupError = status.mode === "setup-error";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#020604] text-white">
      <SmokeyBackground color="#22c55e" backdropBlurAmount="sm" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(0,0,0,0),rgba(0,0,0,0.66)_78%)]" />
      <div className="relative z-10 flex min-h-screen items-center justify-center px-5 py-10">
        <section className="w-full max-w-sm rounded-2xl border border-white/15 bg-white/[0.08] p-8 shadow-[0_30px_120px_rgba(0,0,0,0.48)] backdrop-blur-xl">
          <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-medium text-emerald-100 shadow-[0_0_32px_rgba(16,185,129,0.12)]">
            <ShieldCheck className="size-3.5" />
            Katlas Buddy Access
          </div>

          <div className="mt-6 text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-white">Katlas Buddy</h1>
            <p className="mt-2 text-sm leading-6 text-white/58">
              Internal workflow system for creator sourcing, outreach, and campaign ops.
            </p>
          </div>

          {setupError ? (
            <div className="mt-8 rounded-xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="font-medium">Password is not configured.</p>
                  <p className="mt-1 leading-6">{status.message}</p>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={submitPassword} className="mt-8 space-y-8">
              <label className="relative z-0 block">
                <input
                  type="password"
                  id="katlas-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  autoFocus
                  className="peer block w-full appearance-none border-0 border-b-2 border-white/28 bg-transparent px-0 py-3 text-sm text-white outline-none transition placeholder:text-transparent focus:border-emerald-300 focus:ring-0"
                  placeholder="Password"
                />
                <span className="pointer-events-none absolute left-0 top-3 flex origin-[0] -translate-y-7 scale-75 items-center gap-2 text-sm text-white/58 duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-7 peer-focus:scale-75 peer-focus:text-emerald-200">
                  <Lock className="size-4" />
                  Password
                </span>
              </label>
              <button
                type="submit"
                disabled={isSubmitting || !password.trim()}
                className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 text-sm font-semibold text-emerald-950 shadow-[0_18px_60px_rgba(16,185,129,0.25)] transition hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-300/70 focus:ring-offset-2 focus:ring-offset-[#07120d] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? "Checking..." : "Unlock"}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </button>
            </form>
          )}

          {message && !setupError ? (
            <p className="mt-5 text-center text-sm leading-6 text-white/46">{message}</p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
