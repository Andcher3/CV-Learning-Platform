const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const ACCESS_TOKEN_KEY = 'token';
const REFRESH_TOKEN_KEY = 'refreshToken';
const USER_KEY = 'user';
const AUTH_EXPIRED_MARKER = '__AUTH_EXPIRED__';

let refreshInFlight: Promise<string | null> | null = null;

export const getAuthExpiredMarker = () => AUTH_EXPIRED_MARKER;

export const getAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY) || '';
export const getRefreshToken = () => localStorage.getItem(REFRESH_TOKEN_KEY) || '';

export const saveAuthSession = (payload: any) => {
  const token = String(payload?.token || '').trim();
  const refreshToken = String(payload?.refreshToken || '').trim();
  const user = payload?.user;
  if (!token || !refreshToken || !user) {
    throw new Error('登录会话数据不完整');
  }
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const clearAuthSession = () => {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

const readJsonSafely = async (res: Response) => {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return await res.json();
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    return { error: text || '服务器响应格式异常' };
  }
};

export const refreshAuthSession = async () => {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      clearAuthSession();
      return null;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });
      const data = await readJsonSafely(res);
      if (!res.ok) {
        clearAuthSession();
        return null;
      }
      saveAuthSession(data);
      return getAccessToken();
    } catch (err) {
      clearAuthSession();
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
};

const buildHeadersWithToken = (token: string, init?: RequestInit) => {
  const currentHeaders = new Headers(init?.headers || {});
  currentHeaders.set('Authorization', `Bearer ${token}`);
  return currentHeaders;
};

export const fetchWithAutoRefresh = async (url: string, init?: RequestInit) => {
  let token = getAccessToken();
  if (!token) {
    throw new Error(AUTH_EXPIRED_MARKER);
  }

  let res = await fetch(url, {
    ...(init || {}),
    headers: buildHeadersWithToken(token, init),
  });

  if (res.status !== 401) {
    return res;
  }

  const nextToken = await refreshAuthSession();
  if (!nextToken) {
    throw new Error(AUTH_EXPIRED_MARKER);
  }

  token = nextToken;
  res = await fetch(url, {
    ...(init || {}),
    headers: buildHeadersWithToken(token, init),
  });

  if (res.status === 401) {
    clearAuthSession();
    throw new Error(AUTH_EXPIRED_MARKER);
  }

  return res;
};

export const fetchJsonWithAutoRefresh = async (url: string, init?: RequestInit) => {
  const res = await fetchWithAutoRefresh(url, init);
  const data = await readJsonSafely(res);
  if (!res.ok) {
    throw new Error(data?.error || '请求失败');
  }
  return data;
};
