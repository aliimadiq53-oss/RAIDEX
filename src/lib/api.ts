const API_BASE = import.meta.env.VITE_API_URL || 'https://hr-ride.com/api'

function getStoredAuthToken(): string | null {
  return sessionStorage.getItem('afandi_token') ?? localStorage.getItem('afandi_token') ?? null
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { credentials: 'include', cache: 'no-store', headers: authHeaders() })
  const payload = await readApiPayload(response)
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || `API request failed: ${response.status}`)
  }
  return payload.data as T
}

function authHeaders(): HeadersInit {
  const token = getStoredAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  const payload = await readApiPayload(response)
  if (!response.ok || payload.success === false) throw new Error(payload.error || `API request failed: ${response.status}`)
  return payload.data as T
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  const payload = await readApiPayload(response)
  if (!response.ok || payload.success === false) throw new Error(payload.error || `API request failed: ${response.status}`)
  return payload.data as T
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: authHeaders(),
  })
  const payload = await readApiPayload(response)
  if (!response.ok || payload.success === false) throw new Error(payload.error || `API request failed: ${response.status}`)
  return payload.data as T
}

async function readApiPayload(response: Response): Promise<{ success?: boolean; error?: string; data?: unknown }> {
  const text = await response.text()
  if (!text.trim()) {
    throw new Error(`الخادم أعاد استجابة فارغة (${response.status}). تحقق من سجلات الخادم.`)
  }
  try {
    return JSON.parse(text) as { success?: boolean; error?: string; data?: unknown }
  } catch {
    throw new Error(`استجابة غير صالحة من الخادم (${response.status}): ${text.slice(0, 120)}`)
  }
}

export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders(),
    body: formData,
  })
  const payload = await response.json()
  if (!response.ok || payload.success === false) throw new Error(payload.error || `API request failed: ${response.status}`)
  return payload.data as T
}
