<p align="center">
  <h1 align="center">嘉の雀桩</h1>
  <p align="center">
    <strong>麻雀対局記録アシスタント</strong><br/>
    オフライン採点 &middot; 雀魂牌譜インポート &middot; 統計・ランキング
  </p>
  <p>
    <img src="https://img.shields.io/badge/Python-3.12+-blue?logo=python&logoColor=white" alt="Python"/>
    <img src="https://img.shields.io/badge/Django-5.x-green?logo=django&logoColor=white" alt="Django"/>
    <img src="https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white" alt="React"/>
    <img src="https://img.shields.io/badge/TypeScript-6-3178c6?logo=typescript&logoColor=white" alt="TypeScript"/>
  </p>
  <p align="center">
    <a href="README.md">中文</a> &middot;
    <a href="README.en.md">English</a> &middot;
    <a href="README.ja.md">日本語</a>
  </p>
</p>

<img src="docs/image/img.png" alt="homepage" width="100%"/>

---

## 機能一覧

### 雀士管理
- 雀士の作成・編集・削除
- 雀魂アカウント連携（UID → 雀士自動マッチング）
- 雀士プロフィール：PT カーブ、順位分布、役満記録

### オフライン対局
- ルーム作成、メンバー管理
- **3 人打ち / 4 人打ち**、**東風戦 / 半荘戦** に対応
- 点数合計の自動検証（4 人 = 1000、3 人 = 1050）
- ワンクリックで座席をランダム割り当て（東・南・西・北）
- 前局の参加者をコピーして次局を素早く開始

### 雀魂牌譜インポート
- 牌譜リンクを一括貼り付け、自動解析
- 雀魂 WebSocket プロトコルでローカルに対局情報を取得（開始/終了時間、プレイヤー得点）
- 雀魂 UID を連携済み雀士に自動マッチング、未連携はワンクリックで作成・連携
- 1 分間 20 回のレート制限でアクセス制御
- 重複リンク検出で二重インポート防止

### 統計・ランキング
- **PT ランキング** — PT 自動計算・ランキング表示
- **おもしろランキング** — 一位率、平均順位、最高・最低得点など
- **雀士統計** — 順位分布、合計 PT、直近 N 局の順位推移と累積 PT カーブ。オフライン/オンラインで絞り込み可能

### 役満牌譜
- 役満牌譜の記録（手牌・副露・和了方法）
- 役満ギャラリー（種類別フィルタリング対応）

### 段位システム
- カスタム段位（名称・点数・昇降ルール）
- 段位点の自動計算、リアルタイムランキング

### その他
- **点数計算機** — 手動で和了点数を計算
- **役の練習** — インタラクティブな役の練習
- **公開閲覧** — 誰でも全ページを閲覧可能、管理者のみ編集操作

---

## 技術スタック

| 層 | 技術 |
|:-:|:-:|
| バックエンド | Python / Django 5.x / Django REST Framework / SQLite |
| フロントエンド | React 19 / TypeScript / Vite / Tailwind CSS |
| 牌譜取得 | Node.js / WebSocket / Protobuf（雀魂プロトコル） |
| プロキシ | Node.js / http-proxy（統合ポート） |

## プロジェクト構成

```
Mahjong/
├── Makefile                  # ワンクリック起動・環境チェック・サービス管理
├── proxy.cjs                 # 統合リバースプロキシ (ポート 9999)
├── backend/                  # Django バックエンド
│   ├── config/               # Django プロジェクト設定
│   ├── apps/users/           # ユーザー認証
│   ├── apps/players/         # 雀士管理
│   ├── apps/games/           # 対局管理（ルーム + 対局 + 牌譜）
│   ├── apps/ranking/         # 段位ランキング
│   ├── services/             # ビジネスサービス（雀魂牌譜パーサー）
│   ├── majsoul_node/         # 雀魂牌譜 Node スクリプト
│   ├── db_config.json        # ローカル設定（コミット対象外）
│   └── db_config.example.json
└── frontend/                 # React フロントエンド
    └── src/
        ├── api/              # API リクエスト層
        ├── pages/            # ページコンポーネント
        ├── components/       # 共通コンポーネント
        └── layouts/          # レイアウト
```

## クイックスタート

### 動作環境

- Python 3.12+
- Node.js 18+（npm 含む）
- Make

### インストール

```bash
git clone <repo-url>
cd Mahjong

# 環境チェック・依存パッケージのインストール
make env

# データベース初期化 + 管理者作成
# デフォルト: admin / admin123
# 上書き: ADMIN_USER=xxx ADMIN_PASS=xxx make init
make init
```

### 起動

```bash
make dev
```

| URL | サービス |
|:---:|:--------:|
| http://localhost:9999 | 統合エントリ（推奨） |
| http://localhost:9998 | フロントエンド開発サーバー |
| http://localhost:9997 | バックエンド API |

### 主要コマンド

| コマンド | 説明 |
|:--------:|:----:|
| `make dev` | 全サービス起動 |
| `make check` | サービス状態確認 |
| `make stop` | 全サービス停止 |
| `make restart` | 全サービス再起動 |
| `make migrate` | データベースマイグレーション実行 |
| `make env` | 環境チェック・依存インストール |

## 設定

### データベースと雀魂アカウント

`backend/db_config.json`（`db_config.example.json` をコピーして使用）：

```json
{
    "database": {
        "sqlite_path": "db.sqlite3"
    },
    "majsoul_account": "雀魂アカウント",
    "majsoul_password": "雀魂パスワード"
}
```

- `sqlite_path`：`backend/` からの相対パス、または絶対パス
- `majsoul_account` / `majsoul_password`：雀魂 WebSocket プロトコルで牌譜情報を取得するための認証情報
- このファイルは `.gitignore` に含まれており、コミットされません

> 環境変数 `MAJSOUL_ACCOUNT` / `MAJSOUL_PASSWORD` でも上書き可能

### 牌譜 Node 依存パッケージ

牌譜インポート機能を初めて使用する前に、Node 依存パッケージをインストール：

```bash
cd backend/majsoul_node && npm install
```

## 採点ルール

### 点数

- **4 人打ち**：点数合計 = 1000
- **3 人打ち**：点数合計 = 1050
- 点数は整数、マイナス可
- 東起家を 1 名必ず指定

### PT 計算

| 順位 | 4 人 | 3 人 |
|:----:|:----:|:----:|
| 1 位 | +30 | +30 |
| 2 位 | +10 | 0 |
| 3 位 | -10 | -30 |
| 4 位 | -30 | — |

## 管理者

- ページ右上の「管理者ログイン」からログイン
- 管理者はすべての書き込み操作が可能（ルーム作成、採点、雀士管理等）
- その他のユーザーは全ページを自由に閲覧可能
- Django コマンドで管理者を作成：

```bash
cd backend
.venv/bin/python manage.py createsuperuser
```

## License

[MIT](LICENSE)

---

<p align="center">
  <a href="README.md">中文</a> &middot;
  <a href="README.en.md">English</a> &middot;
  <a href="README.ja.md">日本語</a>
</p>
