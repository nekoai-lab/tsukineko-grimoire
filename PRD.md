# 📜 Tsukineko Grimoire: Complete Development Specification

## 🎯 Project Overview

**Project Name**: Tsukineko Grimoire (月ねこグリモワール)

**Concept**: "知識を貪り、創造の魔法を紡ぐ、自分専用の魔導書"  
A Personal Grimoire that devours knowledge and casts creation spells.

**Primary Goal**: Google Cloud "Trial credit for GenAI App Builder" ($1,000 / ¥148,035) を最大限活用し、RAGベースの知識管理・コンテンツ作成アプリケーションを構築する。

**Development Timeline**: 約2ヶ月（有効期限: 2026年9月6日まで余裕あり）

**Core Value Proposition**:
- **Total Recall**: 数千のPDF/Docsから瞬時に情報を検索（Enterprise-grade semantic search）
- **Content Alchemy**: 生データ（論文）を構造化された記事（Gold）に変換
- **Coupon Optimization**: Vertex AI Agent Builder (Discovery Engine API) のみを使用してクーポンを確実に消費

---

## 💰 CRITICAL CONSTRAINT: クーポン利用の絶対的制約

### ⚠️ 最重要ルール

このプロジェクトの最大目的は **Vertex AI Agent Builder のクーポンを消費すること** です。
以下のルールを **絶対に** 守ってください。違反すると高額請求が発生します。

### ✅ 許可されるAPI・ライブラリ (ALLOWLIST)

**必ずこれらのみを使用:**

```typescript
// ✅ CORRECT: Agent Builder 経由のみ
import { ConversationalSearchServiceClient } from '@google-cloud/discoveryengine';
import { SearchServiceClient } from '@google-cloud/discoveryengine';
import { DocumentServiceClient } from '@google-cloud/discoveryengine';
```

**使用可能なサービス:**
- **Library**: `@google-cloud/discoveryengine`
- **Service**: Vertex AI Agent Builder (Discovery Engine API)
- **Methods**:
  - `ConversationalSearchServiceClient` (会話型検索)
  - `SearchServiceClient` (通常検索)
  - `DocumentServiceClient` (ドキュメント管理)

### ❌ 禁止されるAPI・ライブラリ (BLOCKLIST)

**絶対に使用禁止:**

```typescript
// ❌ FORBIDDEN: これらは高額請求の原因
import { VertexAI } from '@google-cloud/vertexai';
import { GenerativeModel } from '@google-cloud/vertexai';
import * as aiplatform from '@google-cloud/aiplatform';

// ❌ これらのメソッドも禁止
const model = vertex.getGenerativeModel();
const result = await model.generateContent();
const stream = await model.streamGenerateContent();
```

**禁止サービス:**
- `@google-cloud/vertexai` パッケージ全体
- Gemini API の直接呼び出し
- Vertex AI Generative AI API
- Text-to-Speech API
- Video Intelligence API

### 🔍 コードレビューチェックリスト

すべてのコミット前に確認:

```bash
grep -r "from '@google-cloud/vertexai'" .
grep -r "GenerativeModel" .
grep -r "generateContent" .
```

---

## 🛠️ Technology Stack

### Frontend

```json
{
  "framework": "Next.js 14 (App Router)",
  "language": "TypeScript (strict mode)",
  "styling": "Tailwind CSS",
  "ui-library": "Shadcn UI",
  "animation": "Framer Motion",
  "icons": "Lucide React",
  "toast": "Sonner",
  "markdown": "react-markdown + remark-gfm"
}
```

### Backend / Infrastructure

```json
{
  "compute": "Google Cloud Run (Serverless)",
  "ai-engine": "Vertex AI Agent Builder (Location: global)",
  "library": "@google-cloud/discoveryengine",
  "storage": "Google Cloud Storage",
  "database": "Firestore",
  "auth": "Firebase Authentication (Google Sign-in)",
  "scheduler": "Cloud Scheduler (OIDC認証)"
}
```

### Development Tools

```json
{
  "package-manager": "pnpm",
  "testing": "Vitest (Unit) + Playwright (E2E)",
  "linting": "ESLint + Prettier",
  "git": "GitHub"
}
```

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    User (Browser/Mobile)                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│              Grimoire UI (Next.js 14)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Chat UI      │  │ File Upload  │  │ Article      │     │
│  │ (Levitation) │  │ (Mana)       │  │ Editor       │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│              Cloud Run (API Routes / Node.js Runtime)       │
│  /api/chat          /api/ingest        /api/collector       │
└─────┬────────────────┬────────────────────┬─────────────────┘
      │                │                    │
┌─────▼────────────────▼────────────────────▼─────────────────┐
│                Google Cloud Platform                        │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐ │
│  │ Cloud Storage  │  │   Firestore    │  │  Scheduler   │ │
│  │ (PDF Archive)  │  │  (Memories)    │  │  (OIDC Cron) │ │
│  └────────┬───────┘  └────────────────┘  └──────────────┘ │
│           │ Auto Sync                                       │
│  ┌────────▼─────────────────────────────────────────────┐ │
│  │   Vertex AI Agent Builder (Location: global)         │ │
│  │  ┌──────────────┐         ┌──────────────────────┐  │ │
│  │  │  Indexer     │◄────────│  Search Engine       │  │ │
│  │  │  (Auto)      │         │  (Enterprise)        │  │ │
│  │  └──────────────┘         └──────────────────────┘  │ │
│  └──────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## ⚡ Feature Requirements (The Spells)

