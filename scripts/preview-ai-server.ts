import { createServer } from "node:http";
import { Readable } from "node:stream";
import { handleInterpret } from "../lib/mobile/http";

const port = Number(process.env.PREVIEW_API_PORT || 3101);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid preview port");
if (!process.env.AI_ACCESS_TOKEN)
  throw new Error("请先在 .env.local 配置 AI 访问口令。");

// 仅供本人临时预览；独立端口不开放源码、环境文件或 Next.js 其它页面。
const server = createServer(async (incoming, outgoing) => {
  outgoing.setHeader("Cache-Control", "no-store");
  outgoing.setHeader("X-Content-Type-Options", "nosniff");
  if (incoming.url === "/health" && incoming.method === "GET") {
    outgoing.writeHead(200, { "Content-Type": "application/json" });
    outgoing.end(JSON.stringify({ ok: true, service: "ziwei-preview" }));
    return;
  }
  if (incoming.url !== "/api/interpret") {
    outgoing.writeHead(404);
    outgoing.end();
    return;
  }
  if (incoming.method !== "POST") {
    outgoing.writeHead(405, { Allow: "POST" });
    outgoing.end();
    return;
  }
  try {
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (value !== undefined)
        headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    }
    const request = new Request(
      `http://${headers.get("host") || `127.0.0.1:${port}`}/api/interpret`,
      {
        method: "POST",
        headers,
        body: Readable.toWeb(incoming) as ReadableStream<Uint8Array>,
        duplex: "half",
      } as RequestInit & { duplex: "half" },
    );
    const result = await handleInterpret(request);
    outgoing.writeHead(result.status, Object.fromEntries(result.headers));
    outgoing.end(Buffer.from(await result.arrayBuffer()));
  } catch {
    if (!outgoing.headersSent)
      outgoing.writeHead(500, { "Content-Type": "application/json" });
    outgoing.end(JSON.stringify({ error: "预览服务暂时不可用，请稍后重试。" }));
  }
});
server.requestTimeout = 60_000;
server.headersTimeout = 15_000;
server.listen(port, "127.0.0.1", () =>
  console.log(`AI preview API ready at http://127.0.0.1:${port}`),
);
process.on("SIGINT", () => server.close(() => process.exit(0)));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
