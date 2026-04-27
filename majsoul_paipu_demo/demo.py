#!/usr/bin/env python3
"""
雀魂牌谱拉取 Demo（逻辑对齐 EvanMaFYH/majsoul-paipu 中 paipu.js + majsoul.js）：

- HTTP 拉取 version.json / config.json，选择网关 WebSocket
- protobuf Wrapper + .lq.Lobby.login（密码为 HMAC-SHA256(key=lailai)）
- .lq.Lobby.fetchGameRecordsDetail，uuid_list 批量取 RecordGame

依赖 Python 库 ms-api（MahjongRepository/mahjong_soul_api 生态），等价于用 Python 走同一套协议，
无需再嵌 Node 调 protobufjs。

使用前：cp config.example.yaml config.yaml 并填写 account / password。
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import random
import re
import sys
import uuid
from pathlib import Path
from typing import Any

import aiohttp
import yaml
from google.protobuf.json_format import MessageToDict

from ms.base import MSRPCChannel
from ms.rpc import Lobby
import ms.protocol_pb2 as pb

LOG = logging.getLogger("majsoul_paipu_demo")

_UUID_RE = re.compile(
    r"^\S{6}-\S{8}-\S{4}-\S{4}-\S{4}-\S{12}$"
)


def _script_dir() -> Path:
    return Path(__file__).resolve().parent


def load_config(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise FileNotFoundError(
            f"未找到配置文件: {path}\n请先复制: cp {_script_dir() / 'config.example.yaml'} {path}"
        )
    with path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _placeholder_account(cfg: dict[str, Any]) -> bool:
    acc = (cfg.get("account") or "").strip()
    pwd = (cfg.get("password") or "").strip()
    if not acc or not pwd:
        return True
    if "填写" in acc or "填写" in pwd or acc.startswith("CHANGE_ME"):
        return True
    return False


def normalize_paipu_url(raw: str) -> str:
    s = (raw or "").strip()
    if not s:
        return ""
    lower = s.lower()
    for needle in ("https://", "http://"):
        idx = lower.find(needle)
        if idx != -1:
            tail = s[idx:].strip()
            token = tail.split()[0] if tail.split() else tail
            return token.rstrip(".,;；，。）)")
    return s


def extract_paipu_uuid(token: str) -> str | None:
    if not token:
        return None
    if _UUID_RE.match(token):
        return token
    m = re.search(r"paipu=([a-zA-Z0-9\-_]+)", token)
    if m:
        return m.group(1).split("_")[0]
    return None


def format_paipu_record(record: pb.RecordGame) -> list[dict[str, Any]]:
    """与 paipu.js formatPaipuRecord 一致：按 account_id 排序的摘要行。"""
    rows: list[dict[str, Any]] = []
    for item in record.accounts:
        player_result = next(
            (p for p in record.result.players if p.seat == item.seat), None
        )
        if player_result is None:
            continue
        rows.append(
            {
                "accountId": item.account_id,
                "nickName": item.nickname,
                "finalPoint": player_result.part_point_1,
                "finalScore": player_result.total_point / 1000.0,
            }
        )
    rows.sort(key=lambda x: x["accountId"])
    return rows


def password_hmac_hex(plain: str) -> str:
    """与 crypto-js/hmac-sha256(password, 'lailai') 一致。"""
    return hmac.new(b"lailai", plain.encode("utf-8"), hashlib.sha256).hexdigest()


async def connect_ms(
    session: aiohttp.ClientSession, ms_host: str, region_url_index: int
) -> tuple[MSRPCChannel, Lobby, str, str]:
    """
    返回: channel, lobby, version_raw（含 .w）, client_version_string（web- 前缀后不含资源后缀）
    """
    async with session.get(f"{ms_host}/1/version.json") as res:
        version_doc = await res.json()
    version = version_doc["version"]
    ver_for_string = re.sub(r"\.[a-z]+$", "", version, flags=re.IGNORECASE)

    async with session.get(f"{ms_host}/1/v{version}/config.json") as res:
        config = await res.json()

    ip0 = config["ip"][0]
    region_urls = ip0.get("region_urls") or ip0["gateways"]
    if region_url_index < 0 or region_url_index >= len(region_urls):
        raise IndexError(f"region_url_index 越界: {region_url_index}, 共 {len(region_urls)} 个")
    url = region_urls[region_url_index]["url"]

    async with session.get(
        url + "?service=ws-gateway&protocol=ws&ssl=true"
    ) as res:
        servers = await res.json()
    server = random.choice(servers["servers"])
    endpoint = f"wss://{server}/gateway"
    LOG.info("WebSocket 网关: %s", endpoint)

    channel = MSRPCChannel(endpoint)
    lobby = Lobby(channel)
    await channel.connect(ms_host)
    return channel, lobby, version, f"web-{ver_for_string}"


async def login_lobby(
    lobby: Lobby,
    cfg: dict[str, Any],
    version_resource: str,
    client_version_string: str,
) -> None:
    req = pb.ReqLogin()
    req.account = str(cfg["account"]).strip()
    req.password = password_hmac_hex(str(cfg["password"]))
    req.reconnect = True
    req.gen_access_token = True
    req.type = 0
    req.client_version_string = client_version_string
    req.client_version.resource = version_resource
    req.random_key = str(uuid.uuid4())
    req.tag = str(cfg.get("tag") or "cn")

    dev = cfg.get("device") or {}
    req.device.platform = str(dev.get("platform", "pc"))
    req.device.hardware = str(dev.get("hardware", "pc"))
    req.device.os = str(dev.get("os", "windows"))
    req.device.os_version = str(dev.get("os_version", "win10"))
    req.device.is_browser = bool(dev.get("is_browser", True))
    req.device.software = str(dev.get("software", "Chrome"))
    req.device.sale_platform = str(dev.get("sale_platform", "web"))

    for x in cfg.get("currency_platforms") or []:
        req.currency_platforms.append(int(x))

    res = await lobby.login(req)
    if res.error.code:
        err = MessageToDict(res.error, preserving_proto_field_name=True)
        raise RuntimeError(f"登录失败: {json.dumps(err, ensure_ascii=False)}")
    if not res.access_token:
        raise RuntimeError("登录失败: 未返回 access_token")


async def fetch_records_detail(
    lobby: Lobby, uuid_list: list[str]
) -> pb.ResGameRecordsDetail:
    req = pb.ReqGameRecordsDetail()
    for u in uuid_list:
        req.uuid_list.append(u)
    return await lobby.fetch_game_records_detail(req)


def _uniq_records_by_uuid(
    records: list[pb.RecordGame],
) -> list[pb.RecordGame]:
    seen: set[str] = set()
    # 保持插入顺序去重（与 lodash.uniqBy 行为接近）
    out: list[pb.RecordGame] = []
    for r in records:
        if r.uuid in seen:
            continue
        seen.add(r.uuid)
        out.append(r)
    return out


async def async_main(config_path: Path) -> None:
    cfg = load_config(config_path)
    if _placeholder_account(cfg):
        print(
            "请先将 config.example.yaml 复制为 config.yaml，并填写有效的 account / password 后再运行。",
            file=sys.stderr,
        )
        raise SystemExit(2)

    ms_host = str(cfg.get("ms_host") or "https://game.maj-soul.com").rstrip("/")
    region_idx = int(cfg.get("region_url_index", 1))

    raw_list = cfg.get("paipu_list") or []
    if isinstance(raw_list, str):
        raw_list = [raw_list]
    uuid_list: list[str] = []
    for item in raw_list:
        url = normalize_paipu_url(str(item))
        u = extract_paipu_uuid(url) or extract_paipu_uuid(str(item))
        if u:
            uuid_list.append(u)
    if not uuid_list:
        raise SystemExit("paipu_list 中未能解析出任何牌谱 uuid")

    LOG.info("将请求牌谱 uuid: %s", uuid_list)

    timeout = aiohttp.ClientTimeout(total=60)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        channel, lobby, version_resource, client_ver_str = await connect_ms(
            session, ms_host, region_idx
        )
        try:
            await login_lobby(lobby, cfg, version_resource, client_ver_str)
            LOG.info("登录成功")
            res = await fetch_records_detail(lobby, uuid_list)
            if res.error.code:
                err = MessageToDict(res.error, preserving_proto_field_name=True)
                raise RuntimeError(f"fetchGameRecordsDetail 错误: {err}")
            records = list(res.record_list)
            records = _uniq_records_by_uuid(records)
            payload = []
            for rec in records:
                payload.append(
                    {
                        "uuid": rec.uuid,
                        "start_time": rec.start_time,
                        "players": format_paipu_record(rec),
                    }
                )
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        finally:
            await channel.close()


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
    )
    cfg_path = Path(sys.argv[1]) if len(sys.argv) > 1 else _script_dir() / "config.yaml"
    try:
        asyncio.run(async_main(cfg_path))
    except FileNotFoundError as e:
        print(str(e), file=sys.stderr)
        raise SystemExit(2) from e


if __name__ == "__main__":
    main()
