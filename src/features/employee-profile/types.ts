export const employeeAccountCategories = [
  "Communication",
  "Social",
  "Workspace",
  "Custom",
] as const;

export type EmployeeAccountCategory = (typeof employeeAccountCategories)[number];

export type EmployeeAccountLink = {
  id: string;
  label: string;
  category: EmployeeAccountCategory;
  url: string;
  handle: string;
  notes: string;
};

export type EmployeeProfile = {
  displayName: string;
  role: string;
  avatarUrl: string;
  bio: string;
  joiningDate: string;
  timezone: string;
  primaryMarkets: string;
  responsibilities: string;
  workEmail: string;
  phone: string;
  lineId: string;
  telegram: string;
  preferredContactMethod: string;
  accounts: EmployeeAccountLink[];
  updatedAt: string;
};
