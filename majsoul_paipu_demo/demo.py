#!/usr/bin/env python3
"""
雀魂牌谱拉取 Demo：
  通过 Node 脚本 (paipu.js) 调用雀魂 WebSocket 协议获取牌谱详情，
  本层 Python 负责：读取 config.yaml -> 调用 Node -> 解析 JSON 输出。

使用前：
  1. cp config.example.yaml config.yaml  并填写 account / password
  2. cd node_demo && npm install
  3. python3 demo.py
"""

from __future__ import annotations

import json
import logging
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

import yaml

LOG = logging.getLogger("majsoul_paipu_demo")

_UUID_RE = re.compile(r"^\S{6}-\S{8}-\S{4}-\S{4}-\S{4}-\S{12}$")


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


def extract_paipu_uuid(token: str) -> str | None:
    if not token:
        return None
    if _UUID_RE.match(token):
        return token
    m = re.search(r"paipu=([a-zA-Z0-9\-_]+)", token)
    if m:
        return m.group(1).split("_")[0]
    return None


def fetch_paipu_via_node(
    paipu_list: list[str],
    account: str,
    password: str,
    *,
    detail: bool = False,
) -> list[dict[str, Any]]:
    node_script = _script_dir() / "node_demo" / "paipu.js"
    if not node_script.is_file():
        raise FileNotFoundError(f"Node 脚本不存在: {node_script}\n请先 cd node_demo && npm install")

    LOG.info("将请求牌谱 uuid: %s", [extract_paipu_uuid(p) for p in paipu_list])

    cmd = ["node", str(node_script)]
    if detail:
        cmd.append("--detail")
    cmd.extend([
        json.dumps(paipu_list, ensure_ascii=False),
        account,
        password,
    ])

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=120,
        cwd=str(_script_dir() / "node_demo"),
    )

    if result.returncode != 0:
        stderr = result.stderr.strip()
        LOG.error("Node 脚本执行失败 (exit=%d): %s", result.returncode, stderr)
        raise RuntimeError(f"Node 脚本执行失败: {stderr}")

    output = result.stdout.strip()
    if not output:
        raise RuntimeError("Node 脚本无输出")

    try:
        data = json.loads(output)
    except json.JSONDecodeError:
        LOG.error("Node 输出非 JSON: %s", output[:500])
        raise

    if isinstance(data, dict) and "error" in data:
        raise RuntimeError(f"牌谱获取失败: {data['error']}")

    return data if isinstance(data, list) else []


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
    )

    argv = sys.argv[1:]
    detail = "--detail" in argv
    if detail:
        argv.remove("--detail")
    cfg_path = Path(argv[0]) if argv else _script_dir() / "config.yaml"
    cfg = load_config(cfg_path)

    if _placeholder_account(cfg):
        print(
            "请先将 config.example.yaml 复制为 config.yaml，并填写有效的 account / password 后再运行。",
            file=sys.stderr,
        )
        raise SystemExit(2)

    raw_list = cfg.get("paipu_list") or []
    if isinstance(raw_list, str):
        raw_list = [raw_list]

    records = fetch_paipu_via_node(
        paipu_list=raw_list,
        account=str(cfg["account"]).strip(),
        password=str(cfg["password"]).strip(),
        detail=detail,
    )
    print(json.dumps(records, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