### 🔮 Feature 1: Mana Ingestion (Document Upload)

**Description**: PDFやMarkdownファイルを魔導書に取り込む

**UI Specifications**:
- Drag & Drop ゾーンにグロウエフェクト
- アップロード中はプログレスバー + パーティクルアニメーション
- 完了時トースト通知: "Knowledge Devoured"

**Technical Implementation**:

```typescript
// app/api/ingest/route.ts
import { Storage } from '@google-cloud/storage';
import { verifyAndGetUser } from '@/lib/auth-helpers';
import { firestore, FieldValue } from '@/lib/firebase-admin';

export async function POST(req: Request) {
  let userId: string;
  try {
    const user = await verifyAndGetUser(req);
    userId = user.uid;
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File;

  if (!file || file.size > 100 * 1024 * 1024) {
    return Response.json({ error: 'File too large (max 100MB)' }, { status: 400 });
  }

  const allowedTypes = ['application/pdf', 'text/markdown', 'text/plain'];
  if (!allowedTypes.includes(file.type)) {
    return Response.json({ error: 'Invalid file type' }, { status: 400 });
  }

  const storage = new Storage();
  const bucket = storage.bucket(process.env.GCS_BUCKET_NAME!);
  const destination = `users/${userId}/docs/${Date.now()}_${file.name}`;

  const [url] = await bucket.file(destination).getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 15 * 60 * 1000,
    contentType: file.type,
  });

  const docRef = await firestore.collection('documents').add({
    userId,
    filename: file.name,
    gcsPath: `gs://${process.env.GCS_BUCKET_NAME}/${destination}`,
    fileSize: file.size,
    mimeType: file.type,
    status: 'pending',
    uploadedAt: FieldValue.serverTimestamp(),
  });

  return Response.json({
    uploadUrl: url,
    documentId: docRef.id,
  });
}
```

**Constraints**:
- 最大ファイルサイズ: 100MB
- 対応形式: PDF, Markdown, Text
- GCS Auto-sync により Agent Builder が自動インデックス化（24-48時間）

---

### 🧙‍♂️ Feature 2: Grimoire Search (RAG Chat)

**Description**: 魔導書に質問して知識を引き出す

**UI Layout**:
```
┌─────────────────┬─────────────────┐
│  Chat History   │  Citation       │
│  (60%)          │  Preview (40%)  │
│                 │                 │
│ User: Question  │  [Selected]     │
│                 │  ┌───────────┐  │
│ AI: Answer      │  │ PDF       │  │
│     [1][2]      │  │ Snippet   │  │
│                 │  │ Highlight │  │
│ [Input Field]   │  └───────────┘  │
└─────────────────┴─────────────────┘
```

**Implementation** (クーポン厳守・全修正適用):

```typescript
// app/api/chat/route.ts
import { ConversationalSearchServiceClient } from '@google-cloud/discoveryengine';
import { verifyAndGetUser } from '@/lib/auth-helpers';
import { firestore, FieldValue } from '@/lib/firebase-admin';

