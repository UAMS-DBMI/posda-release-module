import { Link, Outlet, useLocation } from "react-router-dom";
import { Card } from "@/components/ui/Card";

const dashboardLinks = [
  { to: "/dashboard", label: "Overview" },
  { to: "/dashboard/settings", label: "Settings" },
];

export default function DashboardLayout() {
  const { pathname } = useLocation();

  return (
    <div className="content-width flex min-h-screen gap-8 px-4 py-8 sm:px-6">
      <Card as="aside" className="w-44 shrink-0">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Dashboard
        </p>
        <nav className="flex flex-col gap-1">
          {dashboardLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`rounded-md px-3 py-2 text-sm transition-colors ${
                pathname === link.to
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "text-zinc-700 hover:bg-zinc-100 hover:text-black dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </Card>

      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
