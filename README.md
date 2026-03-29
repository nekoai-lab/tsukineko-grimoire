# Tsukineko Grimoire（月ねこグリモワール）

**論文を、読んで終わりにしない。**

AI・機械学習の論文を日本語でつかみ、保存し、あとからチャットで聞き返せる知識書庫です。
英語の壁に止まらず、読んだ内容を自分の知識として積み上げていくことを目的に作っています。

---

## できること

- **日本語で理解する** — タイトルと要旨を日本語で確認。英語に詰まる前に全体像をつかめます
- **論文を保存してためる** — 気になった論文をマイ本棚に追加し、読書リストとして育てられます
- **チャットで深掘りする** — 蓄積した論文群に向かって疑問を投げると、根拠となる引用付きで答えが返ります
- **引用・図表・原文に戻れる** — 回答に使われた論文の代表図や結果表、arXiv 原文へのリンクをすぐ確認できます
- **Archive 一覧から論文を開く** — 保存済み論文の一覧から直接 Consult（チャット）を起動できます

---

## こんな人に向いています

- AI・機械学習を学び始めていて、論文が難しいと感じている方
- 論文を読んでも知識として残らないと感じている方
- 気になる論文を読んだあと、疑問を掘り下げる場所がほしい方
- 実務や企画で、論文ベースの知識を使いたい方

---

## コア体験

### 見つける
キーワードや自然文で論文を検索し、次に読む候補を探せます。

### つかむ
タイトルと要旨を日本語で確認。代表図や結果表も一画面で見られます。

### ためる
本棚に追加して「自分の知識リスト」を育てます。状態やテーマで整理できます。

### 聞き返す
蓄積した論文に向かってチャットで質問すると、引用と根拠を示しながら答えが返ります。
一度読んだ論文を、あとから自分で掘り直せる体験を作っています。

---

## このアプリの価値

論文管理ツールや要約サービスは多くあります。
このアプリが違うのは、「読んで終わり」にしない設計にあります。

- **保存した論文に、あとから問い直せる** — 読んだ時点でわからなかったことを、後日チャットで確認できます
- **引用の根拠まで戻れる** — 回答が「どの論文のどの部分」から来ているかを常に追えます
- **理解の入口を下げる** — 日本語への翻訳と代表図提示で、論文に入る最初のハードルを軽くします

---

## 現在の状態

**公開・運用中です。**  
継続して UI・検索・取り込みまわりを改善しています。

---

## Recent Updates

- Citation Preview のタイトル表示不具合を修正（プレースホルダーが残る問題・レイアウト崩れ）
- translated snippets / figure / table captions の翻訳結果を Firestore にキャッシュ（Translate API コスト削減）
- chats の保存先を Firebase uid / browser guest id 単位に分離（共通 `default` ドキュメントを廃止）
- 未認証時の `/login` リダイレクトを 303 に修正（POST が `/login` に引き継がれ 405 になる問題を解消）

---

## 技術スタック

| 領域 | 使用技術 |
|------|----------|
| フロントエンド | Next.js 14 / TypeScript |
| 認証・DB | Firebase Auth / Firestore |
| ストレージ | Google Cloud Storage |
| AI 検索・回答 | Vertex AI Agent Builder（Discovery Engine） |
| デプロイ | Cloud Run |

AI 機能はすべて `@google-cloud/discoveryengine` 経由で実装しています（`@google-cloud/vertexai` は使用しません）。

---

## 開発メモ

### セットアップ

```bash
cp .env.local.example .env.local
# Firebase / GCP / Vertex AI Agent Builder の各値を記入

npm install
WATCHPACK_POLLING=true npm run dev -- --port 3002
```

データ投入例: `bash scripts/curated-papers.sh 3002`（開発サーバー起動後）  
本番デプロイ: Cloud Run（`.github/workflows/deploy.yml` 参照）  
仕様・API・設計メモ: `PRD.md`

---

## Behavior Notes

**Chat / Session**
- サインインユーザーは Firebase uid 単位で chats を保存する
- ゲストユーザーは browser ごとの guest id（`localStorage` 保持）で保存する
- 共通の `default` chat ドキュメントは使わない

**Translation Cache**
- 同じ snippet / figure / table caption の翻訳は Firestore にキャッシュし、再翻訳しない
- Translate API の呼び出し回数とコストを抑えるための仕組み

**Citation Preview**
- 日本語タイトル（`titleJa`）があれば優先表示し、英題はサブタイトルとして出す
- `titleJa` 未取得の場合は英題、それもない場合は arXiv ID をフォールバックにする
- `Loading document info...` のようなプレースホルダー文字列はパネルに表示しない

---

## License / Usage

© 2024–2026 tsuki (nekoai-lab). All rights reserved.

This repository is shared for viewing, evaluation, and feedback — not for redistribution or commercial use.
For any other use, please [get in touch](https://github.com/nekoai-lab).

See [`LICENSE.md`](./LICENSE.md) for details.