export async function POST(req: Request) {
  let userId: string;
  try {
    const user = await verifyAndGetUser(req);
    userId = user.uid;
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { question, conversationId, chatId } = await req.json();

  // ✅ Location-aware endpoint
  const location = process.env.VERTEX_AI_LOCATION!; // 'global'
  const apiEndpoint = location === 'global'
    ? 'discoveryengine.googleapis.com'
    : `${location}-discoveryengine.googleapis.com`;

  const client = new ConversationalSearchServiceClient({ apiEndpoint });

  // ✅ Short IDs only in env vars
  const servingConfig = client.projectLocationCollectionEngineServingConfigPath(
    process.env.GOOGLE_CLOUD_PROJECT_ID!,
    location,
    'default_collection',
    process.env.VERTEX_AI_ENGINE_ID!, // Short ID: my-engine_1234567890
    'default_config'
  );

  try {
    const [response] = await client.converseConversation({
      name: servingConfig,
      query: { text: question },
      conversation: conversationId ? { name: conversationId } : undefined,
      summarySpec: {
        summaryResultCount: 5,
        includeCitations: true,
        modelSpec: { version: 'stable' },
      },
      userPseudoId: userId,
    });

    await firestore.collection('chats').doc(chatId).update({
      messages: FieldValue.arrayUnion(
        {
          role: 'user',
          content: question,
          timestamp: FieldValue.serverTimestamp(),
        },
        {
          role: 'assistant',
          content: response.reply?.summary?.summaryText || '',
          citations: response.reply?.summary?.summaryWithMetadata?.references || [],
          timestamp: FieldValue.serverTimestamp(),
        }
      ),
    });

    return Response.json({
      answer: response.reply?.summary?.summaryText || '',
      citations: response.reply?.summary?.summaryWithMetadata?.references || [],
      conversationId: response.conversation?.name,
    });
  } catch (error: unknown) {
    console.error('Agent Builder API error:', error);
    const err = error as { code?: string };
    const errorMessages: Record<string, string> = {
      RESOURCE_EXHAUSTED: '魔力が不足しています。しばらくお待ちください',
      NOT_FOUND: 'その知識は魔導書に記録されていません',
      INVALID_ARGUMENT: '呪文の詠唱に失敗しました',
      UNAUTHENTICATED: '魔導書へのアクセスが拒否されました',
    };

    return Response.json(
      { error: errorMessages[err.code ?? ''] || '予期せぬ魔法の干渉が発生しました' },
      { status: 500 }
    );
  }
}
```

---

### 📜 Feature 3: Spell Casting (Article Generation)

**Description**: 検索結果から構造化された技術記事を生成

**Important**: Gemini APIは使わない！Agent Builderの要約機能のみ使用

```typescript
// app/api/cast-article/route.ts
import { SearchServiceClient } from '@google-cloud/discoveryengine';
import { verifyAndGetUser } from '@/lib/auth-helpers';

export async function POST(req: Request) {
  try {
    await verifyAndGetUser(req);
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { topic } = await req.json();

  // ✅ Location-aware endpoint
  const location = process.env.VERTEX_AI_LOCATION!;
  const apiEndpoint = location === 'global'
    ? 'discoveryengine.googleapis.com'
    : `${location}-discoveryengine.googleapis.com`;

  const client = new SearchServiceClient({ apiEndpoint });

  const servingConfig = client.projectLocationCollectionDataStoreServingConfigPath(
    process.env.GOOGLE_CLOUD_PROJECT_ID!,
    location,
    'default_collection',
    process.env.VERTEX_AI_DATA_STORE_ID!, // Short ID only
    'default_config'
  );

  const [response] = await client.search({
    servingConfig,
    query: `詳細な技術情報とコード例を含む: ${topic}`,
    pageSize: 10,
    contentSearchSpec: {
      summarySpec: {
        summaryResultCount: 10,
        includeCitations: true,
        modelPromptSpec: {
          preamble: `次のトピックについて、技術記事の詳細な構成案を提示してください：

トピック: ${topic}

以下を含めてください:
- タイトル案
- 見出し構成（H2, H3レベル）
- 各セクションで扱うべき具体的な内容
- 重要なキーワードとコンセプト
- 実装例やコードスニペットの提案

Zenn/Qiita形式で読みやすく構成してください。`,
        },
      },
    },
  });

  const outline = response.summary?.summaryText || '';
  const citations = response.summary?.summaryWithMetadata?.references || [];
  const markdown = formatAsZennArticle(topic, outline, citations);

  return Response.json({ markdown });
}

function formatAsZennArticle(
  topic: string,
  outline: string,
  citations: unknown[]
): string {
  const timestamp = new Date().toISOString().split('T')[0];
  const refs = citations as Array<{ title?: string; uri?: string }>;

  return `---
title: "${topic}"
emoji: "🪄"
type: "tech"
topics: ["ai", "rag", "vertex-ai"]
published: false
---

# ${topic}

${outline}

## 参考文献

${refs.map((c, i) => `${i + 1}. [${c.title || 'Untitled'}](${c.uri || '#'})`).join('\n')}

---

*この記事は Tsukineko Grimoire によって生成されました (${timestamp})*
`;
}
```

---

### 🛰️ Feature 4: Auto Summon (arXiv Auto Collection)

**Description**: arXivから最新論文を自動ダウンロード

**Specifications**:
- 実行タイミング: 毎日深夜2時 (JST)
- キーワード: "LLM", "RAG", "Agent", "Transformer"
- 取得件数: 最新5件/日
- レートリミット対策: 各ダウンロード間に3秒待機

```typescript
// app/api/collector/route.ts
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { Storage } from '@google-cloud/storage';
import { firestore, FieldValue } from '@/lib/firebase-admin';

export async function GET(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const keywords = ['LLM', 'RAG', 'Retrieval Augmented Generation', 'Agent'];
  const query = keywords.join(' OR ');

  try {
    const response = await axios.get('http://export.arxiv.org/api/query', {
      params: {
        search_query: `all:${query}`,
        start: 0,
        max_results: 5,
        sortBy: 'submittedDate',
        sortOrder: 'descending',
      },
      headers: {
        'User-Agent': 'Tsukineko-Grimoire/1.0 (mailto:your@email.com)',
      },
    });

    const parser = new XMLParser();
    const data = parser.parse(response.data);
    const entries = Array.isArray(data.feed.entry)
      ? data.feed.entry
      : [data.feed.entry];

    const storage = new Storage();
    const bucket = storage.bucket(process.env.GCS_BUCKET_NAME!);
    const collected: Array<{ title: string; arxivId: string }> = [];

    for (const entry of entries) {
      const arxivId = entry.id.split('/').pop();
      const pdfUrl = entry.id.replace('abs', 'pdf') + '.pdf';

      try {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const pdfData = await downloadWithRetry(pdfUrl);

        const filename = `arxiv_${arxivId}_${Date.now()}.pdf`;
        const destination = `incoming/${filename}`;

        await bucket.file(destination).save(pdfData, {
          contentType: 'application/pdf',
          metadata: {
            customMetadata: {
              title: entry.title,
              authors: Array.isArray(entry.author)
                ? entry.author.map((a: { name: string }) => a.name).join(', ')
                : entry.author.name,
              published: entry.published,
              arxivId,
              source: 'arxiv',
            },
          },
        });

        await firestore.collection('documents').add({
          userId: 'system',
          filename,
          gcsPath: `gs://${process.env.GCS_BUCKET_NAME}/${destination}`,
          status: 'pending',
          uploadedAt: FieldValue.serverTimestamp(),
          metadata: {
            title: entry.title,
            authors: Array.isArray(entry.author)
              ? entry.author.map((a: { name: string }) => a.name)
              : [entry.author.name],
            arxivId,
            publishedDate: entry.published,
            source: 'arxiv',
          },
        });

        collected.push({ title: entry.title, arxivId });
      } catch (error) {
        console.error(`Failed to download ${arxivId}:`, error);
      }
    }

    return Response.json({ collected: collected.length, papers: collected });
  } catch (error) {
    console.error('Collector error:', error);
    return Response.json({ error: 'Collection failed' }, { status: 500 });
  }
}

async function downloadWithRetry(
  url: string,
  maxRetries = 3,
  delay = 1000
): Promise<Buffer> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      if (i > 0) await new Promise(resolve => setTimeout(resolve, delay * i));

      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: { 'User-Agent': 'Tsukineko-Grimoire/1.0 (mailto:your@email.com)' },
      });

      return Buffer.from(response.data);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
  throw new Error('Max retries exceeded');
}
```

---

## 🎨 UI/UX Design Guidelines

### Theme: Magic × Cyberpunk

**Color Palette**:

```css
:root {
  --void-black: #0a0a0a;
  --mystic-purple: #7c3aed;
  --gold-accent: #fbbf24;
  --ghost-white: #f9fafb;
  --mana-glow: #a78bfa;
  --shadow-deep: rgba(0, 0, 0, 0.8);
}
```

**Typography**:
- Body: Inter (Clean, Modern)
- Headers: Cinzel (Magical feel) - Google Fonts で読み込み
- Code: JetBrains Mono

**Animation Effects**:

```tsx
// Glassmorphism
<div className="bg-black/60 backdrop-blur-xl border border-purple-500/20 rounded-lg">
  {children}
