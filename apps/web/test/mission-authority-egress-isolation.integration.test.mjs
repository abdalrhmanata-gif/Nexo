import assert from "node:assert/strict";
import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { spawnSync } from "node:child_process";
import test from "node:test";

const blockedCodes = new Set([
  "EACCES",
  "EPERM",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
]);

function errorCodes(error) {
  const codes = [];
  const seen = new Set();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current) && codes.length < 8) {
    seen.add(current);
    if (typeof current.code === "string") codes.push(current.code);
    current = current.cause;
  }
  return codes;
}

function assertBlocked(error, surface) {
  const codes = errorCodes(error);
  assert.ok(
    codes.some((code) => blockedCodes.has(code)),
    `${surface}: expected OS-level network denial; observed ${codes.join(",") || error?.name || "no error code"}`,
  );
}

function requestFailure(module, options) {
  return new Promise((resolve, reject) => {
    const request = module.request(options, (response) => {
      response.resume();
      reject(new Error(`Unexpected network response: HTTP ${response.statusCode}`));
    });
    request.setTimeout(2_000, () => request.destroy(Object.assign(new Error("network probe timeout"), { code: "ETIMEDOUT" })));
    request.once("error", resolve);
    request.end();
  });
}

function socketFailure(connect) {
  return new Promise((resolve, reject) => {
    const socket = connect();
    socket.setTimeout(2_000, () => socket.destroy(Object.assign(new Error("network probe timeout"), { code: "ETIMEDOUT" })));
    socket.once("connect", () => {
      socket.destroy();
      reject(new Error("Unexpected successful outbound socket connection"));
    });
    socket.once("error", resolve);
  });
}

test("OS-level egress isolation blocks direct network APIs and child-process networking", {
  skip: process.env.ZAVQERA_TEST_NETWORK_ISOLATED !== "1",
  timeout: 15_000,
}, async () => {
  await assert.rejects(
    fetch("https://example.com/", { signal: AbortSignal.timeout(2_000) }),
    (error) => { assertBlocked(error, "fetch/HTTPS"); return true; },
  );

  const httpError = await requestFailure(http, { hostname: "203.0.113.1", port: 80, path: "/", method: "GET" });
  assertBlocked(httpError, "Node HTTP");

  const httpsError = await requestFailure(https, { hostname: "203.0.113.1", port: 443, path: "/", method: "GET" });
  assertBlocked(httpsError, "Node HTTPS");

  const tcpError = await socketFailure(() => net.connect({ host: "203.0.113.1", port: 443 }));
  assertBlocked(tcpError, "TCP socket");

  const tlsError = await socketFailure(() => tls.connect({ host: "203.0.113.1", port: 443, servername: "example.com" }));
  assertBlocked(tlsError, "TLS socket");

  await assert.rejects(
    dns.resolve4("example.com"),
    (error) => { assertBlocked(error, "DNS resolver"); return true; },
  );

  const script = [
    "const net = require('node:net');",
    "const blocked = new Set(['EACCES','EPERM','ENETUNREACH','EHOSTUNREACH','ECONNREFUSED','ENOTFOUND','EAI_AGAIN','ETIMEDOUT']);",
    "const socket = net.connect({host:'203.0.113.1',port:443,timeout:2000});",
    "socket.once('connect',()=>{socket.destroy();process.exit(3)});",
    "socket.once('error',error=>process.exit(blocked.has(error.code)?0:2));",
    "socket.once('timeout',()=>socket.destroy(Object.assign(new Error('timeout'),{code:'ETIMEDOUT'})));",
  ].join("");
  const child = spawnSync(process.execPath, ["-e", script], {
    encoding: "utf8",
    timeout: 4_000,
    env: { PATH: process.env.PATH ?? "" },
  });
  assert.equal(child.error, undefined, `child process failed to run: ${child.error?.message ?? ""}`);
  assert.equal(child.status, 0, `child process network probe was not blocked (status=${child.status}, stderr=${child.stderr})`);
});
