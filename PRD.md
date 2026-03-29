# Tsukineko Grimoire — Product Requirements Document

> この文書はメンテナンス・改善を担う人向けの設計基準書です。  
> プロダクト紹介は `README.md` を参照してください。

---

## 1. Product Overview

AI・機械学習論文の個人向け知識書庫。  
論文の発見・保存・チャットによる再利用という一連の体験を提供する。

**誰のため**: 論文を読んでも知識として残らないと感じる個人ユーザー  
**解く課題**: 「保存して終わり」「英語で止まる」「あとから見返せない」の3つ

---

## 2. Product Scope

### 現在の主要機能

| 機能 | 説明 |
|------|------|
| Archive | 論文一覧の閲覧・検索・フィルタ |
| Upload | PDF / Markdown の取り込み・GCS + Agent Builder へのインジェスト |
| Consult | 蓄積論文へのチャット問い合わせ（引用付き回答） |
| Citation Preview | 引用論文の日本語タイトル・要旨・代表図・結果表を表示 |
| Shelf（本棚） | 気になった論文のブックマーク |
| arXiv Collector | 毎日深夜に arXiv から自動収集（システムバックグラウンド処理） |

### スコープ外（現時点）

- 複数ユーザー間の共有・コラボレーション
- Gemini / Vertex AI Generative AI の直接呼び出し
- 記事の自動生成・出力（`/api/cast-article` は廃止候補）

---

## 3. Core User Flows

### Discover
Archive 一覧で論文をキーワード・テーマ・カテゴリでフィルタし、詳細を確認する。

### Save
論文を Shelf に追加する。または Upload から PDF をインジェストして書庫に追加する。

### Consult（チャット）
Grimoire ページでチャット形式の質問を投げ、Agent Builder が引用付きで回答する。  
回答中の引用をクリックすると Citation Preview が開く。

Archive の「Consultで開く」から特定論文の Citation Preview を直接起動できる。

### Citation Preview
選択した論文の日本語タイトル・要旨・代表図・結果表・arXiv リンクを表示するパネル。  
デスクトップは右サイドパネル、モバイルはボトムシートで表示する。

### Guest / Signed-in
- ゲスト: ブラウザごとの `guest_{uuid}`（localStorage キー: `tsukineko_grimoire_guest_chat_id`）でチャット履歴を保持
- サインインユーザー: Firebase uid でチャット履歴を保持
- 共通の `default` chat ドキュメントは使用しない

---

## 4. Technical Principles

### Agent Builder / Discovery Engine 優先

AI 機能はすべて `@google-cloud/discoveryengine` 経由とする。  
`@google-cloud/vertexai`・`GenerativeModel`・`generateContent()` の使用は禁止。  
違反はコストの大幅増につながる。

```
✅ @google-cloud/discoveryengine（ConversationalSearchServiceClient 等）
❌ @google-cloud/vertexai / Gemini API 直接呼び出し
```

### Agent Builder Location 設定

```
Location: global（必須）
API Endpoint: discoveryengine.googleapis.com（regional prefix なし）
Engine ID / Data Store ID: 短い ID のみ（フルパス禁止）
```

### コストを抑える

翻訳 API の呼び出しは Firestore キャッシュで抑制する。  
同じ snippet / figure / table caption は一度翻訳したら再翻訳しない。

### 既存体験を壊さない

認証・チャット・プレビューの挙動変更は副作用の確認を必須とする。

### プレースホルダー文字列を UI に出さない

取得前に入れたダミー文字列（例: `'Loading document info...'`）は、  
取得完了後に UI に残り続けない設計にする。

### 共有状態を持たない

チャット履歴は uid / guest id で分離する。複数ユーザーで状態を共有するドキュメントは作らない。

---

## 5. Architecture Overview

```
Browser
  └── Next.js 14 (App Router, Cloud Run)
        ├── Firebase Auth（Google Sign-in / Session Cookie）
        ├── Firestore（documents / chats / caches）
        ├── Google Cloud Storage（PDF アーカイブ）
        └── Vertex AI Agent Builder
              ├── ConversationalSearchServiceClient（チャット）
              └── SearchServiceClient（検索）
```

### 認証フロー

1. クライアント: Firebase `signInWithPopup` → idToken 取得
2. `POST /api/auth/session` → サーバーで Session Cookie 発行（5日間有効）
3. Middleware: Cookie の存在確認のみ（Edge Runtime 制約のため firebase-admin 不使用）
4. API Route: `verifyAndGetUser()` で Session Cookie を検証し uid を取得

未認証時のリダイレクトは **303 See Other** で `/login` へ（307 だと POST が引き継がれ 405 になるため）。

### API Routes 一覧

