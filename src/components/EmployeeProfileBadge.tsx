import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import {
  employeeProfileStorageKey,
  employeeProfileUpdatedEvent,
  loadEmployeeProfile,
} from "@/features/employee-profile/storage";
import type { EmployeeProfile } from "@/features/employee-profile/types";
import { cn } from "@/lib/utils";

type EmployeeProfileBadgeProps = {
  size?: "sm" | "md";
  className?: string;
};

export function EmployeeProfileBadge({ size = "md", className }: EmployeeProfileBadgeProps) {
  const [profile, setProfile] = useState<EmployeeProfile>(() => loadEmployeeProfile());

  useEffect(() => {
    function refreshFromLocal() {
      setProfile(loadEmployeeProfile());
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === employeeProfileStorageKey) refreshFromLocal();
    }

    window.addEventListener(employeeProfileUpdatedEvent, refreshFromLocal);
    window.addEventListener("storage", handleStorage);
    refreshFromLocal();

    return () => {
      window.removeEventListener(employeeProfileUpdatedEvent, refreshFromLocal);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const sizeClass = size === "sm" ? "size-8 text-[11px]" : "size-9 text-[11px]";

  return (
    <Link
      to="/employee-profile"
      title={profile.displayName || "Employee Profile"}
      aria-label={`Open employee profile for ${profile.displayName || "Katlas Buddy"}`}
      className={cn(
        "hidden shrink-0 overflow-hidden rounded-full border border-border bg-accent/80 font-semibold ring-1 ring-border transition hover:border-ring/40 hover:bg-card sm:grid",
        sizeClass,
        profile.avatarUrl ? "place-items-stretch p-0" : "place-items-center",
        className,
      )}
    >
      {profile.avatarUrl ? (
        <img
          src={profile.avatarUrl}
          alt={profile.displayName || "Employee profile"}
          className="h-full w-full object-cover"
        />
      ) : (
        getInitials(profile.displayName)
      )}
    </Link>
  );
}

function getInitials(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "KM";
}
