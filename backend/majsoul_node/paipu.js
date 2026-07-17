const axios = require("axios");
const WebSocket = require("ws");
const protobuf = require("protobufjs");
const { randomUUID } = require("crypto");
const uuidv4 = () => randomUUID();
const hmacSHA256 = require("crypto-js/hmac-sha256");
const _isBuffer = require("lodash.isbuffer");
const _uniqBy = require("lodash.uniqby");

const MAJSOUL_BASE = "https://game.maj-soul.com/1/";
const MAJSOUL_WSS_DEFAULT = "wss://route-2.maj-soul.com/gateway";
const ROUTE_COUNT = 6;
const ROUTE_CACHE_MS = 60_000;

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

/** 国服网页 login 使用的 currency_platforms（与浏览器一致） */
const CN_CURRENCY_PLATFORMS = [1, 2, 5, 6, 8, 10, 11];

/** WebGL package → resource（网页 HTML 通常不含 WebGL_2022-*，按 package 查表） */
const WEBGL_PACKAGE_RESOURCE = {
  "4.0.38": "0.16.226",
  "4.0.44": "0.16.238",
  "4.0.45": "0.16.251",
};

const DEFAULT_WEBGL_RESOURCE = "0.16.251";
const DEFAULT_WEBGL_PACKAGE = "4.0.45";
const WEBGL_LOGIN_RETRY_MAX = 12;

let protobufRoot = null;
let protobufWrapper = null;
let webglVersions = null;
let ws = null;
let reqIndex = 1;
const inflightRequests = {};
const messageQueue = [];
let activeWssUrl = MAJSOUL_WSS_DEFAULT;
let routeCache = null;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function wssUrlForLine(line) {
  return `wss://route-${line}.maj-soul.com/gateway`;
}

function measureRouteLatency(line) {
  return new Promise((resolve) => {
    const url = wssUrlForLine(line);
    const start = Date.now();
    let settled = false;
    let socket;
    const finish = (latency) => {
      if (settled) return;
      settled = true;
      try {
        if (socket) socket.terminate();
      } catch (e) {}
      resolve({ line, url, latency });
    };
    socket = new WebSocket(url, { perMessageDeflate: false });
    socket.on("open", () => finish(Date.now() - start));
    socket.on("error", () => finish(Infinity));
    setTimeout(() => finish(Infinity), 5000);
  });
}

async function pickBestRouteWss() {
  const forced = (process.env.MAJSOUL_WSS_URL || "").trim();
  if (forced) {
    activeWssUrl = forced;
    return { url: forced, line: null, latency: null, forced: true };
  }
  if (process.env.MAJSOUL_SKIP_ROUTE_PROBE === "1") {
    activeWssUrl = MAJSOUL_WSS_DEFAULT;
    return { url: activeWssUrl, line: 2, latency: null, forced: true };
  }
  const now = Date.now();
  if (routeCache && routeCache.expiresAt > now) {
    activeWssUrl = routeCache.url;
    return routeCache;
  }
  const lines = Array.from({ length: ROUTE_COUNT }, (_, i) => i + 1);
  const results = await Promise.all(lines.map((line) => measureRouteLatency(line)));
  const valid = results.filter((r) => r.latency !== Infinity && r.latency < 5000);
  let best;
  if (valid.length === 0) {
    best = { line: 2, url: MAJSOUL_WSS_DEFAULT, latency: null };
  } else {
    best = valid.reduce((a, b) => (a.latency <= b.latency ? a : b));
  }
  routeCache = {
    line: best.line,
    url: best.url,
    latency: best.latency,
    expiresAt: now + ROUTE_CACHE_MS,
  };
  activeWssUrl = best.url;
  return routeCache;
}

