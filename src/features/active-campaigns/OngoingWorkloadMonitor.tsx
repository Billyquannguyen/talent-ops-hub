import { Player } from "@remotion/player";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { useEffect, useState } from "react";

type WorkloadTier = {
  label: string;
  guidance: string;
  color: string;
  softColor: string;
};

function getOngoingWorkloadTier(count: number): WorkloadTier {
  if (count < 15) {
    return {
      label: "Outreach warning",
      guidance: "Build the active pipeline",
      color: "#f59e0b",
      softColor: "rgba(245, 158, 11, 0.18)",
    };
  }
  if (count < 20) {
    return {
      label: "Can improve outreach",
      guidance: "A few more active projects will help",
      color: "#38bdf8",
      softColor: "rgba(56, 189, 248, 0.18)",
    };
  }
  if (count <= 25) {
    return {
      label: "Good",
      guidance: "Ideal ongoing workload",
      color: "#34d399",
      softColor: "rgba(52, 211, 153, 0.18)",
    };
  }
  if (count <= 30) {
    return {
      label: "Excellent",
      guidance: "Strong active pipeline",
      color: "#22d3ee",
      softColor: "rgba(34, 211, 238, 0.18)",
    };
  }
  if (count <= 40) {
    return {
      label: "Rock star",
      guidance: "High workload, keep an eye on capacity",
      color: "#a78bfa",
      softColor: "rgba(167, 139, 250, 0.18)",
    };
  }
  return {
    label: "Burnout risk",
    guidance: "Reduce or redistribute the workload",
    color: "#fb7185",
    softColor: "rgba(251, 113, 133, 0.18)",
  };
}

function WorkloadIllustration({ count, reduceMotion }: { count: number; reduceMotion: boolean }) {
  const currentFrame = useCurrentFrame();
  const frame = reduceMotion ? 0 : currentFrame;
  const tier = getOngoingWorkloadTier(count);
  const chartMaximum = 45;
  const markerPosition = Math.min(Math.max(count, 0), chartMaximum) / chartMaximum;
  const zones = [
    { color: "#f59e0b", width: 32.22 },
    { color: "#38bdf8", width: 11.11 },
    { color: "#34d399", width: 13.33 },
    { color: "#22d3ee", width: 11.11 },
    { color: "#a78bfa", width: 22.22 },
    { color: "#fb7185", width: 10.01 },
  ];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "transparent",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        justifyContent: "center",
        padding: "8px 10px",
      }}
    >
      <div style={{ position: "relative" }}>
        <div
          style={{
            display: "flex",
            borderRadius: 999,
            height: 12,
            overflow: "hidden",
          }}
        >
          {zones.map((zone, index) => (
            <div
              key={zone.color}
              style={{
                backgroundColor: zone.color,
                flexBasis: `${zone.width}%`,
                flexGrow: 0,
                flexShrink: 0,
                borderLeft: index === 0 ? undefined : "3px solid #0f1115",
                opacity: interpolate(frame, [index * 4, index * 4 + 18], [0.16, 0.48], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                }),
              }}
            />
          ))}
        </div>
        <div
          style={{
            backgroundColor: tier.color,
            borderRadius: "50%",
            filter: "blur(5px)",
            height: 28,
            left: `${markerPosition * 100}%`,
            opacity: reduceMotion
              ? 0.28
              : interpolate(frame, [0, 30, 59], [0.18, 0.55, 0.18], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
            position: "absolute",
            scale: reduceMotion
              ? 1
              : interpolate(frame, [0, 30, 59], [0.85, 1.25, 0.85], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
            top: -8,
            translate: "-50% 0",
            width: 28,
          }}
        />
        <div
          style={{
            backgroundColor: tier.color,
            border: "3px solid #0f1115",
            borderRadius: "50%",
            boxShadow: `0 0 18px ${tier.color}99`,
            height: 18,
            left: `${markerPosition * 100}%`,
            position: "absolute",
            top: -3,
            translate: "-50% 0",
            width: 18,
          }}
        />
        <div
          style={{
            color: "#64748b",
            display: "flex",
            fontSize: 10,
            justifyContent: "space-between",
            marginTop: 10,
          }}
        >
          <span>Below 15</span>
          <span style={{ color: "#34d399" }}>Ideal 20–25</span>
          <span>40+</span>
        </div>
      </div>
    </AbsoluteFill>
  );
}

export function OngoingWorkloadMonitor({ count }: { count: number }) {
  const tier = getOngoingWorkloadTier(count);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReduceMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  return (
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Ongoing workload</p>
          <p className="mt-1 text-xs text-muted-foreground">{tier.guidance}</p>
        </div>
        <span
          className="shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold"
          style={{
            backgroundColor: tier.softColor,
            borderColor: `${tier.color}66`,
            color: tier.color,
          }}
        >
          {tier.label}
        </span>
      </div>
      <div className="mt-2 min-w-0 max-w-full">
        <Player
          component={WorkloadIllustration}
          inputProps={{ count, reduceMotion }}
          durationInFrames={60}
          compositionWidth={640}
          compositionHeight={64}
          fps={30}
          autoPlay={!reduceMotion}
          loop={!reduceMotion}
          controls={false}
          clickToPlay={false}
          style={{ aspectRatio: "10 / 1", maxWidth: "100%", width: "100%" }}
        />
      </div>
      <p className="sr-only" aria-live="polite">
        {count} ongoing projects. {tier.label}. {tier.guidance}.
      </p>
    </div>
  );
}
