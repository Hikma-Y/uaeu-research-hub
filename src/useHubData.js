import { useCallback, useEffect, useState } from 'react'

export function useHubData(loader, fallback) {
  const [data,setData] = useState(fallback)
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState('')
  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try { setData(await loader()) } catch (failure) { setError(failure.message) } finally { setLoading(false) }
  }, [loader])
  useEffect(() => { reload() }, [reload])
  return { data,setData,loading,error,reload }
}
