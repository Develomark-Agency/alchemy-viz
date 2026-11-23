/**
 * Fills the example's local resources with varied test data: KV keys of
 * every shape, a small shop database in D1, and an R2 bucket of real files
 * (PNG/JPEG/GIF/HEIC/TIFF/BMP images, multi-page PDFs, audio, CSV, JSON,
 * compressed and binary blobs) from a few bytes to several megabytes.
 *
 * Run while `alchemy dev` is up (it owns the stage's state):
 *   bun run seed
 *
 * Writes go to the same `.alchemy/local` storage the dev simulators use, so
 * the running Worker sees them immediately. Safe to run again: keys and
 * objects are overwritten and tables are recreated.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { deflateSync, gzipSync } from "node:zlib";

const root = resolve(import.meta.dir, "..");
const stage = process.env.ALCHEMY_STAGE ?? `dev_${process.env.USER ?? "unknown"}`;

function attr(fqn: string) {
  const file = join(root, ".alchemy", "state", "VizExample", stage, `${fqn}.json`);
  try {
    return JSON.parse(readFileSync(file, "utf8")).attr;
  } catch {
    throw new Error(`No state for ${fqn} in stage ${stage}. Start \`bun run dev\` first.`);
  }
}

// ---------------------------------------------------------------------------
// Deterministic randomness, so every run produces the same data.

let seed = 0x2f6e2b1;
function rand() {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 0xffffffff;
}
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)]!;
}
function int(min: number, max: number) {
  return Math.floor(min + rand() * (max - min + 1));
}

// ---------------------------------------------------------------------------
// PNG encoder (RGBA, no filtering): enough to write real images without a library.

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for(let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff;
  for(const b of bytes) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function png(width: number, height: number, pixel: (x: number, y: number) => [number, number, number, number?]) {
  const raw = new Uint8Array(height * (width * 4 + 1));
  let i = 0;
  for(let y = 0; y < height; y++) {
    raw[i++] = 0;
    for(let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = pixel(x, y);
      raw[i++] = r;
      raw[i++] = g;
      raw[i++] = b;
      raw[i++] = a;
    }
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", new Uint8Array())
  ];
  return Buffer.concat(parts);
}

function hsl(h: number, s: number, l: number): [number, number, number] {
  function k(n: number) {
    return (n + h / 30) % 12;
  }
  const a = s * Math.min(l, 1 - l);
  function f(n: number) {
    return l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  }
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

const images = {
  mandelbrot: (w: number, h: number) => png(w, h, (x, y) => {
    const cx = (x / w) * 3.2 - 2.2;
    const cy = (y / h) * 2.4 - 1.2;
    let zx = 0;
    let zy = 0;
    let n = 0;
    while(zx * zx + zy * zy < 4 && n < 80) {
      [zx, zy] = [zx * zx - zy * zy + cx, 2 * zx * zy + cy];
      n++;
    }
    return n === 80 ? [10, 10, 20] : hsl((n * 9 + 200) % 360, 0.85, 0.15 + (n / 80) * 0.6);
  }),
  gradient: (w: number, h: number) => png(w, h, (x, y) => hsl(20 + (x / w) * 60 - (y / h) * 30, 0.9, 0.45 + (y / h) * 0.2)),
  plasma: (w: number, h: number) => png(w, h, (x, y) => {
    const v = Math.sin(x / 23) + Math.sin(y / 17) + Math.sin((x + y) / 29) + Math.sin(Math.hypot(x - w / 2, y - h / 2) / 13);
    return hsl(((v + 4) / 8) * 360, 0.7, 0.55);
  }),
  rings: (w: number, h: number) => png(w, h, (x, y) => {
    const d = Math.hypot(x - w / 2, y - h / 2);
    return Math.floor(d / 12) % 2 ? [234, 88, 12] : [255, 241, 230];
  }),
  checker: (w: number, h: number) => png(w, h, (x, y) => ((Math.floor(x / 16) + Math.floor(y / 16)) % 2 ? [40, 40, 46, 255] : [0, 0, 0, 0])),
  noise: (w: number, h: number) => png(w, h, () => [int(0, 255), int(0, 255), int(0, 255)])
};

const tmp = mkdtempSync(join(tmpdir(), "alchemy-viz-seed-"));

/** Converts a PNG with macOS `sips`; returns undefined where it isn't available. */
function convert(pngBytes: Buffer, format: string, ext: string) {
  const input = join(tmp, `in-${Math.random().toString(36).slice(2)}.png`);
  const output = input.replace(/\.png$/, `.${ext}`);
  writeFileSync(input, pngBytes);
  const result = spawnSync("sips", ["-s", "format", format, input, "--out", output], { stdio: "ignore" });
  if(result.status !== 0) return undefined;
  return readFileSync(output);
}

