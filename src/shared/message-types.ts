import type { CreationItem } from '@/api/zhihu-creations';
import type { CreationRecord } from '@/db/database';
import type { CollectionStatus, RealtimeAggrRecord } from '@/shared/types';

export type ContentCollectionItem = Pick<
  CreationItem,
  'contentId' | 'contentToken' | 'contentType' | 'title' | 'publishDate'
>;

export type CollectStatusSnapshot = CollectionStatus & { logs: string[] };

export type TodayRealtimeSnapshot = Omit<RealtimeAggrRecord, 'userId' | 'collectedAt'>;

export interface FetchProxyRequest {
  action: 'fetchProxy';
  url: string;
}

export interface OpenDashboardRequest {
  action: 'openDashboard';
  /**
   * When true, the dashboard URL gets `?action=setup` appended so the setup
   * modal opens automatically on mount. Used by the popup's onboarding CTA.
   */
  withSetup?: boolean;
}

export interface SyncIncomeRequest {
  action: 'syncIncome';
  startDate?: string;
}

export interface FetchContentDailyRequest {
  action: 'fetchContentDaily';
  items: ContentCollectionItem[];
}

export interface FetchAllCreationsRequest {
  action: 'fetchAllCreations';
}

export interface LoadCreationsCacheRequest {
  action: 'loadCreationsCache';
}

export interface RefreshCreationsRequest {
  action: 'refreshCreations';
  mode: 'incremental' | 'force';
}

export interface FetchTodayContentDailyRequest {
  action: 'fetchTodayContentDaily';
}

export interface SyncRealtimeAggrRequest {
  action: 'syncRealtimeAggr';
}

export interface FetchTodayRealtimeRequest {
  action: 'fetchTodayRealtime';
}

export interface GetCollectStatusRequest {
  action: 'getCollectStatus';
}

export type Request =
  | FetchProxyRequest
  | OpenDashboardRequest
  | SyncIncomeRequest
  | FetchContentDailyRequest
  | FetchAllCreationsRequest
  | LoadCreationsCacheRequest
  | RefreshCreationsRequest
  | FetchTodayContentDailyRequest
  | SyncRealtimeAggrRequest
  | FetchTodayRealtimeRequest
  | GetCollectStatusRequest;

export type ErrorResponse = {
  ok: false;
  error: string;
};

export type FetchProxyResponse =
  | {
      data: unknown;
    }
  | {
      error: string;
    };

export type OpenDashboardResponse = void;

export type SyncIncomeResponse =
  | {
      ok: true;
      count: number;
      synced: number;
      total: number;
    }
  | ErrorResponse;

export type FetchContentDailyResponse =
  | {
      ok: true;
      count: number;
    }
  | ErrorResponse;

export type FetchAllCreationsResponse =
  | {
      ok: true;
      items: CreationItem[];
    }
  | ErrorResponse;

export type LoadCreationsCacheResponse =
  | {
      ok: true;
      items: CreationRecord[];
      lastSyncedAt: number | null;
    }
  | ErrorResponse;

export type RefreshCreationsResponse =
  | {
      ok: true;
      items: CreationRecord[];
      lastSyncedAt: number;
      addedCount: number;
      deletedCount: number;
    }
  | ErrorResponse;

export type FetchTodayContentDailyResponse =
  | {
      ok: true;
      count: number;
      cached: number;
    }
  | ErrorResponse;

export type SyncRealtimeAggrResponse =
  | {
      ok: true;
      count: number;
    }
  | ErrorResponse;

export type FetchTodayRealtimeResponse =
  | {
      ok: true;
      today: TodayRealtimeSnapshot | null;
    }
  | ErrorResponse;

export type GetCollectStatusResponse = CollectStatusSnapshot;

export interface CollectStatusMessage {
  action: 'collectStatus';
  status: CollectStatusSnapshot;
}

export type BroadcastMessage = CollectStatusMessage;

export interface MessageMap {
  fetchProxy: {
    request: FetchProxyRequest;
    response: FetchProxyResponse;
  };
  openDashboard: {
    request: OpenDashboardRequest;
    response: OpenDashboardResponse;
  };
  syncIncome: {
    request: SyncIncomeRequest;
    response: SyncIncomeResponse;
  };
  fetchContentDaily: {
    request: FetchContentDailyRequest;
    response: FetchContentDailyResponse;
  };
  fetchAllCreations: {
    request: FetchAllCreationsRequest;
    response: FetchAllCreationsResponse;
  };
  loadCreationsCache: {
    request: LoadCreationsCacheRequest;
    response: LoadCreationsCacheResponse;
  };
  refreshCreations: {
    request: RefreshCreationsRequest;
    response: RefreshCreationsResponse;
  };
  fetchTodayContentDaily: {
    request: FetchTodayContentDailyRequest;
    response: FetchTodayContentDailyResponse;
  };
  syncRealtimeAggr: {
    request: SyncRealtimeAggrRequest;
    response: SyncRealtimeAggrResponse;
  };
  fetchTodayRealtime: {
    request: FetchTodayRealtimeRequest;
    response: FetchTodayRealtimeResponse;
  };
  getCollectStatus: {
    request: GetCollectStatusRequest;
    response: GetCollectStatusResponse;
  };
}

export type MessageAction = keyof MessageMap;

export type RequestOf<TAction extends MessageAction> = MessageMap[TAction]['request'];

export type ResponseOf<TAction extends MessageAction> = MessageMap[TAction]['response'];

export type RuntimeMessage = Request | BroadcastMessage;
