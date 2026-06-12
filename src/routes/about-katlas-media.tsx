import { createFileRoute } from "@tanstack/react-router";

import { AboutKatlasMedia } from "@/features/about-katlas/AboutKatlasMedia";

export const Route = createFileRoute("/about-katlas-media")({
  component: AboutKatlasMedia,
});
