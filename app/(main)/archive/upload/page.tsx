import UploadWithAuth from './upload-with-auth';

export const dynamic = 'force-dynamic';

export default function UploadPage() {
  return (
    <div className="max-w-xl mx-auto px-5 py-10">
      <div className="mb-8">
        <h1 className="magic-title text-2xl font-bold mb-1">📚 文書を追加</h1>
        <p className="text-purple-300/50 text-sm">
          arXiv 論文または独自文書を書庫に追加します
        </p>
      </div>

      <UploadWithAuth />
    </div>
  );
}
