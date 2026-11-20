const BASE = import.meta.env.VITE_API_URL || '/api';
export const getToken = () => localStorage.getItem('token');

async function request(path, { method = 'GET', body, form, raw } = {}) {
  const headers = {};
  const t = getToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let res;
  try { res = await fetch(BASE + path, { method, headers, body: payload }); }
  catch { throw Object.assign(new Error('Cannot reach the server. Check your internet connection.'), { status: 0 }); }
  if (res.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/register')) {
    localStorage.removeItem('token');
    window.dispatchEvent(new Event('auth:expired'));
  }
  if (raw) {
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw Object.assign(new Error(d.message || 'Request failed'), { status: res.status }); }
    return res;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || 'Request failed'), { status: res.status, data });
  return data;
}

export const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method: 'POST', body }),
  put: (p, body) => request(p, { method: 'PUT', body }),
  del: (p) => request(p, { method: 'DELETE' }),
  form: (method, p, form) => request(p, { method, form }),
  blob: async (p) => { const res = await request(p, { raw: true }); return res.blob(); },
};

export async function downloadFile(path, fallbackName) {
  const res = await request(path, { raw: true });
  const cd = res.headers.get('Content-Disposition') || '';
  const name = (cd.match(/filename="?([^"]+)"?/) || [])[1] || fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
