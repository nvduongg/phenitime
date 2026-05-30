import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getSemesters } from '../services/api'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [semesters, setSemesters] = useState([])
  const [loadingSemesters, setLoadingSemesters] = useState(true)

  const refreshSemesters = useCallback(async () => {
    setLoadingSemesters(true)
    try {
      const result = await getSemesters()
      setSemesters(result.data || [])
    } catch {
      // Error handled by axios interceptor
    } finally {
      setLoadingSemesters(false)
    }
  }, [])

  useEffect(() => {
    refreshSemesters()
  }, [refreshSemesters])

  const activeSemester = useMemo(
    () => semesters.find((semester) => semester.is_active) || null,
    [semesters],
  )

  const activeSemesterId = activeSemester?.semester_id ?? null

  const value = useMemo(
    () => ({
      semesters,
      activeSemesterId,
      activeSemester,
      loadingSemesters,
      refreshSemesters,
    }),
    [semesters, activeSemesterId, activeSemester, loadingSemesters, refreshSemesters],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useAppContext() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider')
  }
  return context
}
