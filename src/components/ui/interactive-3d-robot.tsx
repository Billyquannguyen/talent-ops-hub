import { Bot, Loader2 } from "lucide-react";
import { createElement, useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const splineViewerScriptSrc = "https://unpkg.com/@splinetool/viewer@1.10.57/build/spline-viewer.js";
let splineViewerScriptPromise: Promise<void> | null = null;

type InteractiveRobotSplineProps = {
  scene: string;
  className?: string;
  sceneClassName?: string;
  viewerClassName?: string;
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

export function InteractiveRobotSpline({
  scene,
  className,
  sceneClassName,
  viewerClassName,
}: InteractiveRobotSplineProps) {
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
    <div className={cn("relative overflow-hidden bg-transparent", className)}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,rgba(34,211,238,0.12),transparent_34%),radial-gradient(circle_at_50%_74%,rgba(16,185,129,0.06),transparent_38%)]" />
      {ready && !failed ? (
        // Spline ships as a web component, so we create it directly instead of adding
        // a package that would make local preview depend on a fresh npm install.
        <div className={cn("absolute inset-0", sceneClassName)}>
          {createSplineViewerElement(scene, viewerClassName)}
        </div>
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

function createSplineViewerElement(scene: string, className?: string) {
  return (
    <div className="h-full w-full">
      {createElement("spline-viewer", {
        url: scene,
        class: cn("h-full w-full", className),
        "loading-anim-type": "spinner-small-dark",
      })}
    </div>
  );
}
