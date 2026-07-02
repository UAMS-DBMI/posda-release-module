import { Link, useLocation } from "react-router-dom";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useTheme } from "@/lib/useTheme";

const sections = [
  { label: "Dashboard",  home: "/",           prefix: "/" },
  { label: "Datasets",   home: "/datasets",   prefix: "/datasets" },
  { label: "Recordsets", home: "/recordsets", prefix: "/recordsets" },
  { label: "Transfers",  home: "/transfers",  prefix: "/transfers" },
  { label: "QC",         home: "/qc/queue",   prefix: "/qc" },
] as const;

function isSectionActive(prefix: string, pathname: string) {
  if (prefix === "/") return pathname === "/";
  return pathname.startsWith(prefix);
}

function SunIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export default function Navbar() {
  const currentUser = useCurrentUser();
  const { isDark, toggle } = useTheme();
  const { pathname } = useLocation();

  return (
    <header className="navbar fixed inset-x-0 top-0 z-50">
      <nav className="content-width flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex h-full min-w-0 items-center gap-6">
          <Link
            to="/"
            className="shrink-0 text-sm font-bold tracking-wide text-accent"
          >
            Posda Release Module
          </Link>
          <div className="flex h-full items-center">
            {sections.map((section) => {
              const isActive = isSectionActive(section.prefix, pathname);
              return (
                <Link
                  key={section.prefix}
                  to={section.home}
                  className={`flex h-full items-center border-b-2 px-3 text-sm font-medium transition-colors ${
                    isActive
                      ? "border-accent text-accent"
                      : "border-transparent hover:text-foreground"
                  }`}
                  style={isActive ? {} : { color: "var(--muted)" }}
                >
                  {section.label}
                </Link>
              );
            })}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {currentUser && (
            <span
              className="hidden text-sm lg:inline"
              style={{ color: "var(--muted)" }}
            >
              Logged in as:{" "}
              <span
                className="font-medium"
                style={{ color: "var(--foreground)" }}
              >
                {currentUser.username}
              </span>
            </span>
          )}
          <button
            onClick={toggle}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className="rounded p-1.5 transition-colors hover:text-accent"
            style={{ color: "var(--muted)" }}
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </nav>
    </header>
  );
}
