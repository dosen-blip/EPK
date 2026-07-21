const CACHE_CONTROL = "public, max-age=31536000, immutable";
const EXPOSED_HEADERS = [
  "Accept-Ranges",
  "Content-Length",
  "Content-Range",
  "Content-Type",
  "ETag",
  "Last-Modified",
].join(", ");

function applyDeliveryHeaders(headers: Headers): void {
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Expose-Headers", EXPOSED_HEADERS);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", CACHE_CONTROL);
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
}

function errorResponse(message: string, status: number, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "text/plain; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("Access-Control-Allow-Origin", "*");
  return new Response(message, { status, headers });
}

function objectKey(request: Request): string | null {
  const pathname = new URL(request.url).pathname;
  if (pathname === "/" || pathname.includes("\\")) {
    return null;
  }

  try {
    const key = decodeURIComponent(pathname.slice(1));
    return key && !key.split("/").includes("..") ? key : null;
  } catch {
    return null;
  }
}

function parseRequestedRange(value: string, size: number): { offset: number; length: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) {
    return null;
  }

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return null;
    }
    const length = Math.min(suffixLength, size);
    return { offset: size - length, length };
  }

  const offset = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(offset)
    || !Number.isSafeInteger(requestedEnd)
    || offset < 0
    || offset >= size
    || requestedEnd < offset
  ) {
    return null;
  }

  const end = Math.min(requestedEnd, size - 1);
  return { offset, length: end - offset + 1 };
}

function rangeHeaders(object: R2ObjectBody, headers: Headers, requestedRange: string | null): 200 | 206 | 416 {
  if (!requestedRange) {
    headers.set("Content-Length", String(object.size));
    return 200;
  }

  const parsed = parseRequestedRange(requestedRange, object.size);
  if (!parsed) {
    headers.set("Content-Length", "0");
    headers.set("Content-Range", `bytes */${object.size}`);
    return 416;
  }

  headers.set("Content-Length", String(parsed.length));
  headers.set("Content-Range", `bytes ${parsed.offset}-${parsed.offset + parsed.length - 1}/${object.size}`);
  return 206;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Headers": "Range, If-Match, If-None-Match, If-Modified-Since, If-Unmodified-Since",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return errorResponse("Method not allowed", 405, { Allow: "GET, HEAD, OPTIONS" });
    }

    const key = objectKey(request);
    if (!key) {
      return errorResponse("Object not found", 404);
    }

    try {
      if (request.method === "HEAD") {
        const object = await env.MEDIA.head(key);
        if (!object) {
          return errorResponse("Object not found", 404);
        }

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set("Content-Length", String(object.size));
        headers.set("ETag", object.httpEtag);
        headers.set("Last-Modified", object.uploaded.toUTCString());
        applyDeliveryHeaders(headers);
        return new Response(null, { status: 200, headers });
      }

      const cache = caches.default;
      const cached = await cache.match(request);
      if (cached) {
        return cached;
      }

      const requestedRange = request.headers.get("Range");
      const getOptions: R2GetOptions = { onlyIf: request.headers };
      if (requestedRange) {
        getOptions.range = request.headers;
      }

      const object = await env.MEDIA.get(key, getOptions);
      if (!object) {
        return errorResponse("Object not found", 404);
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("ETag", object.httpEtag);
      headers.set("Last-Modified", object.uploaded.toUTCString());
      applyDeliveryHeaders(headers);

      if (!("body" in object)) {
        return new Response(null, { status: 304, headers });
      }

      const status = rangeHeaders(object, headers, requestedRange);
      if (status === 416) {
        return new Response(null, { status, headers });
      }
      const response = new Response(object.body, { status, headers });

      if (status === 200) {
        ctx.waitUntil(cache.put(request, response.clone()));
      }

      return response;
    } catch (error) {
      console.error(JSON.stringify({
        message: "R2 media request failed",
        method: request.method,
        path: new URL(request.url).pathname,
        error: error instanceof Error ? error.message : String(error),
      }));
      return errorResponse("Media request failed", 500);
    }
  },
} satisfies ExportedHandler<Env>;
