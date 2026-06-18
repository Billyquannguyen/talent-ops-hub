import { AlertTriangle, LockKeyhole, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { verifyPasswordGate, type PasswordGateStatus } from "@/lib/passwordGate.functions";
import { InteractiveRobotSpline } from "@/components/ui/interactive-3d-robot";

const robotSceneUrl = "https://prod.spline.design/PyzDhpQ9E5f1E3MT/scene.splinecode";

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
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="absolute inset-x-0 top-0 h-[420px] bg-hero-glow" />
      <div className="relative mx-auto grid min-h-screen w-full max-w-6xl items-center gap-8 px-5 py-10 lg:grid-cols-[0.92fr_1.08fr]">
        <section className="rounded-2xl border border-border bg-card/80 p-6 shadow-2xl backdrop-blur md:p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-medium text-cyan-100">
            <ShieldCheck className="size-3.5" />
            Katlas Buddy Access
          </div>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight md:text-4xl">
            Unlock Dashboard 2
          </h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
            Enter the Katlas app password to access the internal workflow dashboard.
          </p>

          {setupError ? (
            <div className="mt-6 rounded-xl border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="font-medium">Password is not configured.</p>
                  <p className="mt-1 leading-6">{status.message}</p>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={submitPassword} className="mt-7 space-y-4">
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  autoFocus
                  className="mt-2 h-12 w-full rounded-lg border border-input bg-background px-4 text-sm outline-none ring-ring transition focus:ring-2"
                  placeholder="Enter password"
                />
              </label>
              <button
                type="submit"
                disabled={isSubmitting || !password.trim()}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <LockKeyhole className="size-4" />
                {isSubmitting ? "Checking..." : "Unlock"}
              </button>
            </form>
          )}

          {message ? (
            <p
              className={`mt-4 text-sm ${setupError ? "text-destructive" : "text-muted-foreground"}`}
            >
              {message}
            </p>
          ) : null}
        </section>

        <section className="min-h-[420px] overflow-hidden rounded-3xl border border-border bg-card/70 p-3 shadow-2xl">
          <InteractiveRobotSpline scene={robotSceneUrl} className="h-[420px] w-full md:h-[560px]" />
        </section>
      </div>
    </main>
  );
}
