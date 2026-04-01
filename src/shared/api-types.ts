/** Zhihu income list API item */
export interface ZhihuIncomeApiItem {
  content_id: string;
  content_token: string;
  content_title: string;
  content_publish_at: number;
  content_publish_date: string;
  current_read: number;
  current_interaction: number;
  current_income: number;
  total_read: number;
  total_interaction: number;
  total_income: number;
  content_type: string;
}

/** Zhihu income list API response */
export interface ZhihuIncomeApiResponse {
  total: number;
  data: ZhihuIncomeApiItem[];
}

/** Zhihu content daily detail API item */
export interface ZhihuContentDailyApiItem {
  p_date: string;
  pv: number;
  show: number;
  upvote: number;
  comment: number;
  like: number;
  collect: number;
  share: number;
  play: number;
}

/** Zhihu content daily detail API response */
export type ZhihuContentDailyApiResponse = ZhihuContentDailyApiItem[];

/** Zhihu realtime aggregate metric block */
export interface ZhihuRealtimeAggrItem {
  updated: string | null;
  pv: number;
  play: number;
  show: number;
  upvote: number;
  comment: number;
  like: number;
  collect: number;
  share: number;
  reaction: number;
  re_pin: number;
  like_and_reaction: number;
  new_upvote: number;
  new_like: number;
  new_incr_upvote_num: number;
  new_desc_upvote_num: number;
  new_incr_like_num: number;
  new_desc_like_num: number;
}

/** Zhihu realtime aggregate API response */
export interface ZhihuRealtimeAggrResponse extends ZhihuRealtimeAggrItem {
  today: ZhihuRealtimeAggrItem;
  yesterday: ZhihuRealtimeAggrItem;
  updated: string;
}

/** Zhihu creation item core data */
export interface ZhihuCreationData {
  id: string;
  url_token: string;
  title: string;
  sub_type: string;
  created_time: number;
  updated_time: number;
}

/** Zhihu creation item reaction data */
export interface ZhihuCreationReaction {
  read_count: number;
  vote_up_count: number;
  comment_count: number;
  like_count: number;
  collect_count: number;
  play_count: number;
}

/** Zhihu creation list API item */
export interface ZhihuCreationApiItem {
  type: string;
  data: ZhihuCreationData;
  reaction: ZhihuCreationReaction;
}

/** Zhihu creation list API response */
export interface ZhihuCreationsApiResponse {
  paging: {
    is_end: boolean;
    totals: number;
  };
  data: ZhihuCreationApiItem[];
}
