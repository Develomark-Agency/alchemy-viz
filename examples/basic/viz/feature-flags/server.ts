import { defineServer, handler, requireResource } from "alchemy-viz/server";
import { z } from "zod";
import type { FeatureFlagsAttributes, FeatureFlagsProps } from "../../src/feature-flags.ts";

type Flags = Record<string, boolean>;

async function read(file: string): Promise<Flags> {
  const f = Bun.file(file);
  return (await f.exists()) ? f.json() : {};
}

function write(file: string, flags: Flags) {
  return Bun.write(file, JSON.stringify(flags, null, 2));
}

const flagName = z.string().trim().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, "Use letters, digits, - and _, starting with a letter");

export default defineServer({
  flags: async (_: undefined, ctx) => {
    const r = requireResource<FeatureFlagsAttributes, FeatureFlagsProps>(ctx);
    const current = await read(r.attr.file);
    return Object.entries(current).map(([name, enabled]) => ({
      name,
      enabled,
      // Flags declared in alchemy.run.ts vs. ones added from the dashboard.
      declared: name in r.props.flags,
      default: r.props.flags[name]
    }));
  },

  set: handler(z.object({ name: flagName, enabled: z.boolean() }), async (input, ctx) => {
    const { attr } = requireResource<FeatureFlagsAttributes>(ctx);
    const flags = await read(attr.file);
    flags[input.name] = input.enabled;
    await write(attr.file, flags);
    return flags;
  }),

  remove: handler(z.object({ name: flagName }), async (input, ctx) => {
    const { attr } = requireResource<FeatureFlagsAttributes>(ctx);
    const flags = await read(attr.file);
    delete flags[input.name];
    await write(attr.file, flags);
    return flags;
  })
});