</div>

// Levitation
<motion.div
  animate={{ y: [0, -8, 0] }}
  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
>
  {children}
</motion.div>

// Glow on Hover
<button className="hover:shadow-[0_0_20px_rgba(167,139,250,0.6)] transition-shadow duration-300">
  {children}
</button>
```

**Particle Background**:

```tsx
// components/magic-ui/particle-bg.tsx
'use client';

import { useEffect, useRef } from 'react';

export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    class Particle {
      x: number;
      y: number;
      size: number;
      speedX: number;
      speedY: number;

      constructor() {
        this.x = Math.random() * canvas!.width;
        this.y = Math.random() * canvas!.height;
        this.size = Math.random() * 2 + 1;
        this.speedX = Math.random() * 0.5 - 0.25;
        this.speedY = Math.random() * 0.5 - 0.25;
      }

      update() {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.x > canvas!.width) this.x = 0;
        if (this.x < 0) this.x = canvas!.width;
        if (this.y > canvas!.height) this.y = 0;
        if (this.y < 0) this.y = canvas!.height;
      }

      draw() {
        ctx!.fillStyle = 'rgba(167, 139, 250, 0.5)';
        ctx!.beginPath();
        ctx!.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx!.fill();
      }
    }

    const particles = Array.from({ length: 50 }, () => new Particle());

    function animate() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      particles.forEach(p => { p.update(); p.draw(); });
      requestAnimationFrame(animate);
    }

    animate();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" />;
}
```

**Terminology (Magic Theme)**:

| Standard | Grimoire |
|----------|----------|
| Upload | Ingest (取り込む) |
| Search | Consult (問う) |
| Generate | Cast (詠唱する) |
| Library | Archive (書庫) |
| Document | Scroll (巻物) |
| Answer | Revelation (啓示) |

**Responsive Layout**:

```tsx
// app/(main)/grimoire/page.tsx
<div className="flex flex-col md:flex-row min-h-screen">
  {/* Chat - Full width on mobile, 60% on tablet+ */}
  <div className="w-full md:w-[60%] lg:w-[55%] border-r border-purple-500/20">
    <ChatInterface />
  </div>
  {/* Preview - Hidden on mobile, 40% on tablet+ */}
  <div className="hidden md:block md:w-[40%] lg:w-[45%]">
    <CitationPreview />
  </div>
</div>
```

---

## 📁 Directory Structure

```
tsukineko-grimoire/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   ├── (main)/
│   │   ├── archive/
│   │   │   └── page.tsx
│   │   ├── grimoire/
│   │   │   └── page.tsx
│   │   ├── settings/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   ├── api/
│   │   ├── auth/
│   │   │   └── session/
│   │   │       └── route.ts
│   │   ├── chat/
│   │   │   └── route.ts
│   │   ├── ingest/
│   │   │   └── route.ts
│   │   ├── cast-article/
│   │   │   └── route.ts
│   │   └── collector/
│   │       └── route.ts
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   ├── magic-ui/
│   │   ├── floating-card.tsx
│   │   ├── glowing-button.tsx
│   │   ├── particle-bg.tsx
│   │   └── glass-panel.tsx
│   ├── features/
│   │   ├── chat-interface.tsx
│   │   ├── message-bubble.tsx
│   │   ├── citation-modal.tsx
│   │   ├── file-uploader.tsx
│   │   └── markdown-editor.tsx
│   └── ui/                            # Shadcn components
├── lib/
│   ├── vertex-discovery.ts
│   ├── gcs.ts
│   ├── firebase.ts                    # Firebase client config
│   ├── firebase-admin.ts              # Firebase Admin SDK
│   ├── auth-helpers.ts                # Auth utilities
│   ├── query-cache.ts
│   └── utils.ts
├── types/
│   ├── grimoire.d.ts
│   └── agent-builder.d.ts
├── public/
│   ├── fonts/
│   └── images/
├── .env.local
├── .env.example
├── .cursorrules
├── .dockerignore
├── .gitignore
├── Dockerfile
├── middleware.ts
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── pnpm-lock.yaml
└── README.md
```

---

## 📊 Database Schema (Firestore)

### `users/{uid}`
```typescript
interface User {
  profile: {
    displayName: string;
    email: string;
    photoURL: string;
    createdAt: Timestamp;
  };
  quota: {
    uploadedMB: number;
    monthlySearchCount: number;
    lastResetAt: Timestamp;
  };
}
```

### `chats/{chatId}`
```typescript
interface Chat {
  userId: string;
  title: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Timestamp;
    citations?: Array<{
      title: string;
      uri: string;
      snippet: string;
    }>;
  }>;
  conversationId?: string;
  createdAt: Timestamp;
  lastUpdatedAt: Timestamp;
}
```

### `documents/{docId}`
```typescript
interface Document {
  userId: string;
  filename: string;
  gcsPath: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: Timestamp;
  indexedAt?: Timestamp;
  status: 'pending' | 'indexed' | 'failed';
  metadata?: {
    title?: string;
    authors?: string[];
    year?: number;
    source?: 'manual' | 'arxiv' | 'auto';
    arxivId?: string;
  };
}
```

### `query_cache/{queryHash}`
```typescript
interface QueryCache {
  userId: string;
  question: string;
  answer: string;
  citations: unknown[];
  timestamp: Timestamp;
  hitCount: number;
}
```

---

## 🔐 Security Requirements

### Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId;
    }
    match /chats/{chatId} {
      allow read, write: if request.auth != null
        && resource.data.userId == request.auth.uid;
    }
    match /documents/{docId} {
      allow read: if request.auth != null
        && (resource.data.userId == request.auth.uid || resource.data.userId == 'system');
      allow write: if request.auth != null
        && request.resource.data.userId == request.auth.uid;
    }
    match /query_cache/{queryHash} {
      allow read: if request.auth != null;
    }
  }
}
```

