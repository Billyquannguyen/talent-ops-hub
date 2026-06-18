import { Bot, Loader2 } from "lucide-react";
import { createElement, useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const splineViewerScriptSrc = "https://unpkg.com/@splinetool/viewer@1.10.57/build/spline-viewer.js";
let splineViewerScriptPromise: Promise<void> | null = null;

type InteractiveRobotSplineProps = {
  scene: string;
  className?: string;
};

function loadSplineViewerScript() {
  if (typeof document === "undefined") return Promise.resolve();
  if (customElements.get("spline-viewer")) return Promise.resolve();
  if (splineViewerScriptPromise) return splineViewerScriptPromise;

  splineViewerScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${splineViewerScriptSrc}"]`,
    );
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Spline viewer failed.")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.type = "module";
    script.src = splineViewerScriptSrc;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Spline viewer failed.")), {
      once: true,
    });
    document.head.appendChild(script);
  });

  return splineViewerScriptPromise;
}

export function InteractiveRobotSpline({ scene, className }: InteractiveRobotSplineProps) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadSplineViewerScript()
      .then(() => {
        if (mounted) setReady(true);
      })
      .catch(() => {
        if (mounted) setFailed(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className={cn("relative overflow-hidden rounded-2xl bg-background", className)}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_45%_20%,rgba(34,211,238,0.28),transparent_34%),linear-gradient(145deg,rgba(20,184,166,0.18),rgba(15,23,42,0.94))]" />
      {ready && !failed ? (
        // Spline ships as a web component, so we create it directly instead of adding
        // a package that would make local preview depend on a fresh npm install.
        <div className="absolute inset-0">{createSplineViewerElement(scene)}</div>
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <div className="grid size-28 place-items-center rounded-full border border-cyan-300/20 bg-cyan-300/10 text-cyan-100 shadow-[0_0_48px_rgba(34,211,238,0.18)]">
            {failed ? <Bot className="size-12" /> : <Loader2 className="size-10 animate-spin" />}
          </div>
        </div>
      )}
    </div>
  );
}

function createSplineViewerElement(scene: string) {
  return (
    <div className="h-full w-full">
      {createElement("spline-viewer", {
        url: scene,
        class: "h-full w-full",
        "loading-anim-type": "spinner-small-dark",
      })}
    </div>
  );
}
