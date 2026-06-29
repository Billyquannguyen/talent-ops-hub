import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { PasswordGate } from "@/components/PasswordGate";
import { getPasswordGateStatus, type PasswordGateStatus } from "@/lib/passwordGate.functions";
import {
  hasPasswordGateAccess,
  markPasswordGateUnlocked,
  passwordGateLockEvent,
} from "@/lib/passwordGate";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Katlas Media Workflow Agent" },
      { name: "description", content: "Creator sourcing workflow automation for Katlas Media." },
      { name: "author", content: "Katlas Media" },
      { property: "og:title", content: "Katlas Media Workflow Agent" },
      {
        property: "og:description",
        content: "Creator sourcing workflow automation for Katlas Media.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        type: "image/svg+xml",
        href: "/china-flag.svg",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const [gateStatus, setGateStatus] = useState<PasswordGateStatus | null>(null);
  const [gateReady, setGateReady] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getPasswordGateStatus()
      .then((status) => {
        if (cancelled) return;
        setGateStatus(status);
        setIsUnlocked(
          status.mode === "dev-bypass" || (status.mode === "protected" && hasPasswordGateAccess()),
        );
      })
      .catch((error) => {
        if (cancelled) return;
        setGateStatus({
          mode: "setup-error",
          configured: false,
          requiresPassword: true,
          message: error instanceof Error ? error.message : "Password gate could not be checked.",
        });
        setIsUnlocked(false);
      })
      .finally(() => {
        if (!cancelled) setGateReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function lockApp() {
      setIsUnlocked(gateStatus?.mode === "dev-bypass");
    }

    window.addEventListener(passwordGateLockEvent, lockApp);
    return () => window.removeEventListener(passwordGateLockEvent, lockApp);
  }, [gateStatus?.mode]);

  function unlockApp() {
    markPasswordGateUnlocked();
    setIsUnlocked(true);
  }

  return (
    <QueryClientProvider client={queryClient}>
      {!gateReady ? (
        <div className="flex min-h-screen items-center justify-center bg-background px-5 text-center text-sm text-muted-foreground">
          Checking access...
        </div>
      ) : !isUnlocked && gateStatus ? (
        <PasswordGate status={gateStatus} onUnlocked={unlockApp} />
      ) : isUnlocked ? (
        <>
          {gateStatus?.mode === "dev-bypass" ? (
            <div className="fixed bottom-4 left-4 z-[80] max-w-sm rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs text-amber-100 shadow-lg backdrop-blur">
              Password gate is bypassed because KATLAS_APP_PASSWORD is not set locally.
            </div>
          ) : null}
          <Outlet />
        </>
      ) : null}
    </QueryClientProvider>
  );
}
