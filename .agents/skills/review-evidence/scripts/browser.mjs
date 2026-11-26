import { createRequire } from "node:module";
import { request, createServer } from "node:http";
import { connect } from "node:net";
import { once } from "node:events";
import { resolve } from "node:path";

export const LOOPBACK = ["localhost", "127.0.0.1", "[::1]"];

export function chromiumFromProject() {
  const require = createRequire(resolve("package.json"));
  for (const name of ["playwright", "@playwright/test"]) {
    try {
      return require(name).chromium;
    } catch (error) {
      if (error.code !== "MODULE_NOT_FOUND") throw error;
    }
  }
  throw new Error("Playwright is missing. From the target project, add playwright with its package manager, then run playwright install chromium.");
}

export function appUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || !LOOPBACK.includes(url.hostname) || url.username || url.password) {
    throw new Error("The app URL must use HTTP(S) on localhost, 127.0.0.1, or [::1], with no credentials in the URL.");
  }
  return url;
}

async function startFence(isAllowed) {
  const sockets = new Set();
  function track(socket) {
    sockets.add(socket);
    socket.on("error", () => socket.destroy());
    socket.once("close", () => sockets.delete(socket));
  }

  // The proxy also blocks Chromium's own background traffic.
  function destination(raw, protocols) {
    try {
      const url = new URL(raw);
      if (protocols.includes(url.protocol) && isAllowed(url)) return url;
    } catch {
      return undefined;
    }
  }

  const proxy = createServer((incoming, outgoing) => {
    const url = destination(incoming.url, ["http:"]);
    if (!url) return outgoing.writeHead(403).end();
    const headers = { ...incoming.headers, host: url.host };
    delete headers["proxy-connection"];
    delete headers["proxy-authorization"];
    const upstream = request(url, { method: incoming.method, headers, agent: false }, response => {
      outgoing.writeHead(response.statusCode, response.headers);
      response.pipe(outgoing);
    });
    outgoing.on("close", () => upstream.destroy());
    upstream.on("error", () => outgoing.destroy());
    incoming.pipe(upstream);
  });
  proxy.on("connection", track);
  proxy.on("connect", (incoming, socket, head) => {
    const url = destination(`https://${incoming.url}`, ["https:"]);
    if (!url) return socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    const upstream = connect(Number(url.port || 443), url.hostname.replace(/^\[|\]$/g, ""));
    track(upstream);
    upstream.once("error", () => socket.destroy());
    socket.once("close", () => upstream.destroy());
    upstream.once("connect", () => {
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
  });
  proxy.on("upgrade", (incoming, socket, head) => {
    const url = destination(incoming.url, ["http:", "ws:"]);
    if (!url) return socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    const upstream = connect(Number(url.port || 80), url.hostname.replace(/^\[|\]$/g, ""));
    track(upstream);
    upstream.once("error", () => socket.destroy());
    socket.once("close", () => upstream.destroy());
    upstream.once("connect", () => {
      const lines = [`${incoming.method} ${url.pathname}${url.search} HTTP/1.1`];
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (!name.startsWith("proxy-")) lines.push(`${name}: ${value}`);
      }
      upstream.write(lines.join("\r\n") + "\r\n\r\n");
      upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
  });
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  return {
    port: proxy.address().port,
    close() {
      proxy.close();
      for (const socket of sockets) socket.destroy();
    },
  };
}

export async function withBrowser(callback, allowedHosts) {
  const chromium = chromiumFromProject();
  if (!Array.isArray(allowedHosts) || allowedHosts.some(host => typeof host !== "string")) {
    throw new Error("allowedHosts must be an array of exact hostnames or host:port entries.");
  }
  const allowed = new Set(allowedHosts.map(host => host.toLowerCase()));
  const isAllowed = url => allowed.has(url.hostname) || allowed.has(url.host);
  let rejectFence;
  const violation = new Promise((_, reject) => { rejectFence = reject; });
  function rejectAppRequest(url) {
    rejectFence(new Error(`Browser network fence blocked ${url.protocol}//${url.host}`));
  }
  const fence = await startFence(isAllowed);
  let browser;
  let capture;
  try {
    // The older headless shell painted white frames when view transitions started.
    browser = await chromium.launch({
      channel: "chromium",
      args: [
        `--proxy-server=http://127.0.0.1:${fence.port}`,
        "--proxy-bypass-list=<-loopback>",
        "--disable-quic",
        "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
        "--no-pings",
      ],
    });
    const newContext = async options => {
      const context = await browser.newContext({ ...options, serviceWorkers: "block" });
      if (typeof context.routeWebSocket !== "function") throw new Error("Use Playwright 1.48 or newer for the WebSocket fence.");
      // Context events include redirect hops. The proxy blocks before forwarding.
      context.on("request", request => {
        const url = new URL(request.url());
        if (["http:", "https:"].includes(url.protocol) && !isAllowed(url)) rejectAppRequest(url);
      });
      await context.routeWebSocket(url => !isAllowed(url), socket => {
        rejectAppRequest(new URL(socket.url()));
        void socket.close().catch(() => {});
      });
      return context;
    };
    capture = callback(newContext);
    return await Promise.race([capture, violation]);
  } finally {
    try {
      await browser?.close();
      await capture?.catch(() => {});
    } finally {
      fence.close();
    }
  }
}
