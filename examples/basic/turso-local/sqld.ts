/**
 * The libSQL server binary (`sqld`): downloaded once from the libSQL GitHub
 * release, checked against its published SHA-256, and cached in the same
 * place `turso-alchemy` (V1) keeps it, so the two share one download.
 * macOS and Linux only, like the V1 package's native launcher.
 */
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { arch, homedir, platform } from "node:os";
import { join } from "node:path";

export const SQLD_VERSION = "0.24.32";

function target() {
  const os = platform() === "darwin" ? "apple-darwin" : platform() === "linux" ? "unknown-linux-gnu" : undefined;
  const cpu = arch() === "arm64" ? "aarch64" : arch() === "x64" ? "x86_64" : undefined;
  if(!os || !cpu) throw new Error(`No libSQL server download exists for ${platform()} ${arch()}.`);
  return `${cpu}-${os}`;
}

let pending: Promise<string> | undefined;

/** The path to a verified `sqld`, downloading it on first use. */
export function sqldBinary() {
  pending ??= download().catch(e => {
    pending = undefined;
    throw e;
  });
  return pending;
}

async function download() {
  const t = target();
  const dir = join(homedir(), ".cache", "alchemy", "libsql-server", SQLD_VERSION, t);
  const binary = join(dir, "sqld");
  if(await access(binary).then(() => true, () => false)) return binary;

  const archive = `libsql-server-${t}.tar.xz`;
  const url = `https://github.com/tursodatabase/libsql/releases/download/libsql-server-v${SQLD_VERSION}/${archive}`;
  const [body, sums] = await Promise.all([fetch(url), fetch(`${url}.sha256`)]);
  if(!body.ok || !sums.ok) throw new Error(`Couldn't download libSQL server ${SQLD_VERSION} for ${t} (HTTP ${body.status}/${sums.status}).`);
  const bytes = Buffer.from(await body.arrayBuffer());
  const expected = (await sums.text()).match(/[a-f0-9]{64}/i)?.[0]?.toLowerCase();
  if(!expected || createHash("sha256").update(bytes).digest("hex") !== expected) {
    throw new Error("The downloaded libSQL server failed its checksum.");
  }

  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `.download-${randomUUID()}`);
  try {
    await mkdir(tmp);
    await writeFile(join(tmp, archive), bytes);
    const tar = spawnSync("tar", ["-xJf", join(tmp, archive), "-C", tmp]);
    if(tar.status !== 0) throw new Error(`Couldn't unpack the libSQL server: ${tar.stderr.toString()}`);
    await rename(join(tmp, `libsql-server-${t}`, "sqld"), binary);
    await chmod(binary, 0o755);
    return binary;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/** A port nothing is listening on right now. */
export function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => (typeof address === "object" && address ? resolve(address.port) : reject(new Error("No port"))));
    });
  });
}

/** Resolves once the server answers `/health`, or rejects after `timeoutMs`. */
export async function waitForHealthy(url: string, timeoutMs = 15_000) {
  const until = Date.now() + timeoutMs;
  for(;;) {
    try {
      if((await fetch(`${url}/health`)).ok) return;
    } catch {}
    if(Date.now() > until) throw new Error(`libSQL server at ${url} didn't become healthy in ${timeoutMs / 1000}s.`);
    await new Promise(r => setTimeout(r, 100));
  }
}
