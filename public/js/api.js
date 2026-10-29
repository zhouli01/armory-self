const TOKEN_KEY = 'depot.token';
const USER_KEY = 'depot.user';

export const session = {
  get token() {
    return localStorage.getItem(TOKEN_KEY) || '';
  },
  set token(v) {
    if (v) localStorage.setItem(TOKEN_KEY, v);
    else localStorage.removeItem(TOKEN_KEY);
  },
  get user() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch {
      return null;
    }
  },
  set user(u) {
    if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
    else localStorage.removeItem(USER_KEY);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(method, path, { body, form } = {}) {
  const headers = {};
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(path, { method, headers, body: payload });
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok || (data && data.status === 'error')) {
    if (res.status === 401 && !path.includes('/auth/login')) {
      session.clear();
      window.dispatchEvent(new CustomEvent('depot:unauthorized'));
    }
    throw new ApiError(res.status, data && data.code, (data && data.message) || `请求失败（${res.status}）`);
  }
  return data || {};
}

export const api = {
  ApiError,
  get: (path, params) => {
    const qs = params
      ? `?${new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null))}`
      : '';
    return request('GET', `${path}${qs}`);
  },
  post: (path, body) => request('POST', path, { body: body || {} }),
  put: (path, body) => request('PUT', path, { body: body || {} }),
  del: (path) => request('DELETE', path),

  async login(username, password) {
    const res = await request('POST', '/api/auth/login', { body: { username, password } });
    session.token = res.token;
    session.user = res.user;
    return res.user;
  },
  async logout() {
    try {
      await request('POST', '/api/auth/logout', { body: {} });
    } catch {
      /* 忽略登出失败 */
    }
    session.clear();
  },
  me: () => request('GET', '/api/auth/me'),

  uploadVersion(namespace, name, formData) {
    return request('POST', `/api/packages/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/versions`, { form: formData });
  },

  downloadUrl(namespace, name, version, platform, arch) {
    const qs = new URLSearchParams();
    if (platform) qs.set('platform', platform);
    if (arch) qs.set('arch', arch);
    if (session.token) qs.set('token', session.token);
    return `/api/packages/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/v/${encodeURIComponent(version)}/download?${qs}`;
  },

  async download(namespace, name, version, platform, arch) {
    const url = this.downloadUrl(namespace, name, version, platform, arch);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${session.token}` } });
    if (!res.ok) {
      let msg = '下载失败';
      try {
        msg = (await res.json()).message || msg;
      } catch { /* 忽略 */ }
      throw new ApiError(res.status, 'DOWNLOAD_FAILED', msg);
    }
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
    const filename = m ? decodeURIComponent(m[1]) : `${name}-${version}.bin`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },
};