async function initProtobuf() {
  if (protobufRoot) return;
  const http = axios.create({ baseURL: MAJSOUL_BASE, timeout: 20000 });
  const versionDoc = (await http.get("version.json")).data;
  const resDoc = (await http.get(`resversion${versionDoc.version}.json`)).data;
  const prefix = resDoc.res["res/proto/liqi.json"].prefix;
  const liqiUrl = prefix.startsWith("http")
    ? prefix + "/res/proto/liqi.json"
    : MAJSOUL_BASE + prefix + "/res/proto/liqi.json";
  const liqiJson = (await http.get(liqiUrl)).data;
  protobufRoot = protobuf.Root.fromJSON(liqiJson);
  protobufWrapper = protobufRoot.nested.lq.Wrapper;
  webglVersions = await resolveWebGLVersions(http);
}

function parseSemverParts(v) {
  return String(v || "")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
}

function semverDistance(a, b) {
  const pa = parseSemverParts(a);
  const pb = parseSemverParts(b);
  let dist = 0;
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    dist += Math.abs(d) * Math.pow(100, 2 - i);
  }
  return dist;
}

function makeWebGLVersions(resource, pkg) {
  return {
    resource,
    package: pkg,
    client_version_string: `WebGL_2022-${resource}`,
  };
}

/**
 * 国服 WebGL 客户端版本（非 version.json 的 web-0.11.x）。
 * 错误使用 web-* 会导致 code=151 / version_str 为空。
 */
function resourceForWebGLPackage(pkg) {
  if (WEBGL_PACKAGE_RESOURCE[pkg]) return WEBGL_PACKAGE_RESOURCE[pkg];
  const known = Object.entries(WEBGL_PACKAGE_RESOURCE)
    .map(([knownPkg, resource]) => ({
      pkg: knownPkg,
      resource,
      dist: semverDistance(pkg, knownPkg),
    }))
    .sort((a, b) => a.dist - b.dist || b.pkg.localeCompare(a.pkg));
  return known[0]?.resource || DEFAULT_WEBGL_RESOURCE;
}

function parseWebGLPackageFromHtml(html) {
  const pkgMatch =
    html.match(/WebGL-release-([\d.]+)/) ||
    html.match(/"productVersion":\s*"([\d.]+)"/);
  return pkgMatch ? pkgMatch[1] : null;
}

function parseWebGLResourceFromHtml(html) {
  const resMatch = html.match(/WebGL_2022-([\d.]+)/);
  return resMatch ? resMatch[1] : null;
}

function webglVersionCandidates(pkg, primaryResource) {
  const seen = new Set();
  const out = [];
  const push = (resource) => {
    if (!resource || seen.has(resource)) return;
    seen.add(resource);
    out.push(makeWebGLVersions(resource, pkg));
  };

  push(primaryResource);
  push(WEBGL_PACKAGE_RESOURCE[pkg]);
  push(resourceForWebGLPackage(pkg));

  Object.entries(WEBGL_PACKAGE_RESOURCE)
    .map(([knownPkg, resource]) => ({
      resource,
      dist: semverDistance(pkg, knownPkg),
    }))
    .sort((a, b) => a.dist - b.dist)
    .forEach((item) => push(item.resource));

  const m = /^0\.16\.(\d+)$/.exec(primaryResource || "");
  if (m) {
    const base = parseInt(m[1], 10);
    for (let d = 1; d <= 20; d++) {
      push(`0.16.${base + d}`);
      if (base - d > 0) push(`0.16.${base - d}`);
    }
  }

  return out.slice(0, WEBGL_LOGIN_RETRY_MAX);
}

function isVersionMismatch151(json) {
  const code = json?.error?.code;
  const jp = json?.error?.json_param || "";
  return code === 151 && jp.includes("version_str");
}

async function resolveWebGLVersions(http) {
  const envResource = (process.env.MAJSOUL_WEBGL_RESOURCE || "").trim();
  const envPackage = (process.env.MAJSOUL_WEBGL_PACKAGE || "").trim();
  if (envResource || envPackage) {
    const pkg = envPackage || DEFAULT_WEBGL_PACKAGE;
    const resource = envResource || resourceForWebGLPackage(pkg);
    return makeWebGLVersions(resource, pkg);
  }

  let pkg = DEFAULT_WEBGL_PACKAGE;
  let resource = DEFAULT_WEBGL_RESOURCE;
  try {
    const html = String((await http.get("")).data || "");
    const htmlPkg = parseWebGLPackageFromHtml(html);
    if (htmlPkg) pkg = htmlPkg;
    const htmlRes = parseWebGLResourceFromHtml(html);
    resource = htmlRes || resourceForWebGLPackage(pkg);
  } catch (e) {
    resource = resourceForWebGLPackage(pkg);
  }

  const vers = makeWebGLVersions(resource, pkg);
  if (process.env.MAJSOUL_DEBUG_VERSION === "1") {
    console.error(
      `[majsoul] WebGL versions: package=${vers.package} resource=${vers.resource}`
    );
  }
  return vers;
}

