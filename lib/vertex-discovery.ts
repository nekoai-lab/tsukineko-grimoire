import {
  ConversationalSearchServiceClient,
  SearchServiceClient,
} from '@google-cloud/discoveryengine';

function getDiscoveryEngineEndpoint(): string {
  const location = process.env.VERTEX_AI_LOCATION ?? 'global';
  return location === 'global'
    ? 'discoveryengine.googleapis.com'
    : `${location}-discoveryengine.googleapis.com`;
}

// ── シングルトンクライアント ───────────────────────────────────
let _conversationalClient: ConversationalSearchServiceClient | null = null;
let _searchClient: SearchServiceClient | null = null;

export function getConversationalClient(): ConversationalSearchServiceClient {
  if (!_conversationalClient) {
    _conversationalClient = new ConversationalSearchServiceClient({
      apiEndpoint: getDiscoveryEngineEndpoint(),
    });
  }
  return _conversationalClient;
}

/**
 * SearchServiceClient のシングルトンを返す。
 * リクエストごとのインスタンス生成を避けてレイテンシを削減する。
 */
export function getSearchClient(): SearchServiceClient {
  if (!_searchClient) {
    _searchClient = new SearchServiceClient({
      apiEndpoint: getDiscoveryEngineEndpoint(),
    });
  }
  return _searchClient;
}

/**
 * serving config のフルパスを構築する。
 */
export function buildServingConfigPath(): string {
  const location = process.env.VERTEX_AI_LOCATION ?? 'global';
  return `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/locations/${location}/collections/default_collection/engines/${process.env.VERTEX_AI_ENGINE_ID}/servingConfigs/default_config`;
}

/** @deprecated ConversationalClient 用。buildServingConfigPath() を使うこと。 */
export function buildServingConfigPathLegacy(client: ConversationalSearchServiceClient): string {
  return client.projectLocationCollectionEngineServingConfigPath(
    process.env.GOOGLE_CLOUD_PROJECT_ID!,
    process.env.VERTEX_AI_LOCATION ?? 'global',
    'default_collection',
    process.env.VERTEX_AI_ENGINE_ID!,
    'default_config'
  );
}
