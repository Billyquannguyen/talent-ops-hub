import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/active-campaigns")({
  component: ActiveCampaignsLayout,
});

function ActiveCampaignsLayout() {
  return <Outlet />;
}
