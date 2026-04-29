const axios = require("axios");
const WebSocket = require("ws");
const protobuf = require("protobufjs");
const { randomUUID } = require("crypto");
const uuidv4 = () => randomUUID();
const hmacSHA256 = require("crypto-js/hmac-sha256");
const _isBuffer = require("lodash.isbuffer");
const _uniqBy = require("lodash.uniqby");

const DEVICE_INFO = {
  platform: "pc",
  hardware: "pc",
  os: "windows",
  os_version: "win10",
  is_browser: true,
  software: "Chrome",
  sale_platform: "web",
};

const MAJSOUL_BASE = "https://game.maj-soul.com/1/";
const MAJSOUL_WSS = "wss://route-2.maj-soul.com/gateway";

let protobufRoot = null;
let protobufWrapper = null;
let clientVersionString = "";
let currentVersion = "";
let ws = null;
let reqIndex = 1;
const inflightRequests = {};
const messageQueue = [];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function initProtobuf() {
  if (protobufRoot) return;
  const http = axios.create({ baseURL: MAJSOUL_BASE });
  const versionDoc = (await http.get("version.json")).data;
  currentVersion = versionDoc.version;
  clientVersionString = "web-" + currentVersion.replace(/\.[a-z]+$/i, "");
  const resDoc = (await http.get(`resversion${currentVersion}.json`)).data;
  const prefix = resDoc.res["res/proto/liqi.json"].prefix;
  const liqiUrl = prefix.startsWith("http")
    ? prefix + "/res/proto/liqi.json"
    : MAJSOUL_BASE + prefix + "/res/proto/liqi.json";
  const liqiJson = (await http.get(liqiUrl)).data;
  protobufRoot = protobuf.Root.fromJSON(liqiJson);
  protobufWrapper = protobufRoot.nested.lq.Wrapper;
}

function lookupMethod(path) {
  const parts = path.split(".");
  const service = protobufRoot.lookupService(parts.slice(0, -1));
  if (!service) return null;
  return service.methods[parts[parts.length - 1]];
}

function encodeRequest({ methodName, payload }) {
  const currentIndex = reqIndex++;
  const methodObj = lookupMethod(methodName);
  const requestType = methodObj.parent.parent.lookupType(methodObj.requestType);
  const responseType = methodObj.parent.parent.lookupType(methodObj.responseType);
  const msg = protobufWrapper
    .encode({
      name: methodName,
      data: requestType.encode(payload).finish(),
    })
    .finish();
  inflightRequests[currentIndex] = { methodName, typeObj: responseType };
  return {
    reqIndex: currentIndex,
    buffer: Buffer.concat([
      Buffer.from([2, currentIndex & 0xff, currentIndex >> 8]),
      msg,
    ]),
  };
}

function decodeMessage(buf) {
  const type = buf[0];
  if (type === 3) {
    const idx = buf[1] | (buf[2] << 8);
    const msg = protobufWrapper.decode(buf.slice(3));
    const { typeObj, methodName } = inflightRequests[idx] || {};
    if (!typeObj) return null;
    delete inflightRequests[idx];
    return {
      type,
      reqIndex: idx,
      methodName,
      payload: typeObj.decode(msg.data),
    };
  }
  return null;
}

function createConnection() {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(MAJSOUL_WSS, { perMessageDeflate: false });
    ws.on("error", reject);
    ws.on("close", () => {});
    ws.on("open", () => resolve());
    ws.on("message", (data) => {
      if (data && _isBuffer(data)) {
        const decoded = decodeMessage(data);
        if (decoded) messageQueue.push(decoded);
      }
    });
  });
}

async function getMessage(requestedIndex) {
  let waited = 0;
  while (
    messageQueue.length === 0 ||
    !messageQueue.find((item) => item.reqIndex === requestedIndex)
  ) {
    await delay(200);
    waited += 200;
    if (waited > 15000) return null;
  }
  const index = messageQueue.findIndex(
    (item) => item.reqIndex === requestedIndex
  );
  return messageQueue.splice(index, 1)[0];
}

async function websocketRequest(methodName, payload) {
  const encoded = encodeRequest({ methodName, payload });
  ws.send(encoded.buffer);
  const res = await getMessage(encoded.reqIndex);
  return res ? res.payload : null;
}

async function majsoulLogin(username, password) {
  let retries = 0;
  while (retries < 5) {
    const res = await websocketRequest(".lq.Lobby.login", {
      account: username,
      password: hmacSHA256(password, "lailai").toString(),
      reconnect: true,
      device: DEVICE_INFO,
      random_key: uuidv4(),
      client_version: { resource: currentVersion },
      gen_access_token: true,
      type: 0,
      currency_platforms: [],
      client_version_string: clientVersionString,
      tag: "cn",
    });
    if (res && res.access_token) return res.access_token;
    if (res && res.error) {
      throw new Error(
        `登录失败: code=${res.error.code} message=${res.error.message || ""}`
      );
    }
    retries++;
    if (ws) ws.terminate();
    await createConnection();
  }
  throw new Error("登录重试次数超限");
}