### Cloud Storage Rules

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/{allPaths=**} {
      allow read, write: if request.auth.uid == userId;
    }
    match /incoming/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if false;
    }
  }
}
```

### Secret Manager

```bash
gcloud secrets create VERTEX_AI_ENGINE_ID --data-file=-
gcloud secrets create GCS_BUCKET_NAME --data-file=-
gcloud secrets create FIREBASE_PRIVATE_KEY --data-file=-

gcloud secrets add-iam-policy-binding VERTEX_AI_ENGINE_ID \
  --member=serviceAccount:YOUR-SA@PROJECT.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor
```

---

## 🔐 Authentication Implementation Details

### 1. Middleware (Edge Runtime対応 - Cookie確認のみ)

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const session = request.cookies.get('session');

  const publicPaths = ['/', '/login', '/api/health'];
  const isPublicPath = publicPaths.some(path =>
    request.nextUrl.pathname.startsWith(path)
  );

  if (isPublicPath) return NextResponse.next();

  // Cookie の存在確認のみ (firebase-admin は使わない - Edge Runtime制約)
  if (!session?.value) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // セッショントークンを後段の API Route に渡す
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-session-token', session.value);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

**重要**: 実際のトークン検証は各 API Route で `verifyAndGetUser()` を使って行います。

### 2. Firebase Admin SDK (FieldValue export付き)

```typescript
// lib/firebase-admin.ts
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

export const auth = admin.auth();
export const firestore = admin.firestore();
export const storage = admin.storage();

// FieldValue を export（各ファイルで admin を import せずに使える）
export const FieldValue = admin.firestore.FieldValue;
export type Timestamp = admin.firestore.Timestamp;
```

### 3. Auth Helper (セッション検証)

```typescript
// lib/auth-helpers.ts
import { NextRequest } from 'next/server';
import { auth } from './firebase-admin';

/**
 * セッショントークンを検証してユーザー情報を返す
 * すべての認証が必要な API Route で使用する
 */
export async function verifyAndGetUser(
  request: NextRequest | Request
): Promise<{ uid: string; email: string }> {
  const sessionToken = request.headers.get('x-session-token');

  if (!sessionToken) {
    throw new Error('Unauthorized: No session token');
  }

  try {
    const decodedToken = await auth.verifySessionCookie(sessionToken, true);
    return {
      uid: decodedToken.uid,
      email: decodedToken.email || '',
    };
  } catch {
    throw new Error('Unauthorized: Invalid session');
  }
}
```

### 4. Session Cookie Creation

```typescript
// app/api/auth/session/route.ts
import { auth } from '@/lib/firebase-admin';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  const { idToken } = await req.json();

  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 days
    const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn });

    cookies().set('session', sessionCookie, {
      maxAge: expiresIn / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    return Response.json({ status: 'success', uid: decodedToken.uid });
  } catch {
    return Response.json({ error: 'Authentication failed' }, { status: 401 });
  }
}
```

### 5. Firebase Client Config

```typescript
// lib/firebase.ts
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
```

### 6. Login Page

```typescript
// app/(auth)/login/page.tsx
'use client';

import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();

      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      if (response.ok) {
        router.push('/grimoire');
      } else {
        setError('ログインに失敗しました');
      }
    } catch {
      setError('ログインエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
      <div className="bg-black/60 backdrop-blur-xl border border-purple-500/20 rounded-lg p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-white mb-2 text-center">🌙 Tsukineko Grimoire</h1>
        <p className="text-purple-300 text-center mb-8">知識を貪り、魔法を紡ぐ</p>

        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full py-3 rounded-lg bg-purple-700 hover:bg-purple-600 text-white font-semibold
            hover:shadow-[0_0_20px_rgba(167,139,250,0.6)] transition-all duration-300 disabled:opacity-50"
        >
          {loading ? '召喚中...' : 'Sign in with Google'}
        </button>

        {error && <p className="text-red-400 mt-4 text-center text-sm">{error}</p>}
      </div>
    </div>
  );
}
```

---

## 🌍 Environment Variables

### `.env.local`

```bash
# Firebase (Public - can be exposed to client)
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=tsukineko-grimoire.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=tsukineko-grimoire
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=tsukineko-grimoire.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc

