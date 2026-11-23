import { z } from "zod";
import { defineServer, type HandlerContext, handler, requireResource } from "../../../server/define.ts";
import type { R2Bucket, R2Object } from "../bindings.ts";
import { localBinding } from "../runtime.ts";

function bucket(ctx: HandlerContext) {
  return localBinding<R2Bucket>(ctx, requireResource(ctx));
}

export interface ObjectInfo {
  key: string,
  size: number,
  etag: string,
  uploaded: string,
  contentType?: string,
  customMetadata?: Record<string, string>
}

function info(o: R2Object): ObjectInfo {
  return {
    key: o.key,
    size: o.size,
    etag: o.etag,
    uploaded: new Date(o.uploaded).toISOString(),
    contentType: o.httpMetadata?.contentType,
    customMetadata: o.customMetadata && Object.keys(o.customMetadata).length ? o.customMetadata : undefined
  };
}

const key = z.object({ key: z.string().min(1) });

export default defineServer({
  /** One level of the bucket: "folders" (common prefixes) and objects under `prefix`. */
  list: handler(z.object({ prefix: z.string().default(""), cursor: z.string().optional() }), async (input, ctx) => {
    const page = await (await bucket(ctx)).list({
      prefix: input.prefix || undefined,
      cursor: input.cursor,
      delimiter: "/",
      limit: 200,
      include: ["httpMetadata", "customMetadata"]
    });
    return {
      folders: page.delimitedPrefixes ?? [],
      objects: page.objects.map(info),
      cursor: page.truncated ? page.cursor : undefined
    };
  }),

  head: handler(key, async (input, ctx) => {
    const o = await (await bucket(ctx)).head(input.key);
    return o ? info(o) : null;
  }),

  /** The object's bytes, for previews (`<img src>`) and downloads. */
  object: handler(key.extend({ download: z.boolean().optional() }), async (input, ctx) => {
    const o = await (await bucket(ctx)).get(input.key);
    if(!o) return new Response("Not found", { status: 404 });
    const name = input.key.split("/").pop() || "object";
    return new Response(await o.arrayBuffer(), {
      headers: {
        "content-type": o.httpMetadata?.contentType ?? "application/octet-stream",
        "cache-control": "no-store",
        ...(input.download ? { "content-disposition": `attachment; filename="${name.replace(/"/g, "")}"` } : {})
      }
    });
  }),

  /** Upload from the browser; the body arrives base64-encoded in JSON. */
  put: handler(key.extend({ base64: z.string(), contentType: z.string().optional() }), async (input, ctx) => {
    const bytes = Uint8Array.from(Buffer.from(input.base64, "base64"));
    const o = await (await bucket(ctx)).put(input.key, bytes, {
      httpMetadata: { contentType: input.contentType || "application/octet-stream" }
    });
    return info(o);
  }),

  delete: handler(key, async (input, ctx) => {
    await (await bucket(ctx)).delete(input.key);
    return { key: input.key };
  })
});
