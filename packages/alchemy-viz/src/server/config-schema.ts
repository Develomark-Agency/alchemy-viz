/**
 * Validates `alchemy-viz.config.ts`, so a mistyped plugin fails at startup
 * with a message that names the field instead of breaking a page later.
 */
import { z } from "zod";

const moduleRef = z.union([z.string().min(1), z.instanceof(URL)], {
  error: "Expected a path, a package specifier or a URL"
});

const typePattern = z.union([z.string().min(1), z.instanceof(RegExp)]);

const fn = z.custom<(...args: any[]) => unknown>(v => typeof v === "function", { error: "Expected a function" });

const view = z.object({
  type: z.union([typePattern, z.array(typePattern).min(1)]),
  server: moduleRef.optional(),
  view: moduleRef,
  title: z.string().min(1).optional()
});

const page = z.object({
  route: z.string().regex(/^[a-z0-9][a-z0-9-/]*$/, "Use lowercase letters, digits, dashes and slashes"),
  title: z.string().min(1),
  server: moduleRef.optional(),
  view: moduleRef
});

const plugin = z.object({
  name: z.string().min(1),
  views: z.array(view).optional(),
  pages: z.array(page).optional(),
  link: fn.optional(),
  isLocal: fn.optional(),
  setup: fn.optional()
});

export const configSchema = z.object({
  stack: z.string().min(1).optional(),
  stage: z.string().min(1).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  plugins: z.array(plugin).optional()
});

export function validateConfig(value: unknown, file: string) {
  const result = configSchema.safeParse(value ?? {});
  if(!result.success) {
    throw new Error(`Invalid config in ${file}:\n${z.prettifyError(result.error)}`);
  }
  return value;
}