| Route | 用途 |
|-------|------|
| `POST /api/auth/session` | Session Cookie 発行 |
| `DELETE /api/auth/session` | Session Cookie 削除（サインアウト） |
| `GET /api/auth/me` | 現在のユーザー情報 |
| `POST /api/chat` | チャット問い合わせ（Agent Builder） |
| `POST /api/ingest` | PDF インジェスト（GCS + Firestore） |
| `POST /api/citation` | 論文メタデータ取得（Firestore + 翻訳） |
| `GET /api/paper-figures` | 論文代表図・結果表取得（arXiv HTML パース） |
| `POST/DELETE /api/shelf` | 本棚に追加・削除 |
| `GET /api/collector` | arXiv 自動収集（CRON_SECRET 認証） |
| `GET /api/documents/check-status` | インジェスト状態確認 |
| `GET /api/arxiv-preview` | arXiv プレビュー確認 |

---

## 6. Data Model

### `documents/{docId}`

論文メタデータ。GCS パス・インジェスト状態・arXiv メタデータを保持する。

主要フィールド: `arxivId`, `title`, `titleJa`, `summary`, `summaryJa`, `authors`, `publishedAt`, `category`, `status`（pending / indexed / failed）, `gcsPath`, `uploadedAt`

### `chats/{chatId}`

チャット履歴。`chatId` は Firebase uid またはゲスト id（`guest_{uuid}`）を使う。  
共通の `default` ドキュメントは使わない。

主要フィールド: `messages`（role / content / citations 配列）, `updatedAt`

### `translation_snippet_cache/{docId}`

引用スニペットの翻訳キャッシュ。同じ英語テキストへの再翻訳を防ぐ。

### `translation_paper_figure_caption_cache/{docId}`

論文の figure / table caption の翻訳キャッシュ。

### `shelf/{docId}` または `users/{uid}/shelf/{docId}`

ユーザーのブックマーク済み論文。

---

## 7. Key Behaviors / Rules

### Chat セッション
- サインインユーザー: Firebase uid を chatId に使用
- ゲストユーザー: localStorage の `tsukineko_grimoire_guest_chat_id` に保存した `guest_{uuid}` を使用
- chatId が空のうちは送信できない（`chatStorageReady` で制御）

### 翻訳キャッシュ
- `POST /api/citation` でのスニペット翻訳は Firestore キャッシュを先に確認する
- `GET /api/paper-figures` での figure / table caption 翻訳も同様にキャッシュする
- キャッシュヒット時は Translate API を呼ばない

### Citation Preview タイトル表示
1. `enriched.titleJa` があれば大見出しとして表示する
2. `citation.title` が実タイトル（プレースホルダーでない）なら小見出しとして表示する
3. `titleJa` がない場合は `citation.title` を大見出しにする
4. `citation.title` が `'Loading document info...'` 等のプレースホルダーである場合は表示せず、`arXiv:${arxivId}` またはフォールバック文字列を使う

### 未認証時の扱い
- Middleware: `session` Cookie がなければ **303** で `/login` にリダイレクト
- API Route: `verifyAndGetUser()` が失敗した場合は 401 を返す
- クライアントへのサーバーサイド環境変数の漏洩は禁止（`NEXT_PUBLIC_` なしの変数）

### エラー時のフォールバック
- citation API・paper-figures API はサイレント失敗（catch でスルー）し、取得できた部分だけ表示する
- Agent Builder エラーコードは魔法テーマのメッセージに変換する

---

## 8. Operational Notes

### デプロイ

- Cloud Run（`Dockerfile` + `next.config.js output: 'standalone'`）
- ポート: 8080
- GitHub Actions で `main` ブランチへの push 時に自動デプロイ（`.github/workflows/deploy.yml`）

### 環境変数

サーバーサイド秘密情報は Secret Manager で管理し、Cloud Run に注入する。  
ローカル開発時は `.env.local`（`.env.local.example` を参照）。

主要な変数:

| 変数 | 用途 |
|------|------|
| `VERTEX_AI_LOCATION` | 必ず `global` |
| `VERTEX_AI_ENGINE_ID` | 短い ID のみ |
| `VERTEX_AI_DATA_STORE_ID` | 短い ID のみ |
| `GOOGLE_CLOUD_PROJECT_ID` | GCP プロジェクト ID |
| `GCS_BUCKET_NAME` | PDF アーカイブバケット |
| `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | Firebase Admin 認証 |
| `CRON_SECRET` | arXiv Collector 認証 |

### arXiv Collector

Cloud Scheduler から `GET /api/collector` を `Bearer CRON_SECRET` で叩く。  
毎日深夜 2 時（JST）。AI・ML 系キーワードで最新論文を自動収集し、Firestore + GCS に保存する。

### コードレビューチェック

```bash
grep -r "from '@google-cloud/vertexai'" .
grep -r "GenerativeModel" .
grep -r "generateContent" .
```

これらが検出された場合は即座に修正する。

---

## 9. Future Improvements

- `titleJa` / `summaryJa` が Firestore にない論文への arXiv API フォールバック（現在は空のまま）
- ゲスト → サインイン時のチャット履歴マイグレーション
- モバイル UX の磨き込み（Citation Preview の操作性）
- インジェスト後の Agent Builder インデックス反映確認の自動化

---

*詳細な仕様・curl 例・管理者コマンドは旧バージョンの git 履歴を参照してください。*
