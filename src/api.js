const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

export function getToken() { return sessionStorage.getItem('uaeu_token') }
export function setSession({ token, user }) {
  sessionStorage.setItem('uaeu_token', token)
  sessionStorage.setItem('uaeu_user', JSON.stringify(user))
}
export function clearSession() {
  sessionStorage.removeItem('uaeu_token')
  sessionStorage.removeItem('uaeu_user')
}
export function getSavedUser() {
  try { return JSON.parse(sessionStorage.getItem('uaeu_user')) } catch { return null }
}

export async function api(path, options = {}) {
  const headers = new Headers(options.headers)
  if (!(options.body instanceof FormData) && options.body !== undefined) headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${API_URL}${path}`, { ...options, headers })
  const data = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || 'The request could not be completed.')
  return data
}

export async function downloadApiFile(path) {
  const response = await fetch(`${API_URL}${path}`, { headers:{ Authorization:`Bearer ${getToken()}` } })
  if (!response.ok) { const data=await response.json().catch(()=>null);throw new Error(data?.error||'The document could not be downloaded.') }
  return response.blob()
}

export const hubApi = {
  login: (email,password) => api('/auth/login', { method:'POST', body:JSON.stringify({ email,password }) }),
  projects: (filters = '') => api(`/projects${filters}`),
  project: (id) => api(`/projects/${id}`),
  createProject: (value) => api('/projects', { method:'POST', body:JSON.stringify(value) }),
  updateProject: (id,value) => api(`/projects/${id}`, { method:'PUT', body:JSON.stringify(value) }),
  archiveProject: (id) => api(`/projects/${id}`, { method:'DELETE' }),
  applications: () => api('/applications'),
  apply: (project_id,cover_note='') => api('/applications', { method:'POST', body:JSON.stringify({ project_id,cover_note }) }),
  updateApplication: (id,status) => api(`/applications/${id}/status`, { method:'PATCH', body:JSON.stringify({ status }) }),
  profile: () => api('/profiles/me'),
  saveProfile: (value) => api('/profiles/me', { method:'PUT', body:JSON.stringify(value) }),
  documents: () => api('/profiles/me/documents'),
  uploadDocument: (form) => api('/profiles/me/documents', { method:'POST', body:form }),
  downloadDocument: (id) => downloadApiFile(`/profiles/documents/${id}`),
  announcements: () => api('/announcements'),
  postAnnouncement: (value) => api('/announcements', { method:'POST', body:JSON.stringify(value) }),
  ideas: () => api('/ideas'),
  createIdea: (value) => api('/ideas', { method:'POST', body:JSON.stringify(value) }),
  notifications: () => api('/notifications'),
  chats: () => api('/chats'),
  messages: (chatId) => api(`/chats/${chatId}/messages`),
  users: () => api('/users'),
  createUser: (value) => api('/users', { method:'POST', body:JSON.stringify(value) }),
}
