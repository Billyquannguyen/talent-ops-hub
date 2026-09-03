import { Player } from "@remotion/player";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";

type WorkloadTier = {
  label: string;
  guidance: string;
  color: string;
  softColor: string;
};

export function getOngoingWorkloadTier(count: number): WorkloadTier {
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

function WorkloadIllustration({ count }: { count: number }) {
  const frame = useCurrentFrame();
  const tier = getOngoingWorkloadTier(count);
  const chartMaximum = 45;
  const markerPosition = Math.min(Math.max(count, 0), chartMaximum) / chartMaximum;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "transparent",
        color: "#f8fafc",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        justifyContent: "center",
        padding: "24px 28px",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div style={{ color: "#94a3b8", fontSize: 20 }}>ONGOING WORKLOAD</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 6 }}>
            <strong style={{ fontSize: 54, lineHeight: 1 }}>{count}</strong>
            <span style={{ color: "#cbd5e1", fontSize: 21 }}>projects</span>
          </div>
        </div>
        <div
          style={{
            backgroundColor: tier.softColor,
            border: `1px solid ${tier.color}66`,
            borderRadius: 999,
            color: tier.color,
            fontSize: 19,
            fontWeight: 700,
            opacity: interpolate(frame, [8, 24], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            padding: "7px 13px",
          }}
        >
          {tier.label}
        </div>
      </div>

      <div style={{ marginTop: 26, position: "relative" }}>
        <div
          style={{
            backgroundColor: "rgba(148, 163, 184, 0.15)",
            borderRadius: 999,
            height: 15,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              backgroundColor: tier.color,
              borderRadius: 999,
              height: "100%",
              width: `${interpolate(frame, [0, 32], [0, markerPosition * 100], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              })}%`,
            }}
          />
        </div>
        <div
          style={{
            backgroundColor: tier.color,
            border: "4px solid #111827",
            borderRadius: "50%",
            boxShadow: `0 0 24px ${tier.color}88`,
            height: 26,
            left: `${interpolate(frame, [0, 32], [0, markerPosition * 100], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            })}%`,
            position: "absolute",
            top: -6,
            translate: "-50% 0",
            width: 26,
          }}
        />
        <div
          style={{
            color: "#64748b",
            display: "flex",
            fontSize: 16,
            justifyContent: "space-between",
            marginTop: 12,
          }}
        >
          <span>0</span>
          <span style={{ color: "#34d399" }}>Ideal 20–25</span>
          <span>40+</span>
        </div>
      </div>
    </AbsoluteFill>
  );
}

export function OngoingWorkloadMonitor({ count }: { count: number }) {
  const tier = getOngoingWorkloadTier(count);

  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-border/70 bg-background/55">
        <Player
          component={WorkloadIllustration}
          inputProps={{ count }}
          durationInFrames={60}
          compositionWidth={640}
          compositionHeight={250}
          fps={30}
          autoPlay
          controls={false}
          clickToPlay={false}
          style={{ aspectRatio: "640 / 250", width: "100%" }}
        />
      </div>
      <p className="sr-only" aria-live="polite">
        {count} ongoing projects. {tier.label}. {tier.guidance}.
      </p>
    </div>
  );
}
