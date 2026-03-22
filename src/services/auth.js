import axios from 'axios'

const api = axios.create({ baseURL: (import.meta.env.VITE_API_BASE_URL || '') || '' })

export async function login(username, password) {
  const res = await api.post('/api/login', { username, password })
  return res.data
}

export function setToken(token) {
  if (token) localStorage.setItem('admin_token', token)
}

export function getToken() {
  return localStorage.getItem('admin_token')
}

export function logout() {
  localStorage.removeItem('admin_token')
}
