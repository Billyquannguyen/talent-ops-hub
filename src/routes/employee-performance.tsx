import { createFileRoute } from "@tanstack/react-router";

import { EmployeePerformanceTracking } from "@/features/employee-performance/EmployeePerformanceTracking";

export const Route = createFileRoute("/employee-performance")({
  component: EmployeePerformanceTracking,
});
