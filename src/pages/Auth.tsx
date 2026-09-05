import { useEffect, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { probeBackend } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input, Card, CardHeader, CardContent } from '@/components/ui/input'

export function Auth({ onNavigate }: { onNavigate: (r: 'dashboard') => void }) {
  const { user, token, backendMode, signIn, signUp, signOut, setBackendStatus } = useAppStore()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [probe, setProbe] = useState<'checking' | 'up' | 'down'>('checking')
  const [dbKind, setDbKind] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    probeBackend().then((r) => {
      if (!live) return
      setProbe(r ? 'up' : 'down')
      setDbKind(r?.db ?? null)
      setBackendStatus(r ? 'server' : token ? 'server' : 'local', r?.db ?? null)
    })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = async () => {
    setError(null)
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Enter a valid email address.'); return }
    if (mode === 'signup' && !name.trim()) { setError('Enter your name.'); return }
    if (password && password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setBusy(true)
    try {
      if (mode === 'signup') await signUp(email, name, password || undefined)
      else await signIn(email, password || undefined)
      onNavigate('dashboard')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed.')
    } finally {
      setBusy(false)
    }
  }

  if (token) {
    return (
      <div className="max-w-[480px] mx-auto p-6 md:p-8">
        <Card className="rounded-2xl">
          <CardHeader>
            <h1 className="text-xl font-bold">Account</h1>
            <p className="text-xs text-muted-foreground">Signed in to {backendMode === 'server' ? 'the server' : 'local demo mode'}.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-xl border bg-background">
              <span className="w-10 h-10 rounded-xl bg-violet-500/15 grid place-items-center font-semibold text-violet-600">
                {(user.name || user.email).slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <div className="font-medium truncate">{user.name}</div>
                <div className="text-xs text-muted-foreground truncate">{user.email}</div>
              </div>
            </div>
            <Button variant="outline" className="w-full" onClick={()=> { signOut(); onNavigate('dashboard') }}>Sign out (back to local demo)</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-[440px] mx-auto p-6 md:p-8">
      <div className="text-center mb-6">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-500 grid place-items-center text-white text-xl mx-auto">⬢</div>
        <h1 className="text-2xl font-bold mt-3">Welcome to OpenManas</h1>
        <p className="text-sm text-muted-foreground mt-1">Sign in to sync across devices and collaborate.</p>
      </div>
      <Card className="rounded-2xl">
        <CardContent className="pt-5 space-y-3">
          <div className="flex rounded-full border text-xs overflow-hidden w-fit mx-auto" role="tablist" aria-label="Auth mode">
            {(['signin', 'signup'] as const).map((m) => (
              <button key={m} onClick={()=> { setMode(m); setError(null) }} className={`px-4 py-1.5 ${mode===m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                {m === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>
          <div>
            <label className="text-xs font-medium" htmlFor="auth-email">Email</label>
            <Input id="auth-email" type="email" autoComplete="email" value={email} onChange={e=> setEmail(e.target.value)} placeholder="you@team.com" className="mt-1" />
          </div>
          {mode === 'signup' && (
            <div>
              <label className="text-xs font-medium" htmlFor="auth-name">Name</label>
              <Input id="auth-name" autoComplete="name" value={name} onChange={e=> setName(e.target.value)} placeholder="Alex Rivera" className="mt-1" />
            </div>
          )}
          <div>
            <label className="text-xs font-medium" htmlFor="auth-password">Password <span className="text-muted-foreground font-normal">(min 8 chars; optional on JSON dev backend)</span></label>
            <Input id="auth-password" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={e=> setPassword(e.target.value)} onKeyDown={e=> { if (e.key === 'Enter') void submit() }} placeholder="••••••••" className="mt-1" />
          </div>
          {error && <div className="text-xs text-red-600 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</div>}
          <Button className="w-full" disabled={busy || probe === 'down'} onClick={()=> void submit()}>
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </Button>
          <div className="text-center text-xs text-muted-foreground">
            {probe === 'checking' && 'Checking server…'}
            {probe === 'up' && `Connected to server${dbKind ? ` (${dbKind})` : ''}.`}
            {probe === 'down' && 'No server reachable — start it with `npm run server`, or continue below.'}
          </div>
          <Button variant="ghost" className="w-full" onClick={()=> onNavigate('dashboard')}>Continue in local demo mode →</Button>
        </CardContent>
      </Card>
    </div>
  )
}
