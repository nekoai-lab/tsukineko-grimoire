export default function SettingsPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <h1 className="magic-title text-3xl font-bold mb-1">⚙️ Settings</h1>
      <p className="text-purple-300/60 text-sm mb-8">魔導書の設定</p>

      <div className="space-y-4">
        <div className="glass-panel p-6">
          <h2 className="text-purple-200 font-semibold mb-4">🔐 Account</h2>
          <p className="text-purple-300/50 text-sm">Firebase Auth の設定後に利用可能になります</p>
        </div>

        <div className="glass-panel p-6">
          <h2 className="text-purple-200 font-semibold mb-4">🤖 Vertex AI Agent Builder</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-purple-300/60">Location</span>
              <span className="text-green-400 font-mono">global</span>
            </div>
            <div className="flex justify-between">
              <span className="text-purple-300/60">Engine ID</span>
              <span className="text-purple-200/50 font-mono text-xs">
                {process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
                  ? 'configured'
                  : 'not configured'}
              </span>
            </div>
          </div>
        </div>

        <div className="glass-panel p-6">
          <h2 className="text-purple-200 font-semibold mb-4">💾 Storage</h2>
          <p className="text-purple-300/50 text-sm">Cloud Storage の設定後に利用可能になります</p>
        </div>
      </div>
    </div>
  );
}
