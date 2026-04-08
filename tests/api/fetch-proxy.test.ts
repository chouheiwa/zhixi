import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, fetchWithRetry } from '@/api/fetch-proxy';

const TEST_URL = 'https://example.com/api';

const fetchMock = vi.fn<typeof fetch>();

function makeResponse(status: number, body: unknown) {
  const json = vi.fn().mockResolvedValue(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json,
  } as unknown as Response;
}

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('returns data immediately on success', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(200, { ok: true }));

    await expect(fetchWithRetry(TEST_URL, 2, 0)).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries 5xx errors and succeeds later', async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse(500, { error: 'server error' }))
      .mockResolvedValueOnce(makeResponse(502, { error: 'bad gateway' }))
      .mockResolvedValueOnce(makeResponse(200, { ok: true }));

    await expect(fetchWithRetry(TEST_URL, 2, 0)).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws immediately on 4xx errors without retrying', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(404, { error: 'not found' }));

    await expect(fetchWithRetry(TEST_URL, 3, 0)).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      attempts: 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries on network errors', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(makeResponse(200, { ok: true }));

    await expect(fetchWithRetry(TEST_URL, 2, 0)).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws ApiError with attempts after retries are exhausted', async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse(503, { error: 'unavailable' }))
      .mockResolvedValueOnce(makeResponse(503, { error: 'unavailable' }))
      .mockResolvedValueOnce(makeResponse(503, { error: 'unavailable' }));

    const error = await fetchWithRetry(TEST_URL, 2, 0).catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 503,
      attempts: 3,
    });
  });

  it('retries timeout-like abort errors', async () => {
    fetchMock
      .mockRejectedValueOnce(new DOMException('The operation was aborted.', 'AbortError'))
      .mockResolvedValueOnce(makeResponse(200, { ok: true }));

    await expect(fetchWithRetry(TEST_URL, 1, 0)).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
