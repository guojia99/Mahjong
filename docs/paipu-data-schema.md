# 雀魂牌谱 JSON 字段说明（Node `--detail` / `paipu_raw.json`）

数据来自 `backend/majsoul_node/paipu.js` 使用 protobuf `toJSON()` 解码的 **`fetchGameRecord`** 结果，与 `majsoul_paipu_demo` 导出格式一致。可对照仓库内示例 `majsoul_paipu_demo/paipu_raw.json` 核对字段；协议定义见雀魂 liqi protobuf（字段名可能随版本变为 camelCase）。

## 顶层（单局对象）

| 字段 | 类型 | 说明 |
|------|------|------|
| `uuid` | string | 牌谱唯一 ID（与链接中 `paipu=` 一致） |
| `start_time` | number | Unix 秒，开局时间 |
| `end_time` | number | Unix 秒，结束时间 |
| `players` | array | 参与者列表，见下表 |
| `result` | object | 终局结算摘要，含 `players` 分数行 |
| `actions` | array | 按时间顺序的牌谱步进，见「动作」 |
| `error` | string | 仅拉取失败时出现（正常 detail 无此字段） |

### `players[]`（detail 形态）

| 字段 | 类型 | 说明 |
|------|------|------|
| `accountId` | number | 雀魂账号 ID |
| `nickName` | string | 昵称 |
| `seat` | number | 座位 0–3 |

### `result.players[]`

| 字段 | 类型 | 说明 |
|------|------|------|
| `seat` | number | 座位 |
| `total_point` | number | 千分比等场景下的点数（与 UI 展示相关） |
| `part_point_1` | number | 本局/本场得分相关，后端解析表分可与 `_normalize_node_players_from_detail` 一致使用 |

## `actions[]` 通用结构

| 字段 | 类型 | 说明 |
|------|------|------|
| `step` | number | 从 0 递增的序号 |
| `name` | string | 记录类型，形如 `.lq.RecordXXX` |
| `data` | object | 该步 protobuf 解码后的对象（原文，无业务层转换） |

## 常见 `name` 与 `data` 含义（摘自实际牌谱）

下列字段名以 `majsoul_paipu_demo/paipu_raw.json` 为准；缺省字段可能未出现在某一局中。

### `.lq.RecordNewRound`

起手与局况：`chang`、`ju`、`ben`、`scores[]`、`liqibang`、`tiles0`–`tiles3`（各家手牌字符串数组）、`doras`、`left_tile_count`、`operation`（可选操作与时限）、`paishan`（牌山编码串）、`opens`、`sha256` / `saltSha256` / `salt`（校验相关）等。

### `.lq.RecordDiscardTile`

出牌：`seat`、`tile`、`is_liqi`、`moqie`、`zhenting[]`（各席是否振听类标记）、`is_wliqi`；可能含 `tingpais`（听牌信息对象列表）、`doras`、`operations` 等。

### `.lq.RecordDealTile`

摸牌：`seat`、`tile`、`left_tile_count`、`zhenting`、可选 `operation`、`doras` 等。

### `.lq.RecordChiPengGang`

吃/碰/杠：`seat`、`type`、`tiles[]`（或单张字符串）、`froms[]`、`zhenting`、`operation` 等。`type`：`0` 吃、`1` 碰、`2` 杠——**此处杠含大明杠与加杠（追杠）**（常见四张牌 vs 单张/短序列），均属明面鸣杠；暗杠多在 `.lq.RecordAnGangAddGang`。

### `.lq.RecordHule`

和牌：`hules[]`（.element 含 `hand`、`ming`、`hu_tile`、`seat`、`zimo`、`doras`、`fans`、`fu`、`point_rong` / 自摸相关分数字段、`lines` 等）、`old_scores`、`delta_scores`、`scores`、`gameend`、`baopai` 等。

其他类型如 `.lq.RecordLiuJu`、`.lq.RecordNoTile`、`.lq.RecordAnGangAddGang` 等同理，均以 `data` 内实际字段为准。

## Django `Game.paipu_data` 约定

| 键 | 说明 |
|----|------|
| `detail` | `true` 表示来自 `--detail` |
| `actions` | 与顶层牌谱一致 |
| `players` / `result` / `uuid` / `start_time` / `end_time` | 解析接口返回的原始块 |
| `validation_ok` / `validation_errors` | `services.majsoul.validate_paipu_detail_record` 校验结果 |
| `majsoul_record_detail` | 入库标准块：`version`、`fetched_at`、`validation_*`、`uuid`、时间、`players`、`result`、`actions` |
| `retry_*` | 管理端「重新获取牌谱」时写入的摘要字段 |

校验逻辑：`backend/services/majsoul.py` 中 `validate_paipu_detail_record`。重新获取接口响应含 `paipu_detail_validation`。

## 相关代码

- Node：`backend/majsoul_node/paipu.js`（与 demo 对齐，action 无二次转换）
- Python：`backend/services/majsoul.py`、`OnlineGameRetryView`、`GameService.create_online_game`
