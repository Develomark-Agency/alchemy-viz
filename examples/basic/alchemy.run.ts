import * as Cloudflare from "@alchemy.run/cloudflare";
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

export default Alchemy.Stack(
  "VizExample",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), FeatureFlagsProvider()),
    state: Alchemy.localState()
  },
  Effect.gen(function* () {
    const api = yield* Api;
    const flags = yield* FeatureFlags("Flags", {
      flags: { newCheckout: false, darkMode: true, betaSearch: false }
    });
    return { url: api.url, flagsFile: flags.file };
  })
);