# Google Cloud (Server-side only - NEVER expose to client)
GOOGLE_CLOUD_PROJECT_ID=tsukineko-grimoire
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json

# Firebase Admin SDK (Server-side only)
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@tsukineko-grimoire.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nXXX\n-----END PRIVATE KEY-----\n"

# ✅ Vertex AI Agent Builder (CRITICAL: global location, short IDs only)
VERTEX_AI_LOCATION=global
VERTEX_AI_ENGINE_ID=my-engine_1234567890
VERTEX_AI_DATA_STORE_ID=my-datastore_1234567890

# Cloud Storage
GCS_BUCKET_NAME=tsukineko-grimoire-archive

# Features
ENABLE_QUERY_CACHE=true
ENABLE_AUTO_COLLECTOR=true
MAX_UPLOAD_SIZE_MB=100
```

### `.env.example`

```bash
# Firebase Configuration (Public)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Google Cloud Configuration (Server-side only)
GOOGLE_CLOUD_PROJECT_ID=
GOOGLE_APPLICATION_CREDENTIALS=

# Firebase Admin SDK (Server-side only)
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# Vertex AI Agent Builder (CRITICAL: use 'global', short IDs only)
VERTEX_AI_LOCATION=global
VERTEX_AI_ENGINE_ID=
VERTEX_AI_DATA_STORE_ID=

# Cloud Storage
GCS_BUCKET_NAME=

# Features
ENABLE_QUERY_CACHE=true
ENABLE_AUTO_COLLECTOR=false
MAX_UPLOAD_SIZE_MB=100
```

---

## 🚀 Deployment Configuration

### 1. Next.js Configuration for Cloud Run

```javascript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // CRITICAL: Cloud Run requires standalone build
  experimental: {
    serverComponentsExternalPackages: [
      '@google-cloud/discoveryengine',
      '@google-cloud/storage',
      'firebase-admin',
    ],
  },
  images: {
    domains: ['storage.googleapis.com'],
  },
};

module.exports = nextConfig;
```

### 2. Dockerfile

```dockerfile
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 8080
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

### 3. .dockerignore

```
node_modules
.next
.git
.env*.local
README.md
.cursorrules
*.log
.vercel
Dockerfile
.dockerignore
```

### 4. Cloud Run Deployment

```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/tsukineko-grimoire

gcloud run deploy tsukineko-grimoire \
  --image gcr.io/PROJECT_ID/tsukineko-grimoire \
  --platform managed \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --port 8080 \
  --set-env-vars="NODE_ENV=production,VERTEX_AI_LOCATION=global" \
  --set-secrets="VERTEX_AI_ENGINE_ID=vertex-ai-engine-id:latest,GCS_BUCKET_NAME=gcs-bucket-name:latest,FIREBASE_PRIVATE_KEY=firebase-private-key:latest"
```

### 5. GitHub Actions CI/CD

```yaml
# .github/workflows/deploy.yml
name: Deploy to Cloud Run

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - id: auth
        uses: google-github-actions/auth@v1
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}
      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v1
      - name: Build and push
        run: gcloud builds submit --tag gcr.io/${{ secrets.GCP_PROJECT_ID }}/tsukineko-grimoire
      - name: Deploy to Cloud Run
        run: |
          gcloud run deploy tsukineko-grimoire \
            --image gcr.io/${{ secrets.GCP_PROJECT_ID }}/tsukineko-grimoire \
            --region asia-northeast1 \
            --platform managed
```

---

## 🤖 Vertex AI Agent Builder - Complete Setup Guide

### ⚠️ 重要: Location は必ず `global`

### Step 1: Enable Required APIs

```bash
gcloud services enable \
  discoveryengine.googleapis.com \
  storage.googleapis.com \
  firestore.googleapis.com
```

### Step 2: Create Data Store (Location: global)

1. Navigate to https://console.cloud.google.com/gen-app-builder/engines
2. Click "Create Data Store" → Select "Cloud Storage"
3. Configure:
   ```
   Name: tsukineko-grimoire-datastore
   Location: global  ← 必ず global を選択
   Content Type: Unstructured documents
   ```
4. Set GCS path: `gs://tsukineko-grimoire-archive/**/*.pdf`
5. Advanced Settings:
   ```
   Parsing: Advanced (with chunking)
   Chunk size: 500 tokens
   Chunk overlap: 100 tokens
   Include metadata: Yes
   Auto-sync frequency: Every 24 hours
   ```
6. **Copy Data Store ID (短いIDのみ)**: 例 `my-datastore_1234567890`

### Step 3: Create Search App (Location: global)

1. Navigate to "Apps" → Click "Create App" → Select "Search"
2. Configure:
   ```
   Name: tsukineko-grimoire-search
   Location: global  ← Data Store と同じ location
   ```
3. Link to Data Store from Step 2
4. Advanced configurations:
   ```
   Search tier: Enterprise (CRITICAL for citations)
   Result diversification: Enabled
   Spell correction: Enabled
   ```
5. **Copy Engine ID (短いIDのみ)**: 例 `my-engine_1234567890`

