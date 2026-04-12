import { afterEach, describe, expect, it, vi } from 'vitest';
import { chromeMock } from '../setup/chrome-mock';
import { hasZhihuHostPermission, requestZhihuHostPermission, ZHIHU_ORIGINS } from '@/shared/host-permissions';

describe('host-permissions', () => {
  afterEach(() => {
    chromeMock.permissions._setGranted(true);
    chromeMock.permissions.contains.mockClear();
    chromeMock.permissions.request.mockClear();
  });

  describe('hasZhihuHostPermission', () => {
    it('queries chrome.permissions.contains with the zhihu origin', async () => {
      const result = await hasZhihuHostPermission();

      expect(result).toBe(true);
      expect(chromeMock.permissions.contains).toHaveBeenCalledTimes(1);
      expect(chromeMock.permissions.contains).toHaveBeenCalledWith({
        origins: [...ZHIHU_ORIGINS],
      });
    });

    it('returns false when the permission is not granted', async () => {
      chromeMock.permissions._setGranted(false);

      const result = await hasZhihuHostPermission();

      expect(result).toBe(false);
    });

    it('falls back to true when chrome.permissions throws', async () => {
      chromeMock.permissions.contains.mockRejectedValueOnce(new Error('no api'));

      const result = await hasZhihuHostPermission();

      expect(result).toBe(true);
    });
  });

  describe('requestZhihuHostPermission', () => {
    it('short-circuits without calling request when already granted', async () => {
      const result = await requestZhihuHostPermission();

      expect(result).toBe(true);
      expect(chromeMock.permissions.contains).toHaveBeenCalledTimes(1);
      expect(chromeMock.permissions.request).not.toHaveBeenCalled();
    });

    it('calls request when the permission is missing and returns its result', async () => {
      chromeMock.permissions._setGranted(false);
      chromeMock.permissions.request.mockResolvedValueOnce(true);

      const result = await requestZhihuHostPermission();

      expect(result).toBe(true);
      expect(chromeMock.permissions.request).toHaveBeenCalledWith({
        origins: [...ZHIHU_ORIGINS],
      });
    });

    it('returns false when the user declines the prompt', async () => {
      chromeMock.permissions._setGranted(false);
      chromeMock.permissions.request.mockResolvedValueOnce(false);

      const result = await requestZhihuHostPermission();

      expect(result).toBe(false);
    });

    it('returns false when request throws', async () => {
      chromeMock.permissions._setGranted(false);
      chromeMock.permissions.request.mockRejectedValueOnce(new Error('denied'));

      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await requestZhihuHostPermission();

      expect(result).toBe(false);
      spy.mockRestore();
    });
  });
});
