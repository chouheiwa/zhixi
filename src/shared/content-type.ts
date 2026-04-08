/** Content type utilities for Zhihu content (article, answer, pin). */

export type ContentType = 'article' | 'answer' | 'pin';

interface ContentTypeMeta {
  label: string;
  shortLabel: string;
  color: string;
}

const CONTENT_TYPE_MAP: Record<ContentType, ContentTypeMeta> = {
  article: { label: '文章', shortLabel: '文', color: 'blue' },
  answer: { label: '回答', shortLabel: '答', color: 'gold' },
  pin: { label: '想法', shortLabel: '想', color: 'green' },
};

const FALLBACK: ContentTypeMeta = { label: '未知', shortLabel: '?', color: 'default' };

function getMeta(type: string): ContentTypeMeta {
  return CONTENT_TYPE_MAP[type as ContentType] ?? FALLBACK;
}

export function contentTypeLabel(type: string): string {
  return getMeta(type).label;
}

export function contentTypeShortLabel(type: string): string {
  return getMeta(type).shortLabel;
}

export function contentTypeColor(type: string): string {
  return getMeta(type).color;
}

/** Chart bar color by content type */
export function contentTypeChartColor(type: string): string {
  switch (type) {
    case 'article':
      return '#5b7a9d'; // warmBlue
    case 'answer':
      return '#d4a96a'; // amberLight
    case 'pin':
      return '#6b8f71'; // sage
    default:
      return '#b0a89e'; // subtle
  }
}

/** All content types for filter dropdowns */
export const CONTENT_TYPE_FILTERS = [
  { text: '文章', value: 'article' },
  { text: '回答', value: 'answer' },
  { text: '想法', value: 'pin' },
];
