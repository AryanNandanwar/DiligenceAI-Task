function resolveBackendUrl(): string {
  const raw = process.env.BACKEND_URL ?? 'http://localhost:3000';
  // Render blueprint `fromService.property: host` returns a hostname without scheme.
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/$/, '');
  return `https://${raw.replace(/\/$/, '')}`;
}

const BASE_URL = resolveBackendUrl();

export class ApiError extends Error {}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const message =
      typeof body === 'object' && body !== null && 'message' in body
        ? String((body as { message: unknown }).message)
        : `HTTP ${res.status}`;
    throw new ApiError(message);
  }
  return body;
}

export function get(path: string, params?: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const query = qs.toString();
  return request(`${path}${query ? `?${query}` : ''}`);
}

export function post(path: string, body: Record<string, unknown>) {
  return request(path, { method: 'POST', body: JSON.stringify(body) });
}
