import { defineServer, requireResource } from "alchemy-viz/server";
import type { FeatureFlagsAttributes, FeatureFlagsProps } from "../../src/feature-flags.ts";

type Flags = Record<string, boolean>;

async function read(file: string): Promise<Flags> {
  const f = Bun.file(file);
  return (await f.exists()) ? f.json() : {};
}

function write(file: string, flags: Flags) {
  return Bun.write(file, JSON.stringify(flags, null, 2));
}

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

  set: async (input: { name: string, enabled: boolean }, ctx) => {
    const { attr } = requireResource<FeatureFlagsAttributes>(ctx);
    const flags = await read(attr.file);
    flags[input.name] = input.enabled;
    await write(attr.file, flags);
    return flags;
  },

  remove: async (input: { name: string }, ctx) => {
    const { attr } = requireResource<FeatureFlagsAttributes>(ctx);
    const flags = await read(attr.file);
    delete flags[input.name];
    await write(attr.file, flags);
    return flags;
  }
});