### Step 4: Enable Conversational Search

1. Open the created app → "Configurations" tab
2. Enable "Conversational Search"
3. Configure:
   ```
   Include citations: Yes (CRITICAL)
   Number of results to summarize: 5
   Follow-up questions: Enabled
   ```

### Step 5: Test the Search

```bash
ACCESS_TOKEN=$(gcloud auth print-access-token)

curl -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  "https://discoveryengine.googleapis.com/v1/projects/PROJECT_ID/locations/global/collections/default_collection/engines/ENGINE_ID/servingConfigs/default_config:search" \
  -d '{"query": "test", "pageSize": 5}'
```

### Step 6: Get IDs for .env.local

```bash
# ✅ .env.local には短いIDのみを記載
# ❌ NG: VERTEX_AI_ENGINE_ID=projects/123/locations/global/.../engines/my-engine_123
# ✅ OK: VERTEX_AI_ENGINE_ID=my-engine_1234567890

VERTEX_AI_LOCATION=global
VERTEX_AI_ENGINE_ID=my-engine_1234567890
VERTEX_AI_DATA_STORE_ID=my-datastore_1234567890
```

### Sync Timing

```
GCS Upload → Indexing完了:
├─ Auto-sync (daily): 24-48 hours
├─ Manual import: 10-30 minutes
└─ Real-time (Enterprise): 5-10 minutes

推奨:
- Development: Manual import で速く反映
- Production: Auto-sync で自動運用
```

### Manual Import

```bash
gcloud alpha discovery-engine documents import \
  --data-store=tsukineko-datastore \
  --location=global \
  --gcs-uri=gs://tsukineko-grimoire-archive/**/*.pdf
```

---

## 📝 Implementation Priority

### Phase 1: Foundation (Week 1-2)

**Day 1-2:**
- Next.js project initialization (Next.js 14)
- Install all dependencies
- Setup Tailwind CSS with magic theme
- Create `.cursorrules`

**Day 3-4:**
- Firebase Authentication setup
- Google Sign-in implementation
- `middleware.ts` (Edge Runtime対応版)
- Basic layout with magical theme

**Day 5-7:**
- Cloud Storage integration
- File uploader component (drag & drop)
- Firestore document metadata saving
- Glassmorphism UI polish

### Phase 2: Core Features (Week 3-4)

**Week 3:**
- Vertex AI Agent Builder setup (console)
- Implement `/api/chat` route
- Chat interface component
- Message bubble with citations

**Week 4:**
- Citation preview modal
- Firestore chat history
- Conversation persistence
- Error handling (magical messages)

### Phase 3: Advanced Features (Week 5-6)

**Week 5:**
- Article generation (`/api/cast-article`)
- Markdown editor + live preview
- Split-view layout

**Week 6:**
- arXiv collector (`/api/collector`)
- Cloud Scheduler setup (OIDC)
- Rate limiting + retry logic

### Phase 4: Polish & Optimization (Week 7-8)

**Week 7:**
- Query caching
- Performance optimization
- Mobile responsiveness

**Week 8:**
- Unit + E2E testing
- Deployment to Cloud Run
- Documentation

---

## ⚠️ Development Rules

1. **Coupon Constraint**: Every AI feature MUST use `@google-cloud/discoveryengine`
2. **Type Safety**: TypeScript strict mode, no `any` types
3. **Error Handling**: All async wrapped in try-catch, magical error messages
4. **Security**: Never expose server-side env vars, session verified in API routes
5. **Location**: Agent Builder は必ず `global` location、short IDのみ使用

---

## 💸 Cost Optimization

### Query Caching with User Isolation

```typescript
// lib/query-cache.ts
import crypto from 'crypto';
import { firestore, FieldValue } from './firebase-admin';

export async function getCachedAnswer(question: string, userId: string) {
  const hash = crypto
    .createHash('md5')
    .update(`${userId}:${question}`)
    .digest('hex');

  const doc = await firestore.collection('query_cache').doc(hash).get();

  if (doc.exists) {
    const data = doc.data()!;
    const age = Date.now() - data.timestamp.toMillis();

    if (age < 24 * 60 * 60 * 1000) {
      await firestore.collection('query_cache').doc(hash).update({
        hitCount: FieldValue.increment(1),
      });
      return data.answer;
    }
  }

  return null;
}

export async function cacheAnswer(question: string, userId: string, answer: unknown) {
  const hash = crypto
    .createHash('md5')
    .update(`${userId}:${question}`)
    .digest('hex');

  await firestore.collection('query_cache').doc(hash).set({
    userId,
    question,
    answer,
    timestamp: FieldValue.serverTimestamp(),
    hitCount: 0,
  });
}
```

### GCS Lifecycle Policy (`lifecycle.json`)

```json
{
  "lifecycle": {
    "rule": [
      {
        "action": { "type": "SetStorageClass", "storageClass": "NEARLINE" },
        "condition": { "daysSinceNoncurrentTime": 90, "matchesPrefix": ["users/"] }
      },
      {
        "action": { "type": "Delete" },
        "condition": { "daysSinceNoncurrentTime": 365, "matchesPrefix": ["incoming/"] }
      }
    ]
  }
}
```

---

## 🧪 Testing Strategy

### Unit Tests (Vitest)

