import { useLocation } from "react-router-dom";
import { LinkButton } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/Card";
import { PageDetailHeader, PageShell } from "@/components/ui/Page";

/** Catch-all so a mistyped or stale URL says so instead of rendering an empty
 *  page, which is indistinguishable from a crash. */
export default function NotFound() {
  const { pathname } = useLocation();

  return (
    <PageShell size="3xl">
      <PageDetailHeader
        title="Page not found"
        breadcrumb={{ label: "Dashboard", href: "/" }}
      />
      <SectionCard className="mt-4">
        <p className="text-sm">
          Nothing is routed at{" "}
          <code
            className="rounded px-1.5 py-0.5 text-xs"
            style={{ background: "var(--surface-alt)" }}
          >
            {pathname}
          </code>
          .
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <LinkButton href="/">Dashboard</LinkButton>
          <LinkButton href="/datasets" variant="ghost">
            Datasets
          </LinkButton>
          <LinkButton href="/recordsets" variant="ghost">
            Recordsets
          </LinkButton>
        </div>
      </SectionCard>
    </PageShell>
  );
}
