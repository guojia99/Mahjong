#!/usr/bin/env node
/**
 * 从 Chrome HAR（含 _webSocketMessages）提取雀魂登录信息。
 * 用法: node extract-har-login.js console.log
 *       node extract-har-login.js capture.har --write-config ../db_config.json
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function loadHarChunks(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const chunks = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (text[i] === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        try {
          chunks.push(JSON.parse(text.slice(start, i + 1)));
        } catch (e) {
          /* skip invalid chunk */
        }
        start = -1;
      }
    }
  }
  if (chunks.length === 0) {
    throw new Error(
      `${filePath} 未找到 HAR JSON（支持纯 .har 或含 curl 头的 console.log）`
    );
  }
  return chunks;
}

function loadHar(filePath) {
  const text = fs.readFileSync(filePath, "utf8").trim();
  try {
    return JSON.parse(text);
  } catch (e) {
    const chunks = loadHarChunks(filePath);
    return chunks[chunks.length - 1];
  }
}

function collectAllWsEntries(filePath) {
  const chunks = loadHarChunks(filePath);
  const entries = [];
  for (const har of chunks) {
    for (const entry of har?.log?.entries || []) {
      if ((entry?._webSocketMessages || []).length > 0) entries.push(entry);
    }
  }
  return entries;
}

function collectWsMessages(har) {
  const entries = har?.log?.entries || [];
  const out = [];
  for (const entry of entries) {
    const url = entry?.request?.url || "";
    const msgs = entry?._webSocketMessages || [];
    for (const msg of msgs) {
      out.push({
        url,
        type: msg.type,
        data: msg.data,
        headers: entry?.request?.headers || [],
      });
    }
  }
  return out;
}

function headerMap(headers) {
  const map = {};
  for (const h of headers || []) {
    if (h?.name) map[h.name.toLowerCase()] = h.value;
  }
  return map;
}

function decodeFrame(b64) {
  const script = path.join(__dirname, "decode-ws-frame.js");
  const res = spawnSync("node", [script, b64], {
    encoding: "utf8",
    cwd: __dirname,
  });
  return res.stdout || "";
}

function parseMethod(stdout) {
  const m = stdout.match(/^method: (.+)$/m);
  return m ? m[1].trim() : null;
}

function parseJsonBlock(stdout) {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(stdout.slice(start, end + 1));
  } catch (e) {
    return null;
  }
}

function main() {
  const args = process.argv.slice(2);
  const writeConfig = args.includes("--write-config");
  const fileArgs = args.filter((a) => !a.startsWith("--"));
  const harPath = fileArgs[0];
  const configPath =
    fileArgs[1] ||
    path.join(__dirname, "..", "db_config.json");

  if (!harPath) {
    console.error(
      "用法: node extract-har-login.js <capture.har> [--write-config] [db_config.json]"
    );
    process.exit(1);
  }

  const har = loadHar(harPath);
  const entries = collectAllWsEntries(harPath);
  const messages = [];
  for (const entry of entries) {
    const url = entry?.request?.url || "";
    for (const msg of entry._webSocketMessages || []) {
      messages.push({
        url,
        type: msg.type,
        data: msg.data,
        headers: entry?.request?.headers || [],
      });
    }
  }
  const sends = messages.filter((m) => m.type === "send" && m.data);

  const found = {
    prepareLogin: null,
    oauth2Login: null,
    login: null,
    userAgent: null,
    wssUrl: null,
  };

  for (const msg of sends) {
    const stdout = decodeFrame(msg.data);
    const method = parseMethod(stdout);
    const json = parseJsonBlock(stdout);
    if (!method || !json) continue;

    if (method === ".lq.Lobby.prepareLogin") {
      found.prepareLogin = { b64: msg.data, json };
    } else if (method === ".lq.Lobby.oauth2Login") {
      found.oauth2Login = { b64: msg.data, json };
    } else if (method === ".lq.Lobby.login") {
      found.login = { b64: msg.data, json };
    }

    if (!found.wssUrl && msg.url) found.wssUrl = msg.url;
    if (!found.userAgent) {
      const ua = headerMap(msg.headers)["user-agent"];
      if (ua) found.userAgent = ua;
    }
  }

  const config = {};
  if (found.login?.b64) {
    config.majsoul_login_request_b64 = found.login.b64;
    config.majsoul_access_token = "";
    if (found.login.json?.account) {
      config.majsoul_account = found.login.json.account;
    }
  } else if (found.oauth2Login?.json?.access_token) {
    config.majsoul_access_token = found.oauth2Login.json.access_token;
    config.majsoul_oauth2_type = found.oauth2Login.json.type ?? 1;
    config.majsoul_login_request_b64 = found.oauth2Login.b64;
  } else if (found.prepareLogin?.json?.access_token) {
    config.majsoul_access_token = found.prepareLogin.json.access_token;
    config.majsoul_oauth2_type = found.prepareLogin.json.type ?? 0;
    config.majsoul_login_request_b64 = found.prepareLogin.b64;
  }

  console.log(JSON.stringify({ found: summarize(found), config }, null, 2));

  if (!Object.keys(config).length) {
    console.error(
      "\n未找到 prepareLogin / oauth2Login / login 上行帧。\n" +
        "请在 Chrome Network 中选中含完整登录过程的 WebSocket，导出 HAR（需含 Messages）。"
    );
    process.exit(1);
  }

  if (writeConfig) {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
    Object.assign(raw, config);
    if (found.login?.b64) {
      raw.majsoul_access_token = "";
      raw.majsoul_login_request_b64 = found.login.b64;
    } else if (config.majsoul_access_token) {
      raw.majsoul_login_request_b64 = config.majsoul_login_request_b64 || "";
    }
    if (config.majsoul_oauth2_type != null) {
      raw.majsoul_oauth2_type = config.majsoul_oauth2_type;
    }
    fs.writeFileSync(configPath, JSON.stringify(raw, null, 4) + "\n");
    console.error(`\n已写入 ${configPath}`);
  } else {
    console.error("\n加上 --write-config 可自动写入 db_config.json");
  }
}

function summarize(found) {
  const s = {};
  if (found.prepareLogin) {
    s.prepareLogin = {
      access_token: mask(found.prepareLogin.json.access_token),
      type: found.prepareLogin.json.type,
    };
  }
  if (found.oauth2Login) {
    s.oauth2Login = {
      access_token: mask(found.oauth2Login.json.access_token),
      type: found.oauth2Login.json.type,
      client_version: found.oauth2Login.json.client_version,
      client_version_string: found.oauth2Login.json.client_version_string,
    };
  }
  if (found.login) {
    s.login = {
      account: found.login.json.account,
      has_password: Boolean(found.login.json.password),
      client_version: found.login.json.client_version,
      client_version_string: found.login.json.client_version_string,
    };
  }
  if (found.wssUrl) s.wssUrl = found.wssUrl;
  if (found.userAgent) s.userAgent = found.userAgent;
  return s;
}

function mask(v) {
  if (!v || typeof v !== "string") return v;
  if (v.length <= 12) return v.slice(0, 4) + "…";
  return v.slice(0, 8) + "…" + v.slice(-4);
}

main();
