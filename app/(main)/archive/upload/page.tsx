import UploadWithAuth from './upload-with-auth';

export const dynamic = 'force-dynamic';

export default function UploadPage() {
  return (
    <div className="max-w-xl mx-auto px-5 py-10">
      <div className="mb-8">
        <h1 className="magic-title text-2xl font-bold mb-1">⬆️ 論文を追加</h1>
        <p className="text-purple-300/50 text-sm">
          PDF / Markdown をアップロードして書庫に追加します
        </p>
      </div>

      <div className="glass-panel p-5 rounded-xl space-y-4 mb-6">
        <div className="space-y-2 text-xs text-purple-300/50">
          <p className="font-medium text-purple-200/70">📌 ヒント</p>
          <ul className="space-y-1 pl-3">
            <li>• arXiv の PDF（例: <code className="bg-purple-900/30 px-1 rounded">2603.16871v1.pdf</code>）はタイトル・著者・要約を自動取得します</li>
            <li>• その他のファイルはタイトルを手動入力してください</li>
            <li>• インデックス化には最大48時間かかります</li>
          </ul>
        </div>
      </div>

      <UploadWithAuth />
    </div>
  );
}
