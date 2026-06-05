import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api from '../services/api'

const STORAGE_TOKEN = 'phenitime_token'
const STORAGE_USER = 'phenitime_user'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(STORAGE_TOKEN))
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_USER)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })
  const [bootstrapping, setBootstrapping] = useState(Boolean(localStorage.getItem(STORAGE_TOKEN)))

  const persistSession = useCallback((nextToken, nextUser) => {
    setToken(nextToken)
    setUser(nextUser)
    if (nextToken) {
      localStorage.setItem(STORAGE_TOKEN, nextToken)
      localStorage.setItem(STORAGE_USER, JSON.stringify(nextUser))
      api.defaults.headers.common.Authorization = `Bearer ${nextToken}`
    } else {
      localStorage.removeItem(STORAGE_TOKEN)
      localStorage.removeItem(STORAGE_USER)
      delete api.defaults.headers.common.Authorization
    }
  }, [])

  const logout = useCallback(() => {
    persistSession(null, null)
  }, [persistSession])

  const login = useCallback(
    async (email, password) => {
      const response = await api.post(
        '/auth/login',
        { email, password },
        { skipErrorToast: false },
      )
      const payload = response.data?.data
      if (!payload?.token || !payload?.user) {
        throw new Error('Phản hồi đăng nhập không hợp lệ')
      }
      persistSession(payload.token, payload.user)
      return payload.user
    },
    [persistSession],
  )

  const refreshMe = useCallback(async () => {
    const response = await api.get('/auth/me', { skipErrorToast: true })
    const nextUser = response.data?.data
    if (nextUser && token) {
      setUser(nextUser)
      localStorage.setItem(STORAGE_USER, JSON.stringify(nextUser))
    }
    return nextUser
  }, [token])

  useEffect(() => {
    if (token) {
      api.defaults.headers.common.Authorization = `Bearer ${token}`
    }
  }, [token])

  useEffect(() => {
    if (!token) {
      setBootstrapping(false)
      return
    }

    let cancelled = false
    refreshMe()
      .catch(() => {
        if (!cancelled) logout()
      })
      .finally(() => {
        if (!cancelled) setBootstrapping(false)
      })

    return () => {
      cancelled = true
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- bootstrap once

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token && user),
      bootstrapping,
      login,
      logout,
      refreshMe,
    }),
    [token, user, bootstrapping, login, logout, refreshMe],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
