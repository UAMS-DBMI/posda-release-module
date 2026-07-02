import { Link, useLocation } from "react-router-dom";

const sections = [
  { label: "Datasets",   home: "/datasets",   prefix: "/datasets" },
  { label: "Recordsets", home: "/recordsets", prefix: "/recordsets" },
  { label: "Transfers",  home: "/transfers",  prefix: "/transfers" },
  { label: "QC",         home: "/qc/queue",   prefix: "/qc" },
] as const;

export default function SubNav() {
  const { pathname } = useLocation();
  const activeSection = sections.find((s) => pathname.startsWith(s.prefix)) ?? null;

  return (
    <div
      className="subnav fixed inset-x-0 z-40"
      style={{ top: "var(--navbar-height)", height: "var(--subnav-height)" }}
    >
      <nav className="content-width flex h-full items-center px-4 sm:px-6">
        {sections.map((section) => {
          const isActive = activeSection?.prefix === section.prefix;
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
      </nav>
    </div>
  );
}
