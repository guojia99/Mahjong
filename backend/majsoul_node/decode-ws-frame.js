#!/usr/bin/env node
/**
 * 解码雀魂 WebSocket 单帧（Chrome 复制的 base64）。
 * 用法: node decode-ws-frame.js '<base64>' [base642 ...]
 * 或:   node decode-ws-frame.js --login '<login响应的base64>'
 */
const axios = require("axios");
const protobuf = require("protobufjs");
const fs = require("fs");

const MAJSOUL_BASE = "https://game.maj-soul.com/1/";

async function loadProtobuf() {
  const http = axios.create({ baseURL: MAJSOUL_BASE });
  const versionDoc = (await http.get("version.json")).data;
  const resDoc = (await http.get(`resversion${versionDoc.version}.json`)).data;
  const prefix = resDoc.res["res/proto/liqi.json"].prefix;
  const liqiUrl = prefix.startsWith("http")
    ? prefix + "/res/proto/liqi.json"
    : MAJSOUL_BASE + prefix + "/res/proto/liqi.json";
  const liqiJson = (await http.get(liqiUrl)).data;
  const root = protobuf.Root.fromJSON(liqiJson);
  return { root, Wrapper: root.nested.lq.Wrapper };
}

function lookupMethod(root, methodName) {
  if (!methodName) return null;
  const parts = methodName.split(".");
  const service = root.lookupService(parts.slice(0, -1).join("."));
  if (!service) return null;
  return service.methods[parts[parts.length - 1]] || null;
}

function decodeByMethod(root, methodName, dataBuf, kind) {
  const methodObj = lookupMethod(root, methodName);
  if (!methodObj) return null;
  const typeName = kind === "request" ? methodObj.requestType : methodObj.responseType;
  const typeObj = root.lookup(typeName);
  if (!typeObj) return null;
  return typeObj.decode(dataBuf).toJSON();
}

function tryGuessResponse(root, dataBuf) {
  const candidates = [
    "ResLogin",
    "ResOauth2Login",
    "ResOauth2Auth",
    "ResCommon",
    "ResAccountInfo",
  ];
  for (const name of candidates) {
    try {
      const typeObj = root.lookup(`.lq.${name}`);
      const json = typeObj.decode(dataBuf).toJSON();
      if (json.access_token || json.accessToken) {
        return { typeName: name, json };
      }
      if (name === "ResLogin" && (json.account || json.account_id || json.uid)) {
        return { typeName: name, json };
      }
    } catch (e) {
      /* try next */
    }
  }
  return null;
}

function pickToken(json) {
  if (!json || typeof json !== "object") return null;
  // oauth2Login 要用浏览器 yostar token，不是 ResLogin 会话字段；此处仅作展示
  if (json.accessToken) return json.accessToken;
  if (json.access_token) return json.access_token;
  if (json.account && typeof json.account === "object") {
    if (json.account.accessToken) return json.account.accessToken;
    if (json.account.access_token) return json.account.access_token;
  }
  return null;
}

function warnIfResLoginSessionToken(token) {
  if (!token) return;
  console.log(
    "\n注意: 这是 ResLogin「登录成功响应」里的会话 access_token，用于已建立的 WebSocket 会话。\n" +
      "填进 majsoul_access_token 走 oauth2Login 通常会报 code=109。\n" +
      "请改用浏览器 GameMgr.Inst.yostar_accessToken，或 majsoul_account/password。"
  );
}

function readFrames(argv) {
  const frames = [];
  let forceLogin = false;
  for (const arg of argv) {
    if (arg === "--login") {
      forceLogin = true;
      continue;
    }
    if (arg.trim()) frames.push({ b64: arg.trim(), forceLogin });
  }
  return { frames, defaultForceLogin: forceLogin };
}