```typescript
// __tests__/lib/vertex-discovery.test.ts
import { describe, it, expect } from 'vitest';
import { queryGrimoire } from '@/lib/vertex-discovery';

describe('Vertex Discovery', () => {
  it('should return answer with citations', async () => {
    const result = await queryGrimoire('What is RAG?', 'test-user-id');
    expect(result.answer).toBeDefined();
    expect(result.citations).toBeInstanceOf(Array);
  });

  it('should handle errors gracefully', async () => {
    await expect(
      queryGrimoire('', 'test-user-id')
    ).rejects.toThrow('呪文の詠唱に失敗しました');
  });
});
```

### E2E Tests (Playwright)

```typescript
// e2e/chat.spec.ts
import { test, expect } from '@playwright/test';

test('complete chat flow', async ({ page }) => {
  await page.goto('/login');
  await page.click('button:has-text("Sign in with Google")');
  await page.goto('/grimoire');

  const input = page.locator('textarea[placeholder*="question"]');
  await input.fill('What is Transformer?');
  await page.click('button[type="submit"]');

  await page.waitForSelector('[data-testid="assistant-message"]', { timeout: 10000 });

  const citations = page.locator('[data-testid="citation"]');
  await citations.first().click();
  await expect(page.locator('[data-testid="citation-modal"]')).toBeVisible();
});
```

---

## 📚 Initial Setup Commands

### 1. Create Project

```bash
pnpm create next-app@14 tsukineko-grimoire \
  --typescript \
  --tailwind \
  --app \
  --src-dir false \
  --import-alias "@/*"

cd tsukineko-grimoire
```

### 2. Install Dependencies

```bash
pnpm add @google-cloud/discoveryengine \
  @google-cloud/storage \
  firebase \
  firebase-admin \
  framer-motion \
  lucide-react \
  sonner \
  react-markdown \
  remark-gfm \
  axios \
  fast-xml-parser

pnpm dlx shadcn-ui@latest init
pnpm dlx shadcn-ui@latest add button input textarea card dialog toast dropdown-menu

pnpm add -D @types/node vitest @playwright/test @testing-library/react @testing-library/jest-dom
```

### 3. Google Cloud Setup

```bash
gcloud projects create tsukineko-grimoire --name="Tsukineko Grimoire"
gcloud config set project tsukineko-grimoire

gcloud services enable \
  discoveryengine.googleapis.com \
  storage.googleapis.com \
  firestore.googleapis.com \
  run.googleapis.com \
  cloudscheduler.googleapis.com \
  secretmanager.googleapis.com

gsutil mb -l asia-northeast1 gs://tsukineko-grimoire-archive
gsutil lifecycle set lifecycle.json gs://tsukineko-grimoire-archive

gcloud firestore databases create --location=asia-northeast1
```

### 4. Firebase Setup

```bash
npm install -g firebase-tools
firebase login
firebase init  # Select: Firestore, Storage
```

### 5. Cloud Scheduler Setup (OIDC)

```bash
gcloud iam service-accounts create cloud-scheduler-sa \
  --display-name="Cloud Scheduler Service Account"

gcloud run services add-iam-policy-binding tsukineko-grimoire \
  --member="serviceAccount:cloud-scheduler-sa@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.invoker" \
  --region=asia-northeast1

gcloud scheduler jobs create http arxiv-collector \
  --location=asia-northeast1 \
  --schedule="0 2 * * *" \
  --uri="https://tsukineko-grimoire-XXX.run.app/api/collector" \
  --http-method=GET \
  --oidc-service-account-email=cloud-scheduler-sa@PROJECT_ID.iam.gserviceaccount.com \
  --time-zone="Asia/Tokyo"
```

---

## 🔧 GCS Sync Lag UX

```typescript
// components/features/file-uploader.tsx (Firestore listener)
'use client';

import { useEffect } from 'react';
import { getFirestore, collection, query, where, onSnapshot } from 'firebase/firestore';
import { toast } from 'sonner';

export function useIndexingStatus(userId: string) {
  useEffect(() => {
    const db = getFirestore();
    const q = query(
      collection(db, 'documents'),
      where('userId', '==', userId),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(q, snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'modified') {
          const doc = change.doc.data();
          if (doc.status === 'indexed') {
            toast.success(`📚 "${doc.filename}" が検索可能になりました`, {
              description: '魔導書に知識が刻まれました',
            });
          }
        }
      });
    });

    return () => unsubscribe();
  }, [userId]);
}
```

---

## 📖 References

- [Vertex AI Agent Builder Docs](https://cloud.google.com/generative-ai-app-builder/docs)
- [Discovery Engine API Reference](https://cloud.google.com/discovery-engine/docs/reference)
- [Next.js 14 Documentation](https://nextjs.org/docs)
- [Shadcn UI Components](https://ui.shadcn.com/)
- [Framer Motion](https://www.framer.com/motion/)
- [arXiv API Documentation](https://arxiv.org/help/api)
- [Firebase Documentation](https://firebase.google.com/docs)
- [Cloud Run Documentation](https://cloud.google.com/run/docs)

---

## 🎯 Success Criteria

**Project is complete when:**

1. ✅ All 4 features working (Ingest, Search, Cast, Summon)
2. ✅ Agent Builder coupon usage confirmed
3. ✅ No `@google-cloud/vertexai` violations
4. ✅ UI matches Magic × Cyberpunk theme
5. ✅ Deployed to Cloud Run
6. ✅ Tests passing
7. ✅ Firebase Auth + session cookies working
8. ✅ arXiv auto-collection running daily
9. ✅ Query caching reducing API costs

**Coupon consumption target**: ¥140,000 - ¥148,035 by 2026年9月

---

*May your code be elegant and your bugs be few! 🌙✨*
