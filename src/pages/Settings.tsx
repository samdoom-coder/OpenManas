import { useAppStore } from '@/stores/appStore'
import { Card, CardContent, CardHeader } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { aiService } from '@/lib/aiService'
import { storageService } from '@/lib/storageService'
import { useState } from 'react'

export function Settings() {
  const { workspace, user, toggleTheme, theme } = useAppStore()
  const [aiProvider, setAiProvider] = useState('openai')
  return (
    <div className="max-w-[900px] mx-auto p-6 md:p-8 space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          <nav className="rounded-2xl border bg-card p-2 space-y-1">
            {['Account','Workspace','Appearance','Editor','Notifications','AI','Billing'].map(item=> (
              <button key={item} className={`w-full text-left px-3 py-2 rounded-xl text-sm ${item==='Account' ? 'bg-accent font-medium' : 'hover:bg-accent text-muted-foreground'}`}>{item}</button>
            ))}
          </nav>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Card className="rounded-2xl">
            <CardHeader><h3 className="font-semibold">Account</h3></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-4">
                <img src={`https://i.pravatar.cc/100?img=32`} className="w-16 h-16 rounded-2xl" alt=""/>
                <div>
                  <div className="font-medium">{user.name}</div>
                  <div className="text-sm text-muted-foreground">{user.email}</div>
                </div>
                <Button variant="outline" size="sm" className="ml-auto">Change avatar</Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-medium">Name</label><Input defaultValue={user.name} className="mt-1"/></div>
                <div><label className="text-xs font-medium">Email</label><Input defaultValue={user.email} className="mt-1"/></div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader><h3 className="font-semibold">Workspace</h3></CardHeader>
            <CardContent className="space-y-3">
              <div><label className="text-xs font-medium">Workspace name</label><Input defaultValue={workspace.name} className="mt-1"/></div>
              <div><label className="text-xs font-medium">Icon</label><Input defaultValue={workspace.icon} className="mt-1 w-24"/></div>
              <div className="flex items-center gap-2">
                <Button size="sm">Save</Button>
                <Button variant="ghost" size="sm">Invite members</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader><h3 className="font-semibold">Appearance</h3></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Theme</span>
                <div className="flex items-center gap-1 p-1 rounded-xl border bg-muted">
                  {(['light','dark','system'] as const).map(t=> (
                    <button key={t} onClick={()=> theme!==t && toggleTheme()} className={`px-3 py-1.5 rounded-lg text-xs capitalize ${theme===t ? 'bg-background shadow border' : 'hover:bg-accent'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Compact mode</span>
                <input type="checkbox" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Sidebar</span>
                <select className="border rounded-xl px-2 py-1 text-sm bg-background"><option>Expanded</option><option>Collapsed</option></select>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader><h3 className="font-semibold">AI Configuration</h3></CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs text-muted-foreground">Provider abstraction — switch models per task without rewriting app code.</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {aiService.listProviders().map(p=> (
                  <button key={p.id} onClick={()=> setAiProvider(p.id)} className={`p-3 rounded-xl border text-left ${aiProvider===p.id ? 'border-violet-500 bg-violet-500/10' : 'hover:bg-accent'}`}>
                    <div className="font-medium text-sm">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.models.join(', ')}</div>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs">Writing model</label><select className="w-full mt-1 border rounded-xl px-2 py-2 text-sm bg-background"><option>gpt-4o</option><option>claude-3.5-sonnet</option></select></div>
                <div><label className="text-xs">Reasoning model</label><select className="w-full mt-1 border rounded-xl px-2 py-2 text-sm bg-background"><option>o1</option><option>gemini-1.5-pro</option></select></div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader><h3 className="font-semibold">Storage</h3></CardHeader>
            <CardContent className="space-y-2">
              {storageService.list().map(s=> (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-xl border">
                  <span className="text-sm font-medium">{s.name}</span>
                  <span className="text-xs border rounded-full px-2 py-1">{s.id===storageService.getActive().id ? 'Active' : 'Available'}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
