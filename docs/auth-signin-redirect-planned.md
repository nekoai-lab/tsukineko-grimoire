# Google サインイン: popup 維持と redirect 化のメモ（未実装）

## 現行方針（2025-03 時点）

- **`signInWithPopup()` のまま運用**する。
- Cloud Run 本番で出る **COOP 関連のコンソール警告**は、**観測対象**とし、実害が出るまで対応しない。
- 次のような事象が出た時点で、本書の「redirect 化差分」を **Agent モードで適用**する候補とする:
  - ログイン失敗が常態化する
  - 無限ローディング・セッションが取れない
  - ブラウザ依存の不安定さ

## 技術背景（短く）

- `next.config.js` では既に `Cross-Origin-Opener-Policy: same-origin-allow-popups` を設定済み。
- 警告は拡張機能や環境によっても混ざることがある。シークレットウィンドウ・レスポンスヘッダ確認で切り分け可能。

## redirect 化するときの作業範囲

対象ファイル:

| ファイル | 内容 |
|----------|------|
| `app/(auth)/login/page.tsx` | `signInWithRedirect` + マウント時 `getRedirectResult` → `POST /api/auth/session` → 成功時 `router.replace('/grimoire')` |
| `components/features/settings-panel.tsx` | 同上（戻り先は `/settings`。成功時は `onAuthStateChanged` で UI が更新される想定） |
| （任意）`lib/auth-google-redirect.ts` | `getRedirectResult` + session POST の共通化 |

変更不要の想定: `lib/firebase.ts`、`middleware.ts`（`/login`・`/settings` は public）、`next.config.js` の COOP。

## 差分案（実装用・コピペベース）

### `app/(auth)/login/page.tsx`

- import: `signInWithPopup` → `getRedirectResult`, `signInWithRedirect`（`firebase/auth`）
- import: `useState` に `useEffect` を追加
- **`useEffect`（マウント時）**: `getRedirectResult(getClientAuth())` → あれば `getIdToken()` → `fetch('/api/auth/session', { idToken })` → `ok` なら `router.replace('/grimoire')`、否なら `setError`
- **`handleGoogleSignIn`**: `await signInWithRedirect(getClientAuth(), getGoogleProvider())` のみ（成功時はページ遷移するため `finally` の loading 解除は catch 側中心に整理可）

### `components/features/settings-panel.tsx`

- import: `getRedirectResult`, `signInWithRedirect` を追加、`signInWithPopup` を削除
- **`useEffect`（既存の `onAuthStateChanged` より前でも後でも可だが、リダイレクト完了を先に処理するなら前推奨）**: `getRedirectResult` → `POST /api/auth/session` → 失敗時のみ `setSignInError`
- **`handleGoogleSignIn`**: `await signInWithRedirect(...)` のみ

### 実装時チェック

- Firebase Console: Authorized domains に本番ドメインが含まれること
- リダイレクト後は **同じオリジン**の `/login` または `/settings` に戻る前提で `getRedirectResult` を呼ぶ

## Agent モードでの指示例

```
docs/auth-signin-redirect-planned.md に沿って、signInWithPopup を signInWithRedirect +
getRedirectResult に置き換えて。login と settings の両方。
```
