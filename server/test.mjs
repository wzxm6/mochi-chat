import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { createChatServer } from "./server.js";

function makeClient(url) {
  const ws = new WebSocket(url);
  const queue = [];
  ws.on("message", (raw) => {
    try {
      queue.push(JSON.parse(raw.toString()));
    } catch (error) {
      /* ignore malformed frames in tests */
    }
  });
  return {
    ws,
    queue,
    open() {
      return new Promise((resolve, reject) => {
        ws.once("open", resolve);
        ws.once("error", reject);
      });
    },
    waitFor(predicate, timeout = 2500) {
      return new Promise((resolve, reject) => {
        const started = Date.now();
        const check = () => {
          const found = queue.find(predicate);
          if (found) return resolve(found);
          if (Date.now() - started > timeout) {
            return reject(new Error("timed out waiting for a message"));
          }
          setTimeout(check, 20);
        };
        check();
      });
    },
    close() {
      return new Promise((resolve) => {
        if (ws.readyState === WebSocket.CLOSED) return resolve();
        ws.once("close", resolve);
        ws.close();
      });
    }
  };
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mochi-test-"));
  const dataFile = path.join(dir, "messages.json");

  const first = createChatServer({ dataFile });
  const address = await first.listen(0, "127.0.0.1");
  const port = address.port;
  const base = "ws://127.0.0.1:" + port + "/";

  const alice = makeClient(base + "?room=test-room&name=alice&avatar=A&client=alice-1");
  await alice.open();
  const historyA = await alice.waitFor((message) => message.type === "history");
  assert.deepEqual(historyA.messages, []);

  const bob = makeClient(base + "?room=test-room&name=bob&avatar=B&client=bob-1");
  await bob.open();
  await bob.waitFor((message) => message.type === "history");

  const presence = await alice.waitFor((message) => message.type === "presence" && message.count === 2);
  assert.equal(presence.count, 2);

  alice.ws.send(JSON.stringify({
    type: "send",
    clientMsgId: "hello-1",
    text: "hello from alice"
  }));

  const receivedByBob = await bob.waitFor((message) =>
    message.type === "msg" && message.message.text === "hello from alice"
  );
  const receivedByAlice = await alice.waitFor((message) =>
    message.type === "msg" && message.message.clientMsgId === "hello-1"
  );

  assert.equal(receivedByBob.message.senderId, "alice-1");
  assert.equal(receivedByAlice.message.senderId, "alice-1");
  assert.equal(receivedByBob.message.name, "alice");

  alice.ws.send(JSON.stringify({ type: "typing", on: true }));
  const typing = await bob.waitFor((message) => message.type === "typing" && message.on === true);
  assert.equal(typing.senderId, "alice-1");

  // reactions
  alice.ws.send(JSON.stringify({ type: "react", messageId: receivedByBob.message.id, emoji: "♡" }));
  const reaction = await bob.waitFor((message) => message.type === "reaction");
  assert.equal(reaction.messageId, receivedByBob.message.id);
  assert.deepEqual(reaction.reactions["♡"], ["alice-1"]);

  // upload + attachment message
  const bytes = Buffer.from("fake image bytes");
  const upload = await fetch(`http://127.0.0.1:${port}/upload`, {
    method: "POST",
    headers: { "content-type": "image/png", "x-filename": "tiny.png" },
    body: bytes
  });
  assert.equal(upload.status, 200);
  const uploaded = await upload.json();
  assert.match(uploaded.url, /^\/files\//);
  assert.equal(uploaded.type, "image/png");

  const downloaded = await fetch(`http://127.0.0.1:${port}${uploaded.url}`);
  assert.equal(downloaded.status, 200);
  assert.equal(Buffer.from(await downloaded.arrayBuffer()).toString(), "fake image bytes");

  alice.ws.send(JSON.stringify({
    type: "send",
    clientMsgId: "photo-1",
    text: "",
    attachment: { url: uploaded.url, type: "image/png", name: "tiny.png", size: bytes.length }
  }));
  const photo = await bob.waitFor((message) =>
    message.type === "msg" && message.message.attachment && message.message.attachment.url === uploaded.url
  );
  assert.equal(photo.message.attachment.type, "image/png");
  assert.equal(photo.message.text, "");

  // health exposes the file count
  const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
  assert.equal(health.ok, true);
  assert.equal(health.files, 1);

  await alice.close();
  await bob.close();
  await first.close();

  const second = createChatServer({ dataFile });
  const secondAddress = await second.listen(0, "127.0.0.1");
  const carol = makeClient("ws://127.0.0.1:" + secondAddress.port + "/?room=test-room&name=carol&client=carol-1");
  await carol.open();
  const persisted = await carol.waitFor((message) => message.type === "history");
  assert.equal(persisted.messages.length, 2);
  assert.equal(persisted.messages[0].text, "hello from alice");
  assert.ok(persisted.messages[1].attachment);

  await carol.close();
  await second.close();

  fs.rmSync(dir, { recursive: true, force: true });
  console.log("mochi server tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
