/**
 * Local variants of `Turso.Database` and `Turso.DatabaseToken` for
 * `alchemy dev`: each database is a `sqld` process on this machine, with its
 * data under `.alchemy/turso-local/<fqn>`, so it survives restarts.
 *
 * Both return the official attribute shapes with local values: `url` and
 * `httpUrl` are `http://127.0.0.1:<port>`, `dbId` carries Alchemy's `dev:`
 * marker, and a token is empty because a local server checks none.
 */
import { migrationsAttrs, migrationsInputOf, runMigrations } from "@alchemy.run/sql/Migrations";
import { applySqlImports, hashImports, hashMigrations, splitSqlStatements } from "@alchemy.run/sql/SqlFile";
import * as Turso from "@alchemy.run/turso";
import * as Hrana from "@alchemy.run/turso/Hrana";
import * as LocalProvider from "alchemy/Local/LocalProvider";
import { createPhysicalName } from "alchemy/PhysicalName";
import * as Provider from "alchemy/Provider";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import type * as Path from "effect/Path";
import * as Redacted from "effect/Redacted";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { freePort, sqldBinary, waitForHealthy } from "./sqld.ts";

function rootDir() {
  return process.cwd();
}

function dataDirOf(fqn: string) {
  return resolve(rootDir(), ".alchemy", "turso-local", fqn.replace(/[^\w.-]/g, "_"));
}

/** Everything a restart depends on: change any of it and the server restarts and migrates again. */
interface Config {
  name: string,
  group: string,
  migrationsDir: string | undefined,
  migrationsTable: string | undefined,
  migrationHashes: Record<string, string>,
  importFiles: string[],
  importHashes: Record<string, string>
}

export function LocalDatabaseProvider() {
  return LocalProvider.make<Turso.Database, Config, never, FileSystem.FileSystem | Path.Path>(
    Turso.Database,
    import.meta.resolve("./sidecar.ts"),
    Effect.gen(function* () {
      // `resolveConfig` and `start` run per call, without the layer's services in scope: keep them.
      const services = yield* Effect.context<FileSystem.FileSystem | Path.Path>();
      return {
        resolveConfig: ({ id, news }) => Effect.gen(function* () {
          const migrations = migrationsInputOf(news);
          return {
            name: news.name ?? (yield* createPhysicalName({ id, lowercase: true, maxLength: 32, delimiter: "-" })),
            group: news.group,
            migrationsDir: migrations?.dir,
            migrationsTable: migrations?.table,
            migrationHashes: migrations ? yield* hashMigrations(resolve(rootDir(), migrations.dir)) : {},
            importFiles: [...news.importFiles ?? []],
            importHashes: news.importFiles?.length ? yield* hashImports(news.importFiles, rootDir()) : {}
          } satisfies Config;
        }).pipe(Effect.provideContext(services)),

        start: ({ fqn, config, invalidate }) => Effect.gen(function* () {
          const binary = yield* Effect.promise(sqldBinary);
          const port = yield* Effect.promise(freePort);
          const dataDir = dataDirOf(fqn);
          yield* Effect.promise(() => mkdir(dataDir, { recursive: true }));
          const url = `http://127.0.0.1:${port}`;

          // Owned by the instance scope: killed on restart, delete, or when the dev session ends.
          const child = yield* Effect.acquireRelease(
            Effect.sync(() => {
              const log = createWriteStream(join(dataDir, "sqld.log"), { flags: "a" });
              const proc = spawn(binary, ["--http-listen-addr", `127.0.0.1:${port}`, "--db-path", join(dataDir, "data.sqld")], { cwd: dataDir, stdio: ["ignore", "pipe", "pipe"] });
              proc.stdout.pipe(log);
              proc.stderr.pipe(log);
              return proc;
            }),
            proc => Effect.sync(() => proc.kill("SIGTERM"))
          );
            // A server that dies on its own is started again on the next reconcile.
          child.once("exit", () => Effect.runFork(invalidate));
          yield* Effect.promise(() => waitForHealthy(url));

          // A local server checks no token; Hrana still sends the header, empty.
          const connection: Hrana.HranaConnection = { url, authToken: Redacted.make("") };
          const client = yield* HttpClient.HttpClient;
          const migrationsInput = config.migrationsDir ? { dir: config.migrationsDir, table: config.migrationsTable } : undefined;
          const run = migrationsInput
            ? yield* runMigrations({
              input: migrationsInput,
              stamped: { table: config.migrationsTable },
              withExecutor: apply => apply(Hrana.makeMigrationExecutor(connection, client))
            })
            : undefined;
            // Seed files run on every start: the server's data persists, so they should be idempotent.
          const importHashes = yield* applySqlImports({
            importFiles: config.importFiles,
            rootDir: rootDir(),
            previous: undefined,
            apply: file => Hrana.transaction(connection, splitSqlStatements(file.sql)).pipe(Effect.provideService(HttpClient.HttpClient, client))
          });

          return {
            dbId: `dev:${fqn}`,
            name: config.name,
            organization: "local",
            group: config.group,
            hostname: `127.0.0.1:${port}`,
            url,
            httpUrl: url,
            primaryRegion: "local",
            regions: ["local"],
            sizeLimit: undefined,
            allowAttach: false,
            blockReads: false,
            blockWrites: false,
            deleteProtection: false,
            allowedIps: [],
            allowedAwsVpcIds: [],
            ...migrationsAttrs({ input: migrationsInput, run, output: undefined }),
            importHashes
          } satisfies Turso.DatabaseAttributes;
        }).pipe(Effect.provideContext(services), Effect.provide(FetchHttpClient.layer)),

        // Deleting the resource deletes its data, as deleting a cloud database would.
        stop: ({ fqn }) => Effect.promise(() => rm(dataDirOf(fqn), { recursive: true, force: true }))
      };
    })
  );
}

/**
 * A local database checks no token, so a local token is empty. It isn't a
 * process, so it runs in the dev process itself rather than the sidecar.
 */
export function LocalDatabaseTokenProvider() {
  return Provider.succeed(Turso.DatabaseToken, {
    list: () => Effect.succeed([]),
    reconcile: ({ news }) => Effect.succeed({
      token: Redacted.make(""),
      organization: "local",
      authorization: news.authorization ?? "full-access",
      expiresAt: undefined,
      database: news.database,
      dbId: `dev:${news.database}`
    } satisfies Turso.DatabaseTokenAttributes),
    delete: () => Effect.void
  });
}
