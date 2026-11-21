import { timingSafeEqual } from 'crypto';

/**
 * 管理・定期実行の API の認証。`Authorization: Bearer <CRON_SECRET>` が一致したときだけ通す。
 *
 * - CRON_SECRET が未設定なら常に拒否する
 * - `x-cloudscheduler-jobname` などのヘッダーは外から誰でも付けられるので、認証には使わない
 * - 「Bearer で始まれば通す」もしない（トークンの中身を確かめていないため）
 */
export function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(auth);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
