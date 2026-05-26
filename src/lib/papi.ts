export function papiUrl(path: string): string {
  const cleaned = path.startsWith("/") ? path.slice(1) : path;
  return `/papi/v1/${cleaned}`;
}

export function papiDownloadUrl(path: string): string {
  const cleaned = path.startsWith("/") ? path.slice(1) : path;
  return `/papi/v1/download/${cleaned}`;
}