function lookupMethod(path) {
  const parts = path.split(".");
  const service = protobufRoot.lookupService(parts.slice(0, -1).join("."));
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

function createConnection(wssUrl) {
  const url = wssUrl || activeWssUrl;
  return new Promise((resolve, reject) => {
    messageQueue.length = 0;
    ws = new WebSocket(url, { perMessageDeflate: false });
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

function payloadToJson(payload) {
  if (!payload) return null;
  return typeof payload.toJSON === "function" ? payload.toJSON() : payload;
}

function extractAccessToken(loginRes) {
  const json = payloadToJson(loginRes);
  if (!json) return null;
  if (json.error) return null;
  return json.access_token || null;
}

function buildBrowserDeviceInfo() {
  const ua =
    (process.env.MAJSOUL_USER_AGENT || "").trim() || DEFAULT_USER_AGENT;
  const screenW =
    parseInt(process.env.MAJSOUL_SCREEN_WIDTH || "2560", 10) || 2560;
  const screenH =
    parseInt(process.env.MAJSOUL_SCREEN_HEIGHT || "1440", 10) || 1440;
  return {
    platform: "pc",
    hardware: "pc",
    os: "windows",
    is_browser: true,
    software: "Chrome",
    sale_platform: "web",
    user_agent: ua,
    screen_width: screenW,
    screen_height: screenH,
    screen_type: 2,
  };
}

/** 构建与国服网页 Chrome 一致的 .lq.Lobby.login 请求体 */
function buildLoginPayload(username, password) {
  const vers = webglVersions || {
    resource: DEFAULT_WEBGL_RESOURCE,
    package: DEFAULT_WEBGL_PACKAGE,
    client_version_string: `WebGL_2022-${DEFAULT_WEBGL_RESOURCE}`,
  };
  return {
    account: username,
    password: hmacSHA256(password, "lailai").toString(),
    type: 0,
    reconnect: false,
    device: buildBrowserDeviceInfo(),
    random_key: uuidv4(),
    client_version: {
      resource: vers.resource,
      package: vers.package,
    },
    gen_access_token: true,
    currency_platforms: CN_CURRENCY_PLATFORMS,
    client_version_string: vers.client_version_string,
    tag: (process.env.MAJSOUL_TAG || "cn").trim() || "cn",
  };
}

function formatLoginError(res, context) {
  const code = res?.error?.code;
  const msg = res?.error?.message || "";
  const jsonParam = res?.error?.json_param || "";
  if (code === 151) {
    return (
      "登录失败(code=151): 雀魂拒绝了登录。" +
      (jsonParam.includes("version_str")
        ? " 请确认 WebGL 版本（MAJSOUL_WEBGL_RESOURCE / MAJSOUL_WEBGL_PACKAGE）与网页一致。"
        : " 请确认 majsoul_account / majsoul_password 与网页一致。") +
      (msg ? ` 服务器: ${msg}` : "") +
      (context ? ` [${context}]` : "")
    );
  }
  if (code === 109) {
    return (
      "登录失败(code=109): oauth2 token 无效。请使用 GameMgr.Inst.yostar_accessToken，" +
      "不要用 ResLogin 响应里的 access_token。" +
      (context ? ` [${context}]` : "")
    );
  }
  if (code === 1002) {
    return (
      "登录失败(code=1002): 账号可能已在其他端在线。请关闭雀魂网页后重试。" +
      (context ? ` [${context}]` : "")
    );
  }
  return `登录失败: code=${code} message=${msg}${context ? ` [${context}]` : ""}`;
}

async function majsoulLogin(username, password) {
  const base = webglVersions || makeWebGLVersions(DEFAULT_WEBGL_RESOURCE, DEFAULT_WEBGL_PACKAGE);
  const candidates = webglVersionCandidates(base.package, base.resource);
  let lastErr = null;

  for (const vers of candidates) {
    webglVersions = vers;
    const res = await websocketRequest(
      ".lq.Lobby.login",
      buildLoginPayload(username, password)
    );
    const json = payloadToJson(res);
    const token = extractAccessToken(res);
    if (token) {
      if (process.env.MAJSOUL_DEBUG_VERSION === "1" && vers !== base) {
        console.error(
          `[majsoul] login ok after version retry: package=${vers.package} resource=${vers.resource}`
        );
      }
      return token;
    }
    if (json?.error) {
      lastErr = new Error(formatLoginError(json, "login"));
      if (!isVersionMismatch151(json)) throw lastErr;
    }
  }

  if (lastErr) throw lastErr;
  throw new Error("登录无 access_token 响应");
}

/** 从浏览器复制的 login 上行帧解析出版本信息（调试用） */
function parseCapturedLoginRequest(b64) {
  if (!protobufRoot) throw new Error("protobuf 未初始化");
  const buf = Buffer.from(b64.replace(/\s/g, ""), "base64");
  if (buf[0] !== 2) throw new Error("须为 type=2 请求帧");
  const wm = protobufWrapper.decode(buf.slice(3));
  const ReqLogin = protobufRoot.lookup(".lq.ReqLogin");
  const j = ReqLogin.decode(wm.data).toJSON();
  if (j.password) j.password = j.password.slice(0, 8) + "…";
  return j;
}

/** 从浏览器复制的 login 下行帧解析 access_token（ResLogin） */
function parseCapturedLoginResponse(b64) {
  if (!protobufRoot) throw new Error("protobuf 未初始化");
  const buf = Buffer.from(b64.replace(/\s/g, ""), "base64");
  if (buf[0] !== 3) throw new Error("须为 type=3 响应帧");
  try {
    const wm = protobufWrapper.decode(buf.slice(3));
    const ResLogin = protobufRoot.lookup(".lq.ResLogin");
    const j = ResLogin.decode(wm.data).toJSON();
    return {
      access_token: j.access_token || null,
      account_id: j.account_id,
      error: j.error || null,
    };
  } catch (e) {
    const m = buf
      .toString("utf8")
      .match(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
      );
    return {
      access_token: m ? m[0] : null,
      account_id: null,
      error: m
        ? null
        : {
            message:
              "帧可能不完整，请用 Chrome「Copy message → Copy as Base64」重新复制完整响应",
          },
      _decode_warning: e.message,
    };
  }
}

function readVarint(buf, pos) {
  let val = 0;
  let shift = 0;
  let b;
  do {
    b = buf[pos++];
    val |= (b & 127) << shift;
    shift += 7;
  } while (b & 128);
  return { val, pos };
}

function writeVarint(n) {
  const a = [];
  while (n > 127) {
    a.push((n & 127) | 128);
    n >>= 7;
  }
  a.push(n);
  return Buffer.from(a);
}

/** 在保留 device 等字段的前提下 patch ReqLogin 二进制 */
function patchReqLoginWire(buf, patches) {
  const parts = [];
  let pos = 0;
  while (pos < buf.length) {
    const tagStart = pos;
    const t = readVarint(buf, pos);
    pos = t.pos;
    const field = t.val >>> 3;
    const wire = t.val & 7;
    if (wire === 0) {
      const v = readVarint(buf, pos);
      pos = v.pos;
      parts.push(buf.slice(tagStart, pos));
    } else if (wire === 2) {
      const l = readVarint(buf, pos);
      pos = l.pos;
      let val = buf.slice(pos, pos + l.val);
      pos += l.val;
      if (field === 1 && patches.account) {
        val = Buffer.from(patches.account, "utf8");
      } else if (field === 2 && patches.password) {
        val = Buffer.from(patches.password, "utf8");
      } else if (field === 5 && patches.random_key) {
        val = Buffer.from(patches.random_key, "utf8");
      }
      const tag = writeVarint(t.val);
      parts.push(Buffer.concat([tag, writeVarint(val.length), val]));
    } else {
      parts.push(buf.slice(tagStart));
      break;
    }
  }
  return Buffer.concat(parts);
}

async function majsoulLoginFromCapturedFrame(b64, username, password) {
  const raw = b64.replace(/\s/g, "");
  const buf = Buffer.from(raw, "base64");
  if (buf.length < 3 || buf[0] !== 2) {
    throw new Error("majsoul_login_request_b64 须为 WebSocket 上行 login 帧 base64");
  }
  const wm = protobufWrapper.decode(buf.slice(3));
  const patches = { random_key: uuidv4() };
  if (username && password) {
    patches.account = username;
    patches.password = hmacSHA256(password, "lailai").toString();
  }
  const data = patchReqLoginWire(wm.data, patches);
  const methodObj = lookupMethod(".lq.Lobby.login");
  const responseType = methodObj.parent.parent.lookupType(methodObj.responseType);
  const idx = reqIndex++;
  const frame = Buffer.concat([
    Buffer.from([2, idx & 0xff, idx >> 8]),
    protobufWrapper
      .encode({ name: ".lq.Lobby.login", data })
      .finish(),
  ]);
  inflightRequests[idx] = {
    methodName: ".lq.Lobby.login",
    typeObj: responseType,
  };
  ws.send(frame);
  const res = await getMessage(idx);
  if (!res) {
    throw new Error("登录响应超时；请重新在浏览器登录并复制新的 login 上行帧");
  }
  const token = extractAccessToken(res.payload);
  const json = payloadToJson(res.payload);
  if (token) return token;
  if (json?.error) throw new Error(formatLoginError(json, "captured login"));
  throw new Error("登录响应无 access_token");
}

async function majsoulLoginOAuth2(accessToken, oauth2Type) {
  const types = [];
  const seen = new Set();
  for (const t of [oauth2Type, 1, 10]) {
    if (t == null || seen.has(t)) continue;
    if (t === 0 && oauth2Type !== 0) continue;
    seen.add(t);
    types.push(t);
  }

  const base = webglVersions || makeWebGLVersions(DEFAULT_WEBGL_RESOURCE, DEFAULT_WEBGL_PACKAGE);
  const candidates = webglVersionCandidates(base.package, base.resource);
  let lastErr = null;

  for (const vers of candidates) {
    webglVersions = vers;
    for (const type of types) {
      const res = await websocketRequest(".lq.Lobby.oauth2Login", {
        type,
        access_token: accessToken,
        reconnect: false,
        device: buildBrowserDeviceInfo(),
        random_key: uuidv4(),
        client_version: {
          resource: vers.resource,
          package: vers.package,
        },
        gen_access_token: true,
        currency_platforms: CN_CURRENCY_PLATFORMS,
        client_version_string: vers.client_version_string,
        tag: (process.env.MAJSOUL_TAG || "cn").trim() || "cn",
      });
      const token = extractAccessToken(res);
      if (token) {
        if (process.env.MAJSOUL_DEBUG_VERSION === "1" && vers !== base) {
          console.error(
            `[majsoul] oauth2 ok after version retry: package=${vers.package} resource=${vers.resource}`
          );
        }
        return token;
      }
      const json = payloadToJson(res);
      if (json?.error) {
        lastErr = new Error(formatLoginError(json, `oauth2 type=${type}`));
        if (json.error.code === 109 || json.error.code === 1002) continue;
        if (isVersionMismatch151(json)) break;
        throw lastErr;
      }
    }
  }

  if (lastErr) throw lastErr;
  throw new Error("OAuth2 登录失败");
}

async function majsoulAuthenticate({
  username,
  password,
  accessToken,
  oauth2Type,
  loginRequestB64,
}) {
  if (loginRequestB64) {
    return majsoulLoginFromCapturedFrame(
      loginRequestB64,
      username,
      password
    );
  }
  if (accessToken) {
    try {
      return await majsoulLoginOAuth2(accessToken, oauth2Type);
    } catch (err) {
      if (username && password) return majsoulLogin(username, password);
      throw err;
    }
  }
  return majsoulLogin(username, password);
}

function unescapeShellUrl(s) {
  return s.replace(/\\([?=&])/g, "$1");
}

function formatUuid(str) {
  if (!str || typeof str !== "string") return null;
  str = unescapeShellUrl(str.trim());
  try {
    if (str.includes("%")) str = decodeURIComponent(str);
  } catch (e) {
    /* ignore */
  }
  const uuidRe =
    /([a-zA-Z0-9]{6}-[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})/;
  const bare = str.match(uuidRe);
  if (bare && !str.includes("paipu") && !str.includes("http")) {
    return bare[1];
  }
  if (str.includes("paipu") || str.includes("http")) {
    if (!str.startsWith("http") && str.includes("http")) {
      str = str.substring(str.indexOf("http"));
    }
    const m = str.match(/paipu[=\\]*([a-zA-Z0-9\-_]+)/i);
    if (m) return m[1].split("_")[0];
  }
  if (bare) return bare[1];
  return null;
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
        let len = 0;
        let shift = 0;
        while (pos < buf.length) {
          const vb = buf[pos++];
          len |= (vb & 0x7f) << shift;
          shift += 7;
          if ((vb & 0x80) === 0) break;
        }
        if (fieldNum === 1) {
          name = Buffer.from(
            buf.buffer,
            buf.byteOffset + pos,
            len
          ).toString("utf8");
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
  let paipuList;
  let username;
  let password;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--detail") {
      mode = "detail";
    } else if (args[i] === "--parse-login") {
      const reqB64 = args[i + 1];
      const resB64 = args[i + 2];
      await initProtobuf();
      if (reqB64) {
        console.log("=== Login 请求 ===");
        console.log(JSON.stringify(parseCapturedLoginRequest(reqB64), null, 2));
      }
      if (resB64) {
        console.log("=== Login 响应 (ResLogin) ===");
        console.log(JSON.stringify(parseCapturedLoginResponse(resB64), null, 2));
      }
      return;
    } else if (!paipuList) {
      paipuList = JSON.parse(args[i]);
    } else if (!username) {
      username = args[i];
    } else if (!password) {
      password = args[i];
    }
  }

  const accessToken = (process.env.MAJSOUL_ACCESS_TOKEN || "").trim();
  const loginRequestB64 = (
    process.env.MAJSOUL_LOGIN_REQUEST_B64 || ""
  ).trim();
  const oauth2Type = parseInt(process.env.MAJSOUL_OAUTH2_TYPE || "1", 10) || 1;

  if (!paipuList) {
    console.error(
      "用法: node paipu.js [--detail] '<paipuList_json>' [username] [password]\n" +
        "  环境变量: MAJSOUL_ACCESS_TOKEN / MAJSOUL_LOGIN_REQUEST_B64\n" +
        "  解析抓包: node paipu.js --parse-login '<login_req_b64>' '<login_res_b64>'"
    );
    process.exit(1);
  }
  if (!loginRequestB64 && !accessToken && (!username || !password)) {
    console.error("缺少登录凭据");
    process.exit(1);
  }

  const uuidList = paipuList.map(formatUuid).filter(Boolean);
  if (uuidList.length === 0) {
    console.error("未解析出有效 uuid");
    process.exit(1);
  }

  await initProtobuf();
  await pickBestRouteWss();
  await createConnection();
  try {
    const sessionToken = await majsoulAuthenticate({
      username,
      password,
      accessToken,
      oauth2Type,
      loginRequestB64,
    });

    if (mode === "summary") {
      const res = await websocketRequest(".lq.Lobby.fetchGameRecordsDetail", {
        uuid_list: uuidList,
      });
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
      const vers = webglVersions;
      const results = [];
      for (const gameUuid of uuidList) {
        const rec = await websocketRequest(".lq.Lobby.fetchGameRecord", {
          game_uuid: gameUuid,
          client_version_string: vers.client_version_string,
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
