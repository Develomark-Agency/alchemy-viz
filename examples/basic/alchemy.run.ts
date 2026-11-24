import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Turso from "@alchemy.run/turso";
import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import type { Counter } from "./src/worker.ts";
import { FeatureFlags, FeatureFlagsProvider } from "./src/feature-flags.ts";

// Opt in with EXAMPLE_CONTAINERS=1: local containers run in Docker.
const withContainers = !!process.env.EXAMPLE_CONTAINERS;
const Shell = Cloudflare.Container("Shell", { schedulingPolicy: "durable_object", image: "alpine:3.20" });

const Api = Effect.gen(function* () {
  const cache = yield* Cloudflare.KV.Namespace("Cache");
  const db = yield* Cloudflare.D1.Database("AppDB", { migrations: "./migrations" });
  const uploads = yield* Cloudflare.R2.Bucket("Uploads", { forceDestroy: true });
  const jobs = yield* Cloudflare.Queues.Queue("Jobs");
  const store = yield* Cloudflare.SecretsStore.Store("Secrets");
  const apiKey = yield* Cloudflare.SecretsStore.Secret("ApiKey", {
    store,
    value: Redacted.make("sk_test_local_only")
  });
  const vectorize = yield* Cloudflare.Vectorize.Index("Vectorize", {
    dimensions: 1536
  });

  // Opt in with EXAMPLE_HYPERDRIVE=1 after `bun run db:up` starts Postgres in Docker.
  // In alchemy dev the binding connects to the `dev` origin; `origin` is what a deploy would use.
  const pg = { scheme: "postgres", host: "localhost", port: 54329, database: "app", user: "app", password: Redacted.make("app") } as const;
  const hyperdrive = process.env.EXAMPLE_HYPERDRIVE
    ? yield* Cloudflare.Hyperdrive.Connection("Postgres", { origin: pg, dev: { ...pg, sslmode: "disable" } })
    : undefined;

  const worker = yield* Cloudflare.Worker("Api", {
    main: "./src/worker.ts",
    crons: ["*/5 * * * *"],
    env: {
      CACHE: cache,
      DB: db,
      UPLOADS: uploads,
      JOBS: jobs,
      API_KEY: apiKey,
      EMAIL: Cloudflare.Email.SendEmail("Email"),
      COUNTER: Cloudflare.DurableObject<Counter>("Counter"),
      ONBOARDING: Cloudflare.Workflow<{ email: string }>("Onboarding", { className: "Onboarding" }),
      ...(hyperdrive ? { HYPERDRIVE: hyperdrive } : {}),
      ...(withContainers ? { SANDBOX: Cloudflare.DurableObject("Sandbox", { containers: [Shell] }) } : {}),
      GREETING: "hello from alchemy-viz",
      VECTORIZE: vectorize
    }
  });

  yield* Cloudflare.Queues.Consumer("JobsConsumer", {
    queueId: jobs.queueId,
    scriptName: worker.workerName,
    settings: { batchSize: 5, maxRetries: 2 }
  });

  return worker;
});

export type ApiEnv = Cloudflare.InferEnv<typeof Api>;

/**
 * Opt in with EXAMPLE_TURSO=1 and a Turso Platform API token (TURSO_API_TOKEN,
 * or `alchemy profile edit --add Turso`). Turso has no local simulator, so
 * these are real cloud resources, even under `alchemy dev`. Members and
 * invites need a paid team organization, so they're left out.
 */
const TursoNotes = Effect.gen(function* () {
  const group = yield* Turso.Group("NotesGroup", { location: "aws-us-west-2" });
  const db = yield* Turso.Database("Notes", {
    group: group.name,
    migrations: "./turso/migrations",
    importFiles: ["./turso/seed.sql"]
  });
  yield* Turso.DatabaseToken("NotesReader", { database: db.name, authorization: "read-only", expiration: "7d" });
  yield* Turso.GroupToken("GroupReader", { group: group.name, authorization: "read-only", expiration: "1d" });
  yield* Turso.ApiToken("GroupAdmin", { group: group.name, scopes: ["read", "db:mint-token"] });
  // Already the org's value, so this manages the setting without changing it.
  yield* Turso.OrganizationSettings("Org", { overages: false });
  return db;
});

export default Alchemy.Stack(
  "VizExample",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), Turso.providers(), FeatureFlagsProvider()),
    state: Alchemy.localState()
  },
  Effect.gen(function* () {
    const api = yield* Api;
    const flags = yield* FeatureFlags("Flags", {
      flags: { newCheckout: false, darkMode: true, betaSearch: false }
    });
    const notes = process.env.EXAMPLE_TURSO ? yield* TursoNotes : undefined;
    return { url: api.url, flagsFile: flags.file, ...(notes ? { tursoUrl: notes.url } : {}) };
  })
);
