import { AlertTriangle, LockKeyhole, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { verifyPasswordGate, type PasswordGateStatus } from "@/lib/passwordGate.functions";
import { InteractiveRobotSpline } from "@/components/ui/interactive-3d-robot";

const robotSceneUrl = "https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode";

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
    <main className="relative min-h-screen overflow-hidden bg-[#020604] text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_20%,rgba(34,197,94,0.18),transparent_32%),radial-gradient(circle_at_78%_45%,rgba(34,211,238,0.14),transparent_34%),linear-gradient(135deg,#020604_0%,#06110d_42%,#010302_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#020604] to-transparent" />
      <div className="relative mx-auto grid min-h-screen w-full max-w-7xl items-center gap-8 px-6 py-10 md:px-10 lg:grid-cols-[0.92fr_1.08fr] lg:gap-0">
        <section className="z-10 mx-auto w-full max-w-xl lg:mx-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-medium text-emerald-100 shadow-[0_0_32px_rgba(16,185,129,0.12)] backdrop-blur">
            <ShieldCheck className="size-3.5" />
            Katlas Buddy Access
          </div>
          <h1 className="mt-7 text-5xl font-semibold tracking-tight text-white md:text-7xl">
            Katlas Buddy
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-white/62 md:text-lg">
            Internal workflow system for creator sourcing, outreach, and campaign ops.
          </p>

          {setupError ? (
            <div className="mt-8 max-w-md rounded-xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100 backdrop-blur">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="font-medium">Password is not configured.</p>
                  <p className="mt-1 leading-6">{status.message}</p>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={submitPassword} className="mt-10 max-w-md space-y-4">
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-white/40">
                  Password
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  autoFocus
                  className="mt-3 h-[52px] w-full rounded-xl border border-white/12 bg-white/[0.045] px-4 text-sm text-white outline-none shadow-[0_20px_60px_rgba(0,0,0,0.28)] ring-emerald-300/25 backdrop-blur transition placeholder:text-white/28 focus:border-emerald-200/45 focus:ring-4"
                  placeholder="Enter password"
                />
              </label>
              <button
                type="submit"
                disabled={isSubmitting || !password.trim()}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 px-4 text-sm font-semibold text-emerald-950 shadow-[0_18px_60px_rgba(16,185,129,0.24)] transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <LockKeyhole className="size-4" />
                {isSubmitting ? "Checking..." : "Unlock"}
              </button>
            </form>
          )}

          {message ? (
            <p
              className={`mt-5 max-w-md text-sm leading-6 ${setupError ? "text-red-100" : "text-white/42"}`}
            >
              {message}
            </p>
          ) : null}
        </section>

        <section className="relative flex min-h-[360px] items-center justify-center overflow-hidden lg:min-h-[720px]">
          <div className="pointer-events-none absolute left-1/2 top-1/2 size-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300/10 blur-3xl md:size-[520px] lg:size-[640px]" />
          <div className="katlas-mascot-float relative mx-auto h-[min(66vh,640px)] min-h-[340px] w-full max-w-[620px] overflow-hidden md:min-h-[430px] lg:max-w-[700px]">
            <InteractiveRobotSpline
              scene={robotSceneUrl}
              className="pointer-events-none h-full w-full"
              sceneClassName="katlas-spline-mascot-mask left-1/2 top-[46%] h-[132%] w-[132%] -translate-x-1/2 -translate-y-1/2 scale-[1.18] md:scale-[1.2] lg:scale-[1.24]"
              viewerClassName="scale-[1.02]"
            />
            <div className="pointer-events-none absolute bottom-[15%] left-1/2 h-9 w-[30%] -translate-x-1/2 rounded-full bg-cyan-200/10 blur-xl" />
          </div>
        </section>
      </div>
    </main>
  );
}