function formatUuid(str) {
  if (/^\S{6}-\S{8}-\S{4}-\S{4}-\S{4}-\S{12}$/.test(str)) return str;
  if (str.includes("http")) {
    if (!str.startsWith("http")) str = str.substring(str.indexOf("http"));
    const m = str.match(/paipu=([a-zA-Z0-9\-_]+)/);
    if (m) str = m[1];
    else return null;
  }
  if (str) str = str.split("_")[0];
  return str || null;
}

function formatPaipuRecord(record) {
  return record.accounts
    .map((item) => {
      const pr = record.result.players.find((p) => p.seat === item.seat);
      return {
        accountId: item.account_id,
        nickName: item.nickname,
        finalPoint: pr.part_point_1,
        finalScore: pr.total_point / 1000,
      };
    })
    .sort((a, b) => a.accountId - b.accountId);
}

function decodeGameActions(dataBuf) {
  const GameDetailRecords = protobufRoot.lookupType("lq.GameDetailRecords");
  const decoded = GameDetailRecords.decode(dataBuf);
  const protoActions = decoded.actions;

  function decodeActionResult(buf) {
    let pos = 0;
    let name = "";
    let data = null;
    while (pos < buf.length) {
      const b = buf[pos];
      const fieldNum = b >>> 3;
      const wireType = b & 7;
      pos++;
      if (wireType === 2) {
        let len = 0, shift = 0;
        while (pos < buf.length) {
          const vb = buf[pos++];
          len |= (vb & 0x7f) << shift;
          shift += 7;
          if ((vb & 0x80) === 0) break;
        }
        if (fieldNum === 1) {
          name = Buffer.from(buf.buffer, buf.byteOffset + pos, len).toString("utf8");
        } else if (fieldNum === 2) {
          data = Buffer.from(buf.buffer, buf.byteOffset + pos, len);
        }
        pos += len;
      } else if (wireType === 0) {
        while (pos < buf.length && (buf[pos] & 0x80)) pos++;
        pos++;
      } else {
        break;
      }
    }
    if (data && data.length > 0 && name) {
      try {
        const T = protobufRoot.lookup(name);
        if (T) return { name, data: T.decode(new Uint8Array(data)).toJSON() };
      } catch (e) {}
    }
    return { name, data: null };
  }

  const actions = [];
  let step = 0;
  for (let i = 0; i < protoActions.length; i++) {
    const a = protoActions[i];
    if (a.type === 1 && a.result && a.result.length > 0) {
      const { name, data } = decodeActionResult(a.result);
      actions.push({ step: step++, name, data });
    }
  }
  return actions;
}

async function main() {
  const args = process.argv.slice(2);
  let mode = "summary";
  let paipuList, username, password;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--detail") {
      mode = "detail";
    } else if (!paipuList) {
      paipuList = JSON.parse(args[i]);
    } else if (!username) {
      username = args[i];
    } else if (!password) {
      password = args[i];
    }
  }

  if (!paipuList || !username || !password) {
    console.error(
      "用法: node paipu.js [--detail] '<paipuList_json>' <username> <password>"
    );
    process.exit(1);
  }

  const uuidList = paipuList.map(formatUuid).filter(Boolean);
  if (uuidList.length === 0) {
    console.error("未解析出有效 uuid");
    process.exit(1);
  }

  await initProtobuf();
  await createConnection();
  try {
    await majsoulLogin(username, password);

    if (mode === "summary") {
      const res = await websocketRequest(
        ".lq.Lobby.fetchGameRecordsDetail",
        { uuid_list: uuidList }
      );
      if (!res || !res.record_list) {
        console.log(JSON.stringify([]));
        return;
      }
      const recordList = _uniqBy(res.record_list, "uuid");
      const output = recordList.map((item) => ({
        uuid: item.uuid,
        start_time: item.start_time,
        end_time: item.end_time,
        players: formatPaipuRecord(item),
      }));
      console.log(JSON.stringify(output, null, 2));
    } else {
      const results = [];
      for (const gameUuid of uuidList) {
        const rec = await websocketRequest(".lq.Lobby.fetchGameRecord", {
          game_uuid: gameUuid,
          client_version_string: clientVersionString,
        });
        if (!rec || rec.error) {
          results.push({ uuid: gameUuid, error: "获取失败" });
          continue;
        }
        const head = rec.head;
        let actions = [];
        if (rec.data && rec.data.length > 0) {
          try {
            actions = decodeGameActions(Buffer.from(rec.data));
          } catch (e) {
            actions = [];
          }
        }
        results.push({
          uuid: gameUuid,
          start_time: head.start_time,
          end_time: head.end_time,
          players: (head.accounts || []).map((a) => ({
            accountId: a.account_id,
            nickName: a.nickname,
            seat: a.seat,
          })),
          result: head.result
            ? {
                players: (head.result.players || []).map((p) => ({
                  seat: p.seat,
                  total_point: p.total_point,
                  part_point_1: p.part_point_1,
                })),
              }
            : null,
          actions,
        });
      }
      console.log(JSON.stringify(results, null, 2));
    }
  } finally {
    if (ws) ws.terminate();
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }));
  if (ws) ws.terminate();
  process.exit(1);
});
