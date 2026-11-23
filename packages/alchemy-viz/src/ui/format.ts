export function formatBytes(n: number | undefined | null) {
  if(n === undefined || n === null) return "—";
  if(n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while(v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export function formatTime(value: Date | string | number | undefined | null) {
  if(value === undefined || value === null) return "—";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

export function formatRelative(value: Date | string | number) {
  const d = value instanceof Date ? value : new Date(value);
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if(s < 60) return `${s}s ago`;
  if(s < 3600) return `${Math.round(s / 60)}m ago`;
  if(s < 86400) return `${Math.round(s / 3600)}h ago`;
  return d.toLocaleDateString();
}
