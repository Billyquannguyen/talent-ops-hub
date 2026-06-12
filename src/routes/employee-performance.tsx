import { createFileRoute } from "@tanstack/react-router";

import { EmployeeProfilePage } from "@/features/employee-profile/EmployeeProfilePage";

export const Route = createFileRoute("/employee-performance")({
  component: EmployeeProfilePage,
});
