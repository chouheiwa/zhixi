/**
 * Direct fetch to Zhihu API with cookie authentication.
 * Service Worker can fetch cross-origin with credentials via host_permissions.
 */
export class ApiError extends Error {
  status: number;
  attempts: number;
  cause?: unknown;

  constructor(status: number, message?: string, attempts: number = 1, cause?: unknown) {
    super(message ?? `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.attempts = attempts;
    this.cause = cause;
  }
}

export async function proxyFetch<T = unknown>(url: string): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new ApiError(response.status);
  }

  return response.json() as Promise<T>;
}

export async function fetchWithRetry<T = unknown>(
  url: string,
  retries: number = 2,
  retryDelayMs: number = 1000,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await proxyFetch<T>(url);
    } catch (error) {
      lastError = error;
      const attempts = attempt + 1;

      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        throw new ApiError(error.status, error.message, attempts, error);
      }

      if (attempt === retries) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  if (lastError instanceof ApiError) {
    throw new ApiError(lastError.status, lastError.message, retries + 1, lastError);
  }

  const message = lastError instanceof Error ? lastError.message : 'Request failed';
  throw new ApiError(0, message, retries + 1, lastError);
}
