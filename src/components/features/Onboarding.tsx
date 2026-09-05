import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'

export function Onboarding({ open, onClose }: { open:boolean, onClose:()=>void }) {
  const [step, setStep] = useState(0)
  const [choices, setChoices] = useState<Record<string, boolean>>({ Projects:true, Notes:true, Tasks:true, Knowledge:true })
  if (!open) return null
  return (
    <Modal open={open} onClose={onClose} title={step===0 ? "Welcome to OpenManas" : "Choose your focus"} className="max-w-[520px]">
      {step===0 ? (
        <div className="space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 grid place-items-center text-white text-xl">⬢</div>
          <h2 className="text-xl font-bold">Your intelligent workspace operating system</h2>
          <p className="text-sm text-muted-foreground">OpenManas combines documents, databases, and AI into one calm, fast surface. Create your first workspace to begin.</p>
          <div>
            <label className="text-xs font-medium">Workspace name</label>
            <input defaultValue="Acme Workspace" className="mt-1 w-full h-9 rounded-xl border bg-background px-3 text-sm" />
          </div>
          <Button onClick={()=> setStep(1)} className="w-full">Continue</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Pick what you want to organize — we'll create starter pages for you.</p>
          <div className="grid grid-cols-2 gap-2">
            {Object.keys(choices).map(k=> (
              <label key={k} className={`p-3 rounded-xl border flex items-center gap-2 cursor-pointer ${choices[k] ? 'bg-violet-500/10 border-violet-500/30' : 'hover:bg-accent'}`}>
                <input type="checkbox" checked={choices[k]} onChange={e=> setChoices(s=> ({...s, [k]: e.target.checked}))}/>
                <span className="text-sm font-medium">{k}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={()=> setStep(0)} className="flex-1">Back</Button>
            <Button onClick={onClose} className="flex-1">Create workspace</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
