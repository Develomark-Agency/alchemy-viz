import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FeatureFlags, FeatureFlagsProvider } from "./src/feature-flags.ts";

const Api = Effect.gen(function* () {
  const cache = yield* Cloudflare.KV.Namespace("Cache");
  const db = yield* Cloudflare.D1.Database("AppDB", { migrations: "./migrations" });
  const uploads = yield* Cloudflare.R2.Bucket("Uploads", { forceDestroy: true });

  return yield* Cloudflare.Worker("Api", {
    main: "./src/worker.ts",
    crons: ["*/5 * * * *"],
    env: {
      CACHE: cache,
      DB: db,
      UPLOADS: uploads,
      GREETING: "hello from alchemy-viz"
    }
  });
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
