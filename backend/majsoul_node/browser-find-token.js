/**
 * 在雀魂国服网页已登录进大厅后，F12 → Console 粘贴整段运行。
 * 国服新版通常没有 GameMgr.Inst.access_token，本脚本会尝试多处取值。
 */
(function findMajsoulToken() {
  const hits = [];

  function tryPath(label, fn) {
    try {
      const v = fn();
      if (typeof v === "string" && v.length >= 32) {
        hits.push({ from: label, token: v });
      }
    } catch (e) {}
  }

  tryPath("GameMgr.Inst.yostar_accessToken", () => GameMgr.Inst.yostar_accessToken);
  tryPath("GameMgr.Inst.access_token", () => GameMgr.Inst.access_token);
  tryPath("GameMgr.Inst._pre_access_token", () => GameMgr.Inst._pre_access_token);
  tryPath("AccountInfoMgr.Inst.access_token", () => AccountInfoMgr.Inst.access_token);

  const seen = new WeakSet();
  function walk(obj, path, depth) {
    if (!obj || depth > 6 || typeof obj !== "object") return;
    if (seen.has(obj)) return;
    seen.add(obj);
    if (typeof obj.access_token === "string" && obj.access_token.length >= 32) {
      hits.push({ from: path + ".access_token", token: obj.access_token });
    }
    for (const k of Object.keys(obj).slice(0, 40)) {
      try {
        walk(obj[k], path + "." + k, depth + 1);
      } catch (e) {}
    }
  }

  for (const root of ["GameMgr", "AccountInfoMgr", "game", "app"]) {
    try {
      const o = globalThis[root];
      if (o) walk(o, root, 0);
    } catch (e) {}
  }

  const uniq = [];
  const set = new Set();
  for (const h of hits) {
    if (!set.has(h.token)) {
      set.add(h.token);
      uniq.push(h);
    }
  }

  if (uniq.length === 0) {
    console.warn(
      "未在内存中找到 token。请确认：\n" +
        "1) 已在 game.maj-soul.com 登录并进入大厅；\n" +
        "2) 控制台执行: GameMgr.Inst.yostar_accessToken 或 GameMgr.Inst.access_token；\n" +
        "3) 勿把 WS 登录响应里末尾的 UUID（random_key）当作 token — 那会触发 oauth2 109；\n" +
        "4) 或清空 majsoul_access_token，仅用 majsoul_account / majsoul_password。"
    );
    return null;
  }

  console.log(
    "找到 token（填入 db_config.json 的 majsoul_access_token，国服优先用 yostar_accessToken 那条）："
  );
  console.table(uniq.map((x) => ({ 来源: x.from, 长度: x.token.length })));
  uniq.forEach((x, i) => console.log(`[${i}]`, x.token));
  return uniq[0].token;
})();
