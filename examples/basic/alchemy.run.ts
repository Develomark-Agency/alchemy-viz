import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import type { Counter } from "./src/worker.ts";
import { FeatureFlags, FeatureFlagsProvider } from "./src/feature-flags.ts";

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

  const worker = yield* Cloudflare.Worker("Api", {
    main: "./src/worker.ts",
    crons: ["*/5 * * * *"],
    env: {
      CACHE: cache,
      DB: db,
      UPLOADS: uploads,
      JOBS: jobs,
      API_KEY: apiKey,
      COUNTER: Cloudflare.DurableObject<Counter>("Counter"),
      ONBOARDING: Cloudflare.Workflow<{ email: string }>("Onboarding", { className: "Onboarding" }),
      GREETING: "hello from alchemy-viz"
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