function decodeOneFrame({ root, Wrapper }, b64, index, inflight, forceLogin) {
  const buf = Buffer.from(b64.replace(/\s/g, ""), "base64");
  const frameType = buf[0];
  const reqIndex = buf[1] | (buf[2] << 8);
  console.log(`\n--- 帧 #${index + 1} (len=${buf.length}, type=${frameType}, idx=${reqIndex}) ---`);

  if (frameType !== 2 && frameType !== 3) {
    console.log("(非 Wrapper 业务帧，可能是路由/心跳)");
    return null;
  }

  const wrapperMsg = Wrapper.decode(buf.slice(3));
  const methodName = wrapperMsg.name || wrapperMsg.Name || "";

  if (frameType === 2) {
    console.log("(客户端请求 type=2)");
    if (methodName) {
      console.log("method:", methodName);
      inflight.set(reqIndex, methodName);
      try {
        const json = decodeByMethod(root, methodName, wrapperMsg.data, "request");
        if (json) {
          const safe = { ...json };
          if (safe.password) safe.password = String(safe.password).slice(0, 12) + "…(已隐藏)";
          console.log(JSON.stringify(safe, null, 2));
        }
      } catch (e) {
        console.log("request decode error:", e.message);
      }
    } else {
      console.log("(Wrapper 无 method 名)");
    }
    return null;
  }

  // type === 3 响应
  let resolvedMethod =
    methodName || inflight.get(reqIndex) || (forceLogin ? ".lq.Lobby.login" : "");

  if (resolvedMethod) {
    console.log("method:", resolvedMethod, methodName ? "" : `(由 idx=${reqIndex} 关联)`);
    try {
      const json = decodeByMethod(root, resolvedMethod, wrapperMsg.data, "response");
      if (json) {
        console.log(JSON.stringify(json, null, 2));
        const token = pickToken(json);
        if (token) {
          console.log("\n>>> ResLogin.access_token（会话用，勿用于 oauth2）:\n", token);
          warnIfResLoginSessionToken(token);
          return token;
        }
        return null;
      }
    } catch (e) {
      console.log("response decode by method failed:", e.message);
    }
  } else {
    console.log("(响应无 method 名，尝试按 ResLogin 等常见类型解析…)");
  }

  const guessed = tryGuessResponse(root, wrapperMsg.data);
  if (guessed) {
    console.log("推测类型:", guessed.typeName);
    console.log(JSON.stringify(guessed.json, null, 2));
    const token = pickToken(guessed.json);
    if (token) {
      console.log("\n>>> ResLogin.access_token（会话用，勿用于 oauth2）:\n", token);
      warnIfResLoginSessionToken(token);
      return token;
    }
  } else {
    console.log("(无法解析 payload；若仅粘贴了响应帧，请加 --login 或同时粘贴对应的 login 请求帧)");
  }
  return null;
}

async function main() {
  let argv = process.argv.slice(2);
  if (argv.length === 0) {
    argv = [fs.readFileSync(0, "utf8").trim()];
  }

  const { frames, defaultForceLogin } = readFrames(
    Array.isArray(argv) ? argv : [argv]
  );
  const parsed = frames.length
    ? frames
    : String(argv)
        .split(/\s+/)
        .filter(Boolean)
        .map((b64) => ({ b64, forceLogin: defaultForceLogin }));

  if (parsed.length === 0) {
    console.error("用法: node decode-ws-frame.js [--login] '<base64>' ...");
    process.exit(1);
  }

  const pb = await loadProtobuf();
  const inflight = new Map();
  let token = null;

  for (let i = 0; i < parsed.length; i++) {
    const t = decodeOneFrame(pb, parsed[i].b64, i, inflight, parsed[i].forceLogin);
    if (t) token = t;
  }

  if (token) {
    const looksLikeRandomKey =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
    console.log("\n--- 配置说明 ---");
    if (looksLikeRandomKey) {
      console.log(
        "警告: 该字符串像 random_key(UUID)，用于 oauth2Login 通常会报 code=109。\n" +
          "请改用浏览器控制台 GameMgr.Inst.yostar_accessToken（登录大厅后）。\n" +
          "ResLogin 里的 access_token 是会话令牌，不能填进 majsoul_access_token。"
      );
    } else {
      console.log(
        "将上方 access_token 写入 backend/db_config.json → majsoul_access_token\n" +
          "并设置 majsoul_oauth2_type: 1（失败可试 10）。重新登录后 token 会过期，需及时使用。"
      );
    }
  }
}

main().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