// ---------------------------------------------------------------------------
// PDF writer: valid multi-page documents with text, using the built-in Helvetica.

function pdf(title: string, pages: string[][]) {
  const objects: string[] = [];
  const pageIds: number[] = [];
  // 1: catalog, 2: pages, 3: font, 4: info; pages and contents follow.
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = `<< /Title (${title}) /Producer (alchemy-viz seed) >>`;
  let next = 5;
  for(const lines of pages) {
    function esc(s: string) {
      return s.replace(/[\\()]/g, m => `\\${m}`);
    }
    const body = ["BT", "/F1 20 Tf", "72 760 Td", `(${esc(lines[0] ?? "")}) Tj`, "/F1 11 Tf", "0 -30 Td", ...lines.slice(1).flatMap(l => [`(${esc(l)}) Tj`, "0 -16 Td"]), "ET"].join("\n");
    const contentId = next++;
    const pageId = next++;
    objects[contentId] = `<< /Length ${Buffer.byteLength(body)} >>\nstream\n${body}\nendstream`;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    pageIds.push(pageId);
  }
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offsets: number[] = [];
  for(let id = 1; id < next; id++) {
    offsets[id] = Buffer.byteLength(out, "latin1");
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${next}\n0000000000 65535 f \n`;
  for(let id = 1; id < next; id++) out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${next} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

// ---------------------------------------------------------------------------
// WAV writer: a short chord, 16-bit mono.

function wav(seconds: number, freqs: number[]) {
  const rate = 22050;
  const samples = Math.floor(rate * seconds);
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples * 2, 40);
  for(let i = 0; i < samples; i++) {
    const t = i / rate;
    const env = Math.min(1, t * 20) * Math.min(1, (seconds - t) * 4);
    const v = freqs.reduce((sum, f) => sum + Math.sin(2 * Math.PI * f * t), 0) / freqs.length;
    buf.writeInt16LE(Math.round(v * env * 12000), 44 + i * 2);
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Sample people, products and copy.

const firstNames = ["Ada", "Grace", "Alan", "Linus", "Margaret", "Katherine", "Dennis", "Barbara", "Ken", "Radia", "Tim", "Frances", "Edsger", "Hedy", "John", "Sophie", "Yukihiro", "Guido", "Anders", "Brendan", "Rasmus", "Jean", "Shafi", "Leslie"];
const lastNames = ["Lovelace", "Hopper", "Turing", "Torvalds", "Hamilton", "Johnson", "Ritchie", "Liskov", "Thompson", "Perlman", "Berners-Lee", "Allen", "Dijkstra", "Lamarr", "McCarthy", "Wilson", "Matsumoto", "van Rossum", "Hejlsberg", "Eich", "Lerdorf", "Sammet", "Goldwasser", "Lamport"];
const cities = ["Lisbon", "Osaka", "Toronto", "Nairobi", "Berlin", "Austin", "Melbourne", "Bogotá", "Oslo", "Seoul", "Cape Town", "Dublin"];
const products = [
  ["Mechanical keyboard", "hardware", 149],
  ["USB-C hub", "hardware", 59],
  ["4K monitor", "hardware", 429],
  ["Ergonomic mouse", "hardware", 89],
  ["Standing desk", "furniture", 649],
  ["Desk lamp", "furniture", 79],
  ["Noise-cancelling headphones", "audio", 299],
  ["Studio microphone", "audio", 189],
  ["Webcam", "video", 129],
  ["Ring light", "video", 49],
  ["Laptop stand", "accessories", 45],
  ["Cable organizer", "accessories", 19],
  ["Notebook (dot grid)", "stationery", 14],
  ["Fountain pen", "stationery", 38],
  ["Coffee subscription", "subscriptions", 24],
  ["Cloud credits ($100)", "subscriptions", 100],
  ["Sticker pack", "swag", 6],
  ["Hoodie", "swag", 55],
  ["Water bottle", "swag", 22],
  ["E-book: Effect in Practice", "books", 29]
] as const;
const statuses = ["pending", "paid", "shipped", "delivered", "refunded", "cancelled"] as const;
const eventTypes = ["page_view", "sign_up", "login", "add_to_cart", "checkout", "search", "error"] as const;
const paths = ["/", "/pricing", "/docs", "/docs/getting-started", "/blog", "/blog/alchemy-v2", "/account", "/cart", "/checkout"];

function email(first: string, last: string, n: number) {
  return `${first}.${last}${n > 1 ? n : ""}@example.com`.toLowerCase().replace(/[^a-z0-9.@-]/g, "");
}

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000 - int(0, 86_399) * 1000).toISOString().replace("T", " ").slice(0, 19);
}

// ---------------------------------------------------------------------------

const cf = dirname(Bun.resolveSync("@alchemy.run/cloudflare/package.json", root));
const { getPlatformProxy } = await import(Bun.resolveSync("@alchemy.run/cloudflare-runtime/core/platform-proxy", cf));
const bindings = await import(Bun.resolveSync("@alchemy.run/cloudflare-runtime/core/bindings", cf));

const kvId: string = attr("Cache").namespaceId;
const dbId: string = attr("AppDB").databaseId;
const bucketId: string = attr("Uploads").bucketName;
const flagsFile: string = attr("Flags").file;

const proxy = await getPlatformProxy({
  name: "alchemy-viz-seed",
  persist: { directory: join(root, ".alchemy", "local") },
  bindings: [
    bindings.KvNamespace.local({ binding: "KV", id: kvId }),
    bindings.D1.local({ binding: "DB", id: dbId }),
    bindings.R2Bucket.local({ binding: "R2", id: bucketId })
  ]
});
const { KV, DB, R2 } = proxy.env as Record<string, any>;

try {
  // ----- D1: a small shop --------------------------------------------------
  console.log("D1: creating tables…");
  // `exec()` and `batch()` don't survive the platform proxy; single statements do.
  const schema = [
    "DROP VIEW IF EXISTS order_totals",
    "DROP TABLE IF EXISTS product_tags",
    "DROP TABLE IF EXISTS events",
    "DROP TABLE IF EXISTS order_items",
    "DROP TABLE IF EXISTS orders",
    "DROP TABLE IF EXISTS products",
    "CREATE TABLE products (id INTEGER PRIMARY KEY, sku TEXT NOT NULL UNIQUE, name TEXT NOT NULL, category TEXT NOT NULL, price_cents INTEGER NOT NULL, stock INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1)",
    "CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), status TEXT NOT NULL, total_cents INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'USD', shipping_city TEXT, note TEXT, created_at TEXT NOT NULL)",
    "CREATE TABLE order_items (id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), product_id INTEGER NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL, unit_price_cents INTEGER NOT NULL)",
    "CREATE TABLE product_tags (product_id INTEGER NOT NULL REFERENCES products(id), tag TEXT NOT NULL, added_at TEXT NOT NULL, PRIMARY KEY (product_id, tag))",
    "CREATE TABLE events (id INTEGER PRIMARY KEY, type TEXT NOT NULL, user_id INTEGER, path TEXT, payload TEXT, at TEXT NOT NULL)",
    "CREATE VIEW order_totals AS SELECT u.name AS customer, COUNT(o.id) AS orders, SUM(o.total_cents) / 100.0 AS spent_usd FROM users u JOIN orders o ON o.user_id = u.id WHERE o.status NOT IN ('refunded', 'cancelled') GROUP BY u.id ORDER BY spent_usd DESC"
  ];
  for(const sql of schema) await DB.prepare(sql).run();

  function literal(v: unknown) {
    if(v === null || v === undefined) return "NULL";
    if(typeof v === "number") return String(v);
    return `'${String(v).replace(/'/g, "''")}'`;
  }

  // Multi-row inserts with literal values: few statements, no bound-parameter limit.
  async function insert(sql: string, rows: unknown[][]) {
    const head = sql.slice(0, sql.indexOf("VALUES") + 6);
    for(let i = 0; i < rows.length; i += 200) {
      const values = rows.slice(i, i + 200).map(r => `(${r.map(literal).join(", ")})`).join(",\n");
      await DB.prepare(`${head} ${values}`).run();
    }
  }

  const existing = (await DB.prepare("SELECT email FROM users").all()).results as Array<{ email: string }>;
  const taken = new Set(existing.map(u => u.email));
  const newUsers: unknown[][] = [];
  for(let n = 0; taken.size < 64 && n < 10_000; n++) {
    const first = pick(firstNames);
    const last = pick(lastNames);
    const mail = email(first, last, Math.floor(n / 20) + 1);
    if(taken.has(mail)) continue;
    taken.add(mail);
    newUsers.push([mail, `${first} ${last}`, isoDaysAgo(int(1, 400))]);
  }
  await insert("INSERT INTO users (email, name, created_at) VALUES (?, ?, ?)", newUsers);
  const userIds = ((await DB.prepare("SELECT id FROM users").all()).results as Array<{ id: number }>).map(u => u.id);

  await insert(
    "INSERT INTO products (sku, name, category, price_cents, stock, active) VALUES (?, ?, ?, ?, ?, ?)",
    products.map(([name, category, price], i) => [`SKU-${String(1000 + i * 7)}`, name, category, price * 100, int(0, 250), rand() > 0.1 ? 1 : 0])
  );

  const tagNames = ["bestseller", "new", "sale", "eco", "limited", "gift", "pro"];
  const productTags: unknown[][] = [];
  for(let id = 1; id <= products.length; id++) {
    for(const tag of tagNames.filter(() => rand() > 0.6)) productTags.push([id, tag, isoDaysAgo(int(1, 200))]);
  }
  await insert("INSERT INTO product_tags (product_id, tag, added_at) VALUES (?, ?, ?)", productTags);

  const orders: unknown[][] = [];
  const items: unknown[][] = [];
  for(let id = 1; id <= 240; id++) {
    let total = 0;
    for(let k = int(1, 4); k > 0; k--) {
      const productId = int(1, products.length);
      const quantity = int(1, 3);
      const unit = products[productId - 1]![2] * 100;
      total += unit * quantity;
      items.push([id, productId, quantity, unit]);
    }
    orders.push([id, pick(userIds), pick(statuses), total, rand() > 0.85 ? "EUR" : "USD", pick(cities), rand() > 0.8 ? "Leave at the front desk" : null, isoDaysAgo(int(0, 120))]);
  }
  await insert("INSERT INTO orders (id, user_id, status, total_cents, currency, shipping_city, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", orders);
  await insert("INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents) VALUES (?, ?, ?, ?)", items);

  const events: unknown[][] = [];
  for(let i = 0; i < 1500; i++) {
    const type = pick(eventTypes);
    const payload = type === "search"
      ? { query: pick(["keyboard", "desk", "effect", "pricing", "d1 limits"]), results: int(0, 40) }
      : type === "error"
        ? { code: pick([400, 404, 429, 500]), message: pick(["Not found", "Rate limited", "Internal error", "Bad request"]) }
        : type === "add_to_cart"
          ? { productId: int(1, products.length), quantity: int(1, 3) }
          : { referrer: pick(["google", "twitter", "github", null]), ua: pick(["Chrome", "Safari", "Firefox"]) };
    events.push([type, rand() > 0.3 ? pick(userIds) : null, pick(paths), JSON.stringify(payload), isoDaysAgo(rand() * 30)]);
  }
  await insert("INSERT INTO events (type, user_id, path, payload, at) VALUES (?, ?, ?, ?, ?)", events);
  console.log(`D1: ${userIds.length} users, ${products.length} products, ${productTags.length} product tags, ${orders.length} orders, ${items.length} order items, ${events.length} events, 1 view`);

  // ----- KV: keys of every shape -------------------------------------------
  console.log("KV: writing keys…");
  const kvWrites: Array<[string, string, Record<string, unknown>?]> = [];
  for(let i = 0; i < 40; i++) {
    const id = userIds[i % userIds.length];
    kvWrites.push([`user:${id}:profile`, JSON.stringify({ id, theme: pick(["light", "dark", "system"]), locale: pick(["en-US", "pt-PT", "ja-JP", "de-DE"]), plan: pick(["free", "pro", "team"]), lastSeen: isoDaysAgo(rand() * 10) }), { kind: "profile" }]);
  }
  for(let i = 0; i < 25; i++) {
    const token = Array.from({ length: 24 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[int(0, 35)]).join("");
    kvWrites.push([`session:${token}`, JSON.stringify({ userId: pick(userIds), ip: `10.0.${int(0, 255)}.${int(1, 254)}`, createdAt: new Date().toISOString(), scopes: ["read", ...(rand() > 0.5 ? ["write"] : [])] }), { kind: "session", ttl: "1 day" }]);
  }
  for(const p of paths) {
    kvWrites.push([`cache:html:${p}`, `<!doctype html><html><head><title>${p}</title></head><body><main><h1>Cached ${p}</h1><p>Rendered at ${new Date().toISOString()}</p></main></body></html>`, { contentType: "text/html", etag: `W/"${int(1e5, 9e5)}"` }]);
  }
  for(let i = 0; i < 12; i++) kvWrites.push([`rate:ip:203.0.113.${i + 10}`, String(int(1, 120))]);
  kvWrites.push(["config:app", JSON.stringify({ name: "VizExample", version: "2.4.1", features: { search: true, checkout: { provider: "stripe", currencies: ["USD", "EUR"], retries: 3 }, banner: null }, limits: { uploadMb: 25, requestsPerMinute: 120 } }, null, 2), { owner: "platform" }]);
  kvWrites.push(["config:i18n:pt-PT", JSON.stringify({ greeting: "Olá", cart: "Carrinho", checkout: "Finalizar compra" })]);
  kvWrites.push(["config:i18n:ja-JP", JSON.stringify({ greeting: "こんにちは", cart: "カート", checkout: "購入手続き" })]);
  kvWrites.push(["feature:new-checkout:rollout", "25"]);
  kvWrites.push(["feature:dark-mode:enabled", "true"]);
  kvWrites.push(["empty", ""]);
  kvWrites.push(["emoji:🔥", "keys can hold unicode too ✨"]);
  kvWrites.push(["with spaces and/slashes", "odd key names render fine"]);
  kvWrites.push(["blob:large-json", JSON.stringify({ generatedAt: new Date().toISOString(), rows: Array.from({ length: 1200 }, (_, i) => ({ i, value: rand(), label: pick(firstNames) })) }), { kind: "large", note: "about 50 KB" }]);
  kvWrites.push(["text:lorem", Array.from({ length: 40 }, () => "Alchemy keeps infrastructure as plain TypeScript, so a dev dashboard can read it like any other program.").join(" ")]);

  for(const [key, value, metadata] of kvWrites) {
    await KV.put(key, value, { metadata, expirationTtl: key.startsWith("session:") ? 86_400 : undefined });
  }
  console.log(`KV: ${kvWrites.length} keys`);

  // ----- R2: real files ----------------------------------------------------
  console.log("R2: generating files…");
  const files: Array<[string, Uint8Array, string, Record<string, string>?]> = [];
  const hero = images.mandelbrot(1600, 1000);
  files.push(["images/hero-mandelbrot.png", hero, "image/png", { alt: "Mandelbrot set", source: "seed" }]);
  files.push(["images/gradient-1920x1080.png", images.gradient(1920, 1080), "image/png"]);
  files.push(["images/plasma-800x600.png", images.plasma(800, 600), "image/png"]);
  files.push(["images/rings-512.png", images.rings(512, 512), "image/png"]);
  files.push(["images/icons/checker-64.png", images.checker(64, 64), "image/png"]);
  files.push(["images/icons/checker-256.png", images.checker(256, 256), "image/png"]);
  files.push(["images/noise-1024.png", images.noise(1024, 1024), "image/png", { note: "incompressible, about 4 MB" }]);
  const conversions: Array<[string, string, string, Buffer]> = [
    ["jpeg", "jpg", "image/jpeg", hero],
    ["gif", "gif", "image/gif", images.rings(400, 400)],
    ["heic", "heic", "image/heic", images.plasma(1200, 800)],
    ["tiff", "tiff", "image/tiff", images.gradient(640, 480)],
    ["bmp", "bmp", "image/bmp", images.checker(128, 128)]
  ];
  for(const [format, ext, type, source] of conversions) {
    const out = convert(source, format, ext);
    if(out) files.push([`images/formats/sample.${ext}`, out, type]);
    else console.log(`  (skipped .${ext}: sips not available)`);
  }
  files.push(["images/logo.svg", new TextEncoder().encode("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\" width=\"256\" height=\"256\"><path d=\"M12 3h8v2h-2v7l8 14a2 2 0 0 1-2 3H8a2 2 0 0 1-2-3l8-14V5h-2z\" fill=\"#ea580c\"/></svg>"), "image/svg+xml"]);

  function invoice(n: number) {
    return pdf(`Invoice ${n}`, [[`Invoice #INV-${n}`, `Billed to: ${pick(firstNames)} ${pick(lastNames)}`, `Date: ${isoDaysAgo(int(1, 60)).slice(0, 10)}`, "", ...Array.from({ length: int(2, 6) }, () => { const p = pick(products); return `${p[0]} ........ $${p[2]}.00`; }), "", "Thank you for your order."]]);
  }
  files.push(["docs/invoices/INV-1042.pdf", invoice(1042), "application/pdf", { customer: "acct_1042" }]);
  files.push(["docs/invoices/INV-1043.pdf", invoice(1043), "application/pdf", { customer: "acct_1043" }]);
  files.push(["docs/handbook.pdf", pdf("Engineering handbook", Array.from({ length: 48 }, (_, i) => [`Chapter ${i + 1}`, ...Array.from({ length: 36 }, (_, l) => `Section ${i + 1}.${l + 1}: notes on deploys, dev stages, state stores and local simulators.`)])), "application/pdf", { pages: "48" }]);
  files.push(["docs/README.md", new TextEncoder().encode("# Uploads bucket\n\nSeeded by `bun run seed`.\n\n- `images/`: generated PNG, JPEG, GIF, HEIC, TIFF, BMP and SVG\n- `docs/`: PDFs and Markdown\n- `exports/`: CSV, JSON and gzip\n- `audio/`: a WAV chord\n- `bin/`: raw bytes\n"), "text/markdown"]);

  const csvRows = ["id,customer,city,status,total_usd,created_at", ...orders.map(o => [o[0], `"${pick(firstNames)} ${pick(lastNames)}"`, o[5], o[2], ((o[3] as number) / 100).toFixed(2), o[7]].join(","))];
  const csv = new TextEncoder().encode(csvRows.join("\n"));
  files.push(["exports/2026/11/orders.csv", csv, "text/csv"]);
  files.push(["exports/2026/11/orders.csv.gz", gzipSync(csv), "application/gzip", { encoding: "gzip", rows: String(orders.length) }]);
  files.push(["exports/2026/11/products.json", new TextEncoder().encode(JSON.stringify(products.map(([name, category, price], i) => ({ id: i + 1, name, category, price })), null, 2)), "application/json"]);
  files.push(["exports/events.ndjson", new TextEncoder().encode(events.slice(0, 400).map(e => JSON.stringify({ type: e[0], userId: e[1], path: e[2], payload: JSON.parse(e[3] as string), at: e[4] })).join("\n")), "application/x-ndjson"]);
  files.push(["site/index.html", new TextEncoder().encode("<!doctype html>\n<html lang=\"en\">\n<head><meta charset=\"utf-8\"><title>VizExample</title><link rel=\"stylesheet\" href=\"styles.css\"></head>\n<body>\n  <h1>Hello from R2</h1>\n  <script src=\"app.js\"></script>\n</body>\n</html>\n"), "text/html"]);
  files.push(["site/styles.css", new TextEncoder().encode("body { font: 16px/1.5 system-ui; margin: 4rem auto; max-width: 40rem; }\nh1 { color: #ea580c; }\n"), "text/css"]);
  files.push(["site/app.js", new TextEncoder().encode("document.querySelector('h1').addEventListener('click', () => alert('Served from a local R2 bucket'));\n"), "application/javascript"]);
  files.push(["audio/chord.wav", wav(2.5, [261.63, 329.63, 392]), "audio/wav", { notes: "C E G" }]);
  files.push(["bin/random-3mb.bin", Uint8Array.from({ length: 3 * 1024 * 1024 }, () => int(0, 255)), "application/octet-stream"]);
  files.push(["bin/tiny.bin", new Uint8Array([0xde, 0xad, 0xbe, 0xef]), "application/octet-stream"]);
  files.push(["empty.txt", new Uint8Array(), "text/plain"]);

  let bytes = 0;
  for(const [key, body, contentType, customMetadata] of files) {
    await R2.put(key, body, { httpMetadata: { contentType }, customMetadata });
    bytes += body.byteLength;
  }
  console.log(`R2: ${files.length} objects, ${(bytes / 1024 / 1024).toFixed(1)} MB`);

  // ----- Flags --------------------------------------------------------------
  const flags = JSON.parse(readFileSync(flagsFile, "utf8"));
  Object.assign(flags, { newOnboarding: true, searchV2: false, darkModeDefault: false, invoicePdfs: true, betaApiKeys: false });
  writeFileSync(flagsFile, JSON.stringify(flags, null, 2));
  console.log(`Flags: ${Object.keys(flags).length} flags`);
} finally {
  await proxy.dispose();
  rmSync(tmp, { recursive: true, force: true });
}
