// 管理・定期実行の API の認証の回帰テスト（#27）
// 実行: npm test（node --test。lib/cron-auth.ts は Node の型の取り除きで読む）
//
// 1. isCronAuthorized の判定（未設定・一致・不一致・中身を確かめない Bearer・外から付けられるヘッダー）
// 2. 3つの API が isCronAuthorized だけで判定し、旧来の抜け道（x-cloudscheduler-jobname・Bearer で始まれば通す）が
//    戻っていないこと。ルートは Firebase・Vertex などを読み込むので、ここではソースを読んで確かめる。
//    旧実装（#27 の前）では 2 のテストが失敗する。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { isCronAuthorized } from '../lib/cron-auth.ts';

const SECRET = 'test-secret-for-unit-tests-only';
const req = (headers = {}) => new Request('http://localhost/api/collector', { method: 'POST', headers });

describe('isCronAuthorized', () => {
  let saved;
  beforeEach(() => {
    saved = process.env.CRON_SECRET;
    process.env.CRON_SECRET = SECRET;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = saved;
  });

  it('CRON_SECRET が一致する Bearer だけを通す', () => {
    assert.equal(isCronAuthorized(req({ authorization: `Bearer ${SECRET}` })), true);
  });

  it('CRON_SECRET が未設定なら、何を送っても拒否する', () => {
    delete process.env.CRON_SECRET;
    assert.equal(isCronAuthorized(req({ authorization: 'Bearer ' })), false);
    assert.equal(isCronAuthorized(req({ authorization: 'Bearer undefined' })), false);
    assert.equal(isCronAuthorized(req()), false);
  });

  it('鍵なし・不一致・長さ違いは拒否する', () => {
    assert.equal(isCronAuthorized(req()), false);
    assert.equal(isCronAuthorized(req({ authorization: `Bearer ${SECRET}x` })), false);
    assert.equal(isCronAuthorized(req({ authorization: `Bearer ${SECRET.slice(0, -1)}` })), false);
    assert.equal(isCronAuthorized(req({ authorization: SECRET })), false);
  });

  it('中身を確かめられない Bearer（旧 sync-status の抜け道）は拒否する', () => {
    assert.equal(isCronAuthorized(req({ authorization: 'Bearer some.oidc.token' })), false);
  });

  it('x-cloudscheduler-jobname だけ（旧 3 API の抜け道）は拒否する', () => {
    assert.equal(isCronAuthorized(req({ 'x-cloudscheduler-jobname': 'any-job' })), false);
  });
});

const ROUTES = [
  { file: 'app/api/collector/route.ts', fn: 'isAdminAuthorized' },
  { file: 'app/api/admin/reindex/route.ts', fn: 'isAuthorized' },
  { file: 'app/api/admin/sync-status/route.ts', fn: 'isAuthorized' },
];

describe('3つの API の認証の入口', () => {
  for (const { file, fn } of ROUTES) {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

    it(`${file}：判定は isCronAuthorized(req) だけ`, () => {
      const m = src.match(new RegExp(`function ${fn}\\(req: Request\\): boolean \\{([\\s\\S]*?)\\n\\}`));
      assert.ok(m, `${fn} が見つからない`);
      assert.equal(m[1].trim(), 'return isCronAuthorized(req);');
    });

    it(`${file}：旧来の抜け道が戻っていない`, () => {
      assert.doesNotMatch(src, /x-cloudscheduler-jobname/);
      assert.doesNotMatch(src, /startsWith\(['"]Bearer /);
      assert.doesNotMatch(src, /process\.env\.CRON_SECRET/);
    });

    it(`${file}：POST は判定が false なら 401 を返す`, () => {
      assert.match(src, new RegExp(`if \\(!${fn}\\(req\\)\\) \\{\\s*return Response\\.json\\(\\{ error: 'Unauthorized' \\}, \\{ status: 401 \\}\\);`));
    });
  }
});
