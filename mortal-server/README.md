# Mortal Server

Mortal 日本麻将 AI 推理服务，基于 HTTP API 长期运行。

仅包含推理能力，不包含训练相关代码。

## 目录

- [目录结构](#目录结构)
- [快速部署](#快速部署)
- [API 接口](#api-接口)
  - [GET /health](#get-health)
  - [GET /info](#get-info)
  - [POST /react](#post-react)
  - [POST /game](#post-game)
- [输出 meta 字段详解](#输出-meta-字段详解)
- [mjai 事件类型速查](#mjai-事件类型速查)
- [完整对局交互示例](#完整对局交互示例)
- [后台运行](#后台运行)

## 目录结构

```
mortal-server/
├── lib/
│   ├── darwin_arm64/
│   │   └── libriichi.so    # macOS Apple Silicon
│   └── linux_amd64/
│       └── libriichi.so    # Linux x86_64
├── serve.py                 # HTTP 推理服务入口
├── mortal.py                # 命令行推理入口
├── prelude.py               # Python 初始化
├── config.py                # 配置加载
├── model.py                 # 神经网络模型
├── engine.py                # 推理引擎
├── common.py                # 公共工具
├── config.toml              # 配置文件
├── requirements.txt         # Python 依赖
├── start.sh                 # 一键启动脚本
└── README.md
```

## 快速部署

### 1. 安装 Python 依赖

```bash
pip install -r requirements.txt
```

> 仅需 `torch`、`toml`、`numpy`，无 GPU 依赖。如只需 CPU 推理：
> ```bash
> pip install torch --index-url https://download.pytorch.org/whl/cpu toml numpy
> ```

### 2. 配置模型权重

编辑 `config.toml`，将 `state_file` 指向你的模型权重文件：

```toml
[control]
state_file = '/path/to/mortal.pth'
```

### 3. 启动服务

```bash
# 一键启动（默认 127.0.0.1:9996，player_id=0）
./start.sh

# 指定参数
MORTAL_PORT=9000 MORTAL_PLAYER_ID=2 ./start.sh

# 或直接用 python
MORTAL_CFG=config.toml python3 serve.py --host 127.0.0.1 --port 9996 --player-id 0
```

服务启动后会自动根据操作系统复制对应的 `libriichi.so`（`make venv` 同样会先选择正确平台的库）。

### 4. libriichi 原生库（可选：从源码编译）

仓库已附带 `lib/linux_amd64/` 与 `lib/darwin_arm64/` 预编译库。根目录的 `mortal-server/libriichi.so` 为运行时生成，**不应提交到 git**。

若预编译库与当前 Python 版本不兼容，可从 [Mortal/libriichi](https://github.com/Equim-chan/Mortal/tree/main/libriichi) 编译：

```bash
# 在项目根目录
ln -s /path/to/Mortal/libriichi libriichi   # 或 export LIBRIICHI_SRC=...
make build-libriichi                        # 需 Rust (rustup) + make venv
```

### 5. 验证

```bash
curl http://127.0.0.1:9996/health
curl http://127.0.0.1:9996/info
```

---

## API 接口

### `GET /health`

健康检查。

**请求**：无参数

**响应**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `status` | string | 固定值 `"ok"` |

**示例**：
```bash
curl http://127.0.0.1:9996/health
# {"status":"ok"}
```

---

### `GET /info`

返回当前模型信息和 AI 玩家 ID。

**请求**：无参数

**响应**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `player_id` | int | 当前 AI 扮演的玩家 ID（0-3） |
| `model_tag` | string | 模型标签，如 `"mortal4-b40c192-t26031702"` |

**示例**：
```bash
curl http://127.0.0.1:9996/info
# {"player_id": 0, "model_tag": "mortal4-b40c192-t26031702"}
```

---

### `POST /react`

发送 mjai 事件给 AI，获取 AI 的决策反应。这是核心推理接口。

**请求体**：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `game_id` | string | 否 | `"default"` | 游戏会话标识，用于隔离不同对局的内部状态。不同 `game_id` 的对局互不干扰 |
| `events` | string 或 string[] | 是 | — | mjai 事件的 JSON 字符串。可以传单个字符串，也可以传字符串数组（批量发送） |

**关于 `events` 的格式说明**：

`events` 数组中的每个元素是一个**完整的 mjai JSON 字符串**。这意味着你需要先将要发送的 mjai 事件 `JSON.stringify()` 成字符串，再放入数组。这是因为 mjai 协议本身基于 JSON 行流，HTTP 接口使用字符串数组来模拟这种流式传输。

在大多数编程语言中，你应该这样构造：

```python
import json

# 先构造 mjai 事件对象
event = {"type": "start_game", "names": ["A", "B", "C", "D"]}
# 将其序列化为 JSON 字符串
event_str = json.dumps(event)
# 放入 events 数组
body = {"game_id": "game-1", "events": [event_str]}
```

**响应体**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `reactions` | object[] | AI 的决策反应列表。**注意：并非每个输入事件都会产生反应**，只有 AI 需要做出决策时才会有条目 |
| `reactions[].type` | string | 反应类型，与 mjai 输出类型一致 |
| `reactions[].actor` | int | 执行动作的玩家 ID（与 AI 的 player_id 一致） |
| `reactions[].meta` | object | 推理元数据（详见[输出 meta 字段详解](#输出-meta-字段详解)） |

> **关键说明**：`reactions` 的长度可能**小于** `events` 的长度。只有以下情况 AI 会返回反应：
> - AI 自己摸牌后需要打牌
> - 其他玩家打牌后 AI 可以鸣牌（吃/碰/杠/荣和）
> - AI 需要决定是否立直
> - 等等...

---

### `POST /game`

游戏会话管理。

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `game_id` | string | 否 | 要操作的游戏会话 ID（默认 `"default"`） |
| `action` | string | 是 | 操作类型，目前仅支持 `"reset"` |

**`action: "reset"`**：清除指定 `game_id` 的内部 Bot 状态。在对局异常中断后使用，正常结束的对局（收到 `end_game` 事件）会自动清理。

**响应**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `status` | string | 固定值 `"reset"` |

**示例**：
```bash
curl -X POST http://127.0.0.1:9996/game \
  -H 'Content-Type: application/json' \
  -d '{"game_id": "table-1", "action": "reset"}'
# {"status": "reset"}
```

---

## 输出 meta 字段详解

每次 AI 做出决策时，响应中都会包含 `meta` 字段，提供推理的详细信息：

```json
{
  "type": "dahai",
  "actor": 0,
  "pai": "E",
  "tsumogiri": true,
  "meta": {
    "q_values": [-8.055, -7.866, ..., 1.359],
    "mask_bits": 137573179391,
    "is_greedy": true,
    "batch_size": 1,
    "shanten": 0,
    "eval_time_ns": 13455375,
    "at_furiten": false
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `q_values` | float[] | 各合法动作的 Q 值（DQN 输出）。**值越高表示 AI 越倾向于选择该动作**。数组长度等于当前可执行动作的数量（而非固定的 46），与合法动作掩码对应 |
| `mask_bits` | int (u64) | 合法动作掩码的位图。每一位对应一个动作（共 46 位），1 表示该动作合法 |
| `is_greedy` | bool | 是否为贪婪选择。`true` 表示 AI 选了 Q 值最高的动作（推理默认行为）；`false` 表示进行了随机探索 |
| `batch_size` | int | 当前推理的批大小，HTTP 模式下固定为 1 |
| `shanten` | int | 当前手牌的向听数。-1 表示已经听牌，0 表示一向听，1 表示二向听，以此类推 |
| `eval_time_ns` | int (u64) | 本次推理耗时（纳秒） |
| `at_furiten` | bool (可选) | 是否处于振听状态。振听时 AI 不能荣和（自摸不受影响） |

**动作空间（46 个动作）索引对照表**：

| 索引范围 | 动作 | 说明 |
|----------|------|------|
| 0-36 | 打牌/杠选择 | 0-33: 打出对应牌；34: 选择赤5m；35: 选择赤5p；36: 选择赤5s |
| 37 | 立直 | 宣布立直 |
| 38 | 低吃 | 吃（用较小的一张牌） |
| 39 | 中吃 | 吃（用中间的牌） |
| 40 | 高吃 | 吃（用较大的一张牌） |
| 41 | 碰 | 碰 |
| 42 | 杠决定 | 杠的牌选择（明杠/加杠时的子选择） |
| 43 | 荣和 | 和了（吃别人打的牌） |
| 44 | 流局 | 声明流局（九种九牌等） |
| 45 | Pass | 跳过（放弃鸣牌） |

---

## mjai 事件类型速查

以下为 `POST /react` 中 `events` 支持的全部 mjai 事件类型。

### 对局流程事件

#### `start_game` — 开始对局

**必须**作为每个游戏会话的第一个事件发送。

```json
{"type": "start_game", "names": ["A", "B", "C", "D"]}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | string | 是 | 固定 `"start_game"` |
| `names` | string[4] | 否 | 四位玩家名称 |
| `seed` | int[2] | 否 | 随机种子 `[nonce, key]`，仅用于可复现模拟，推理不需要 |

---

#### `end_game` — 对局结束

**必须**作为每个游戏会话的最后一个事件发送。

```json
{"type": "end_game"}
```

无额外参数。

---

### 局级事件

#### `start_kyoku` — 开始一局

每局开始时发送。

```json
{
  "type": "start_kyoku",
  "bakaze": "E",
  "dora_marker": "3s",
  "kyoku": 1,
  "honba": 0,
  "kyotaku": 0,
  "oya": 0,
  "scores": [25000, 25000, 25000, 25000],
  "tehais": [
    ["1m","2m","3m","4m","5m","6m","7m","8m","9m","1p","2p","3p","4p"],
    ["?","?","?","?","?","?","?","?","?","?","?","?","?"],
    ["?","?","?","?","?","?","?","?","?","?","?","?","?"],
    ["?","?","?","?","?","?","?","?","?","?","?","?","?"]
  ]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | string | 是 | 固定 `"start_kyoku"` |
| `bakaze` | string | 是 | 场风：`"E"` 东风 / `"S"` 南风 / `"W"` 西风 |
| `dora_marker` | string | 是 | 表ドラ表示牌，如 `"3s"` |
| `kyoku` | int | 是 | 局数：1-4（东风/南风/西风各 1-4 局） |
| `honba` | int | 是 | 本场数，0 表示无本场 |
| `kyotaku` | int | 是 | 供託（立直棒）数量 |
| `oya` | int | 是 | 亲家（庄家）的 player_id (0-3) |
| `scores` | int[4] | 是 | 四位玩家当前点数 |
| `tehais` | string[4][13] | 是 | 四位玩家的配牌（每人 13 张）。**AI 自己的手牌用真实牌面**，其他玩家用 `"?"` 表示未知 |

**`tehais` 填充规则**：
- 如果 AI 的 player_id = 0，则 `tehais[0]` 填真实牌面，`tehais[1]`、`tehais[2]`、`tehais[3]` 填 `"?"`
- 牌面格式：数牌 `1m`-`9m`、`1p`-`9p`、`1s`-`9s`；字牌 `E`(东)、`S`(南)、`W`(西)、`N`(北)、`P`(白)、`F`(发)、`C`(中)
- 赤宝牌：`5mr`(赤5万)、`5pr`(赤5筒)、`5sr`(赤5索)

---

#### `end_kyoku` — 一局结束

```json
{"type": "end_kyoku"}
```

无额外参数。

---

### 摸牌与打牌事件

#### `tsumo` — 摸牌

某位玩家从牌山摸牌。

```json
{"type": "tsumo", "actor": 0, "pai": "6p"}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | string | 是 | 固定 `"tsumo"` |
| `actor` | int | 是 | 摸牌的玩家 ID (0-3) |
| `pai` | string | 是 | 摸到的牌。**AI 自己的牌填真实牌面，其他玩家的牌填 `"?"`** |

> **触发 AI 反应**：当 `actor` 等于 AI 的 player_id 时，AI 会返回一个打牌决策（`dahai`）。

---

#### `dahai` — 打牌

某位玩家从手牌中打出一张牌。

```json
{"type": "dahai", "actor": 2, "pai": "1s", "tsumogiri": false}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | string | 是 | 固定 `"dahai"` |
| `actor` | int | 是 | 打牌的玩家 ID (0-3) |
| `pai` | string | 是 | 打出的牌面 |
| `tsumogiri` | bool | 是 | 是否为摸切（打出刚摸到的牌）。`true` = 摸切，`false` = 从手牌中选择打出 |

> **触发 AI 反应**：当 `actor` 不是 AI 的 player_id 时（其他人打牌），AI 可能会返回鸣牌决策（`chi` / `pon` / `daiminkan` / `hora` / `none`）。

---

### 鸣牌事件

#### `chi` — 吃

```json
{"type": "chi", "actor": 1, "target": 0, "pai": "6s", "consumed": ["5sr", "7s"]}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | string | 是 | 固定 `"chi"` |
| `actor` | int | 是 | 执行吃的玩家 ID |
| `target` | int | 是 | 被吃的玩家 ID（即打出牌的人） |
| `pai` | string | 是 | 吃的牌（即 `target` 打出的牌） |
| `consumed` | string[2] | 是 | `actor` 从手牌中使用的两张牌 |

---

#### `pon` — 碰

```json
{"type": "pon", "actor": 0, "target": 1, "pai": "W", "consumed": ["W", "W"]}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | string | 是 | 固定 `"pon"` |
| `actor` | int | 是 | 执行碰的玩家 ID |
| `target` | int | 是 | 被碰的玩家 ID |
| `pai` | string | 是 | 碰的牌 |
| `consumed` | string[2] | 是 | `actor` 手牌中使用的两张牌 |

---

#### `daiminkan` — 明杠

```json
{"type": "daiminkan", "actor": 2, "target": 0, "pai": "5p", "consumed": ["5pr", "5p", "5p"]}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | string | 是 | 固定 `"daiminkan"` |
| `actor` | int | 是 | 执行明杠的玩家 ID |
| `target` | int | 是 | 被杠的玩家 ID |
| `pai` | string | 是 | 杠的牌 |
| `consumed` | string[3] | 是 | `actor` 手牌中使用的三张牌 |

---

#### `kakan` — 加杠

在已碰的副露上添加第四张牌。

```json
{"type": "kakan", "actor": 3, "pai": "S", "consumed": ["S", "S", "S"]}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | string | 是 | 固定 `"kakan"` |
| `actor` | int | 是 | 执行加杠的玩家 ID |
| `pai` | string | 是 | 加杠的牌 |
| `consumed` | string[3] | 是 | 已碰的副露中包含的三张牌（含加杠的牌） |

---

#### `ankan` — 暗杠

从手牌中暗杠四张相同的牌。

```json
{"type": "ankan", "actor": 0, "consumed": ["9m", "9m", "9m", "9m"]}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | string | 是 | 固定 `"ankan"` |
| `actor` | int | 是 | 执行暗杠的玩家 ID |
| `consumed` | string[4] | 是 | 暗杠的四张牌 |

---

### 其他事件

#### `dora` — 翻开新ドラ

杠或岭上后翻开新的ドラ表示牌。

```json
{"type": "dora", "dora_marker": "3s"}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | string | 是 | 固定 `"dora"` |
| `dora_marker` | string | 是 | 新翻开的ドラ表示牌 |

---

#### `reach` — 宣布立直

```json
{"type": "reach", "actor": 3}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | string | 是 | 固定 `"reach"` |
| `actor` | int | 是 | 立直的玩家 ID |

---

#### `reach_accepted` — 立直成立

立直后的下一次摸牌。

```json
{"type": "reach_accepted", "actor": 3}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | string | 是 | 固定 `"reach_accepted"` |
| `actor` | int | 是 | 立直的玩家 ID |

---

#### `hora` — 和了

```json
{"type": "hora", "actor": 3, "target": 1, "deltas": [0, -8000, 0, 9000], "ura_markers": ["4p"]}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | string | 是 | 固定 `"hora"` |
| `actor` | int | 是 | 和了（胡牌）的玩家 ID |
| `target` | int | 是 | 放铳（点炮）的玩家 ID。自摸时 `target` 与 `actor` 相同 |
| `deltas` | int[4] | 否 | 四位玩家的点数变动 |
| `ura_markers` | string[] | 否 | 里ドラ表示牌列表（立直和了时翻开），普通和了为空 |

---

#### `ryukyoku` — 流局

```json
{"type": "ryukyoku", "deltas": [0, 1500, 0, -1500]}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | string | 是 | 固定 `"ryukyoku"` |
| `deltas` | int[4] | 否 | 四位玩家的点数变动。途中流局（九种九牌等）时通常没有此字段 |

---

### 可选参数

#### `can_act` — 抑制 AI 反应

可以在**任意事件**中附加 `"can_act": false`，强制 AI 仅更新内部状态而不返回任何决策反应：

```json
{"type": "tsumo", "actor": 0, "pai": "6p", "can_act": false}
```

适用于你想手动控制某些决策的时刻。

---

## 完整对局交互示例

以下 Python 示例展示一个完整的对局交互流程（模拟 AI 为 player_id=0 打出第一张牌）：

```python
import json
import urllib.request

URL = "http://127.0.0.1:9996/react"
GAME_ID = "demo-001"

def react(events):
    """发送事件数组，返回 AI 反应列表"""
    body = json.dumps({"game_id": GAME_ID, "events": events}).encode()
    req = urllib.request.Request(URL, data=body,
                                headers={"Content-Type": "application/json"})
    resp = json.loads(urllib.request.urlopen(req).read())
    return resp["reactions"]

# 1. 开始对局
react([json.dumps({"type": "start_game", "names": ["AI", "B", "C", "D"]})])
# reactions: []  （无反应）

# 2. 开始第一局（AI 为 player_id=0，即东家）
#    tehais[0] 是 AI 的真实手牌，其余填 "?"
react([json.dumps({
    "type": "start_kyoku",
    "bakaze": "E",
    "dora_marker": "3s",
    "kyoku": 1,
    "honba": 0,
    "kyotaku": 0,
    "oya": 0,
    "scores": [25000, 25000, 25000, 25000],
    "tehais": [
        ["1m","2m","3m","4m","5m","6m","7m","8m","9m","1p","2p","3p","4p"],
        ["?"]*13, ["?"]*13, ["?"]*13
    ]
})])
# reactions: []  （无反应）

# 3. AI 摸牌（actor=0 等于 AI 的 player_id，会触发反应）
reactions = react([json.dumps({"type": "tsumo", "actor": 0, "pai": "E"})])
# reactions: [{"type": "dahai", "actor": 0, "pai": "E", "tsumogiri": true, "meta": {...}}]
print(f"AI 打出: {reactions[0]['pai']}")

# 4. 其他玩家打牌（actor=1 不是 AI，AI 可能会鸣牌或 pass）
reactions = react([json.dumps({"type": "dahai", "actor": 1, "pai": "5s", "tsumogiri": false})])
# reactions: [{"type": "none", ...}]  （AI 选择不鸣牌）
# 或者: [{"type": "chi", ...}] / [{"type": "pon", ...}] 等等

# 5. 结束对局
react([json.dumps({"type": "end_game"})])

# 6. （可选）清理服务端状态
urllib.request.urlopen(urllib.request.Request(
    "http://127.0.0.1:9996/game",
    data=json.dumps({"game_id": GAME_ID, "action": "reset"}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST"
))
```

**批量发送示例**：可以将多个事件合并到一次请求中：

```python
events = [
    json.dumps({"type": "start_game", "names": ["AI", "B", "C", "D"]}),
    json.dumps({"type": "start_kyoku", "bakaze": "E", "dora_marker": "3s",
                "kyoku": 1, "honba": 0, "kyotaku": 0, "oya": 0,
                "scores": [25000]*4,
                "tehais": [["1m","2m","3m","4m","5m","6m","7m","8m","9m","1p","2p","3p","4p"],
                           ["?"]*13, ["?"]*13, ["?"]*13]}),
    json.dumps({"type": "tsumo", "actor": 0, "pai": "E"}),
]
reactions = react(events)
# reactions 中包含 AI 的打牌决策
```

---

## 后台运行

```bash
# nohup
nohup ./start.sh > server.log 2>&1 &

# systemd（Linux）
# 将 start.sh 配置为 systemd service

# 停止
kill $(pgrep -f "serve.py")
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MORTAL_CFG` | `config.toml` | 配置文件路径 |
| `MORTAL_HOST` | `127.0.0.1` | 绑定地址 |
| `MORTAL_PORT` | `9996` | 监听端口 |
| `MORTAL_PLAYER_ID` | `0` | AI 玩家 ID (0-3) |
