/** `Cloudflare.KV.Namespace` → { provider: "Cloudflare", name: "KV Namespace" }. */
export function typeLabel(type: string) {
  const [provider, ...rest] = type.split(".");
  const name = rest.length ? rest.join(" ") : provider!;
  const spaced = name
    .replace(/([a-z])([A-Z0-9])/g, "$1 $2")
    .replace(/([0-9])([A-Z][a-z])/g, "$1 $2")
    .replace(/\b([A-Z]) ([0-9])\b/g, "$1$2"); // keep "D1", "R2" together
  return { provider: rest.length ? provider! : "", name: spaced };
}

/** Two-letter monogram for a resource type, shown as its icon. */
export function typeMonogram(type: string) {
  const known: Record<string, string> = {
    "Cloudflare.Worker": "W",
    "Cloudflare.KV.Namespace": "KV",
    "Cloudflare.D1Database": "D1",
    "Cloudflare.D1.Database": "D1",
    "Cloudflare.R2.Bucket": "R2",
    "Cloudflare.Queues.Queue": "Q",
    "Cloudflare.DurableObject": "DO"
  };
  if(known[type]) return known[type];
  const last = type.split(".").at(-1) ?? type;
  const caps = last.match(/[A-Z0-9]/g)?.join("") ?? last;
  return (caps.length >= 2 ? caps : last).slice(0, 2).toUpperCase();
}
