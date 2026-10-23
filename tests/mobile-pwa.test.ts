import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";

type RequestLike = {
  url: string;
  method: string;
  mode: string;
  headers: Headers;
};
type WorkerEvent = {
  request?: RequestLike;
  waitUntil: (task: Promise<unknown>) => void;
  respondWith: (task: Promise<Response>) => void;
};
function setup() {
  const listeners = new Map<string, (event: WorkerEvent) => void>();
  const stores = new Map<string, Map<string, Response>>();
  const urlOf = (value: string | RequestLike) =>
    typeof value === "string"
      ? new URL(value, "https://example.test").href
      : value.url;
  let offline = false;
  const caches = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const data = stores.get(name)!;
      return {
        addAll: async (urls: string[]) => {
          for (const url of urls) data.set(urlOf(url), new Response(url));
        },
        match: async (value: string | RequestLike) =>
          data.get(urlOf(value))?.clone(),
        put: async (value: string | RequestLike, response: Response) => {
          data.set(urlOf(value), response);
        },
        keys: async () => [...data.keys()].map((url) => ({ url })),
        delete: async (value: string | RequestLike) =>
          data.delete(urlOf(value)),
      };
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };
  vm.runInNewContext(
    readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8"),
    {
      self: {
        location: { origin: "https://example.test" },
        addEventListener: (
          name: string,
          listener: (event: WorkerEvent) => void,
        ) => listeners.set(name, listener),
        skipWaiting: async () => undefined,
        clients: { claim: async () => undefined },
      },
      caches,
      URL,
      Response,
      fetch: async () => {
        if (offline) throw new Error("offline");
        return new Response("network");
      },
    },
  );
  async function lifecycle(name: string) {
    let task: Promise<unknown> | undefined;
    listeners.get(name)!({
      waitUntil: (p) => {
        task = p;
      },
      respondWith: () => undefined,
    });
    await task;
  }
  function request(path: string, patch: Partial<RequestLike> = {}) {
    let response: Promise<Response> | undefined;
    listeners.get("fetch")!({
      request: {
        url: new URL(path, "https://example.test").href,
        method: "GET",
        mode: "cors",
        headers: new Headers(),
        ...patch,
      },
      waitUntil: () => undefined,
      respondWith: (p) => {
        response = p;
      },
    });
    return response;
  }
  return {
    stores,
    lifecycle,
    request,
    setOffline: () => {
      offline = true;
    },
  };
}

test("PWA installs only public assets and cleans only its own old caches", async () => {
  const worker = setup();
  worker.stores.set("unrelated-user-cache", new Map());
  worker.stores.set("ziwei-guanxing-static-v0", new Map());
  await worker.lifecycle("install");
  await worker.lifecycle("activate");
  assert.ok(worker.stores.has("unrelated-user-cache"));
  assert.ok(!worker.stores.has("ziwei-guanxing-static-v0"));
  const active = worker.stores.get("ziwei-guanxing-static-v1")!;
  assert.equal(active.size, 5);
  assert.ok(active.has("https://example.test/offline.html"));
  assert.ok(!active.has("https://example.test/"));
});
test("PWA never intercepts API, authorization, query, external, or POST requests", () => {
  const worker = setup();
  for (const url of [
    "/api",
    "/api/chart",
    "/api/interpret",
    "/_next/static/private.js?birth=1990-01-01",
    "https://other.test/a.js",
  ])
    assert.equal(worker.request(url), undefined);
  assert.equal(
    worker.request("/icons/icon-192.png", { method: "POST" }),
    undefined,
  );
  assert.equal(
    worker.request("/icons/icon-192.png", {
      headers: new Headers({ authorization: "Bearer test" }),
    }),
    undefined,
  );
});
test("PWA offline navigation gives a fallback without storing private HTML", async () => {
  const worker = setup();
  await worker.lifecycle("install");
  worker.setOffline();
  const response = await worker.request("/?birth=1990-01-01", {
    mode: "navigate",
  });
  assert.equal(await response?.text(), "/offline.html");
  assert.equal(worker.stores.get("ziwei-guanxing-static-v1")?.size, 5);
});
test("PWA manifest and PNG dimensions meet install asset requirements", () => {
  for (const [file, size] of [
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["apple-touch-icon.png", 180],
  ] as const) {
    const png = readFileSync(resolve(process.cwd(), "public/icons", file));
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
  const manifest = readFileSync(
    resolve(process.cwd(), "app/manifest.ts"),
    "utf8",
  );
  assert.match(manifest, /standalone/);
  assert.match(manifest, /zh-CN/);
});
