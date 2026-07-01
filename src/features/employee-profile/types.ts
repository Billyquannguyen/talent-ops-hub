export type EmployeeAccountCategory = "Communication" | "Social" | "Workspace";

export type EmployeeAccountLink = {
  serviceId: string;
  label: string;
  category: EmployeeAccountCategory;
  url: string;
};

export type EmployeeProfile = {
  displayName: string;
  avatarUrl: string;
  joiningDate: string;
  monthlySalary: number;
  currency: string;
  notes: string;
  accounts: EmployeeAccountLink[];
  updatedAt: string;
};
