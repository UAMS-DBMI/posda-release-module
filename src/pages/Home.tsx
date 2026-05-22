import { PageDetailHeader, PageShell } from "@/components/ui/Page";

export default function Home() {
  return (
    <PageShell>
      <PageDetailHeader title="Dashboard" />
      <p className="mt-6 text-sm" style={{ color: "var(--muted)" }}>
        Coming soon
      </p>
    </PageShell>
  );
}
