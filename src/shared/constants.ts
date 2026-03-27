export const ZHIHU_INCOME_API =
  'https://www.zhihu.com/api/v4/creators/text/income/income/range';
export const DEFAULT_PAGE_SIZE = 20;
/** Request interval range in ms: random between min and max */
export const REQUEST_INTERVAL_MIN = 1000;
export const REQUEST_INTERVAL_MAX = 3000;
export const STORAGE_KEYS = {
  LAST_COLLECT_DATE: 'lastCollectDate',
} as const;
