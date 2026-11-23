import { defineServer, type HandlerContext, requireResource } from "../../../server/define.ts";
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

export default defineServer({
  /** One level of the bucket: "folders" (common prefixes) and objects under `prefix`. */
  list: async (input: { prefix?: string, cursor?: string }, ctx) => {
    const b = await bucket(ctx);
    const page = await b.list({
      prefix: input.prefix || undefined,
      cursor: input.cursor || undefined,
      delimiter: "/",
      limit: 200,
      include: ["httpMetadata", "customMetadata"]
    });
    return {
      folders: page.delimitedPrefixes ?? [],
      objects: page.objects.map(info),
      cursor: page.truncated ? page.cursor : undefined
    };
  },

  head: async (input: { key: string }, ctx) => {
    const o = await (await bucket(ctx)).head(input.key);
    return o ? info(o) : null;
  },

  /** The object's bytes, for previews (`<img src>`) and downloads. */
  object: async (input: { key: string, download?: boolean }, ctx) => {
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
  },

  /** Upload from the browser; the body arrives base64-encoded in JSON. */
  put: async (input: { key: string, base64: string, contentType?: string }, ctx) => {
    if(!input.key) throw new Error("Key is required.");
    const bytes = Uint8Array.from(Buffer.from(input.base64, "base64"));
    const o = await (await bucket(ctx)).put(input.key, bytes, {
      httpMetadata: { contentType: input.contentType || "application/octet-stream" }
    });
    return info(o);
  },

  delete: async (input: { key: string }, ctx) => {
    await (await bucket(ctx)).delete(input.key);
    return { ok: true };
  }
});
