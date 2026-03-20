import type { Timestamp } from 'firebase-admin/firestore';

export interface GrimoireUser {
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

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Timestamp;
  citations?: Citation[];
}

export interface Citation {
  title: string;
  uri: string;
  snippet?: string;
}

export interface GrimoireChat {
  userId: string;
  title: string;
  messages: ChatMessage[];
  conversationId?: string;
  createdAt: Timestamp;
  lastUpdatedAt: Timestamp;
}

export interface GrimoireDocument {
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

export interface QueryCache {
  userId: string;
  question: string;
  answer: unknown;
  citations: Citation[];
  timestamp: Timestamp;
  hitCount: number;
}

export interface ChatResponse {
  answer: string;
  citations: Citation[];
  conversationId?: string;
}
