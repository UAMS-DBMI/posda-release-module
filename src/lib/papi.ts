const RESOURCE_ROOTS: Record<string, string> = {
  lookups: "/papi/v1/distribution",
  datasets: "/papi/v1/distribution",
  releases: "/papi/v1/distribution",
  recordsets: "/papi/v1/distribution",
  transfers: "/papi/v1/distribution",
  activities: "/papi/v1",
  collections: "/papi/v1/manager",
  "analysis-results": "/papi/v1/manager",
  downloads: "/papi/v1/manager",
  "wp-object-map": "/papi/v1/manager",
  posda: "/papi/v1/manager",
};

export function papiUrl(path: string): string {
  const cleaned = path.startsWith("/") ? path.slice(1) : path;
  const [resource] = cleaned.split("/");
  const base = RESOURCE_ROOTS[resource];
  if (!base) {
    throw new Error(`Unknown PAPI resource: ${resource}`);
  }
  return `${base}/${cleaned}`;
}

export function papiDownloadUrl(path: string): string {
  const cleaned = path.startsWith("/") ? path.slice(1) : path;
  return `/papi/v1/download/${cleaned}`;
}
