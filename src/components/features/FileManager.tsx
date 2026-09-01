import { useState } from 'react'
import { Upload, File, Image as ImageIcon, Video, Music, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/appStore'
import { storageService } from '@/lib/storageService'
import { useToast } from '@/components/ui/toast'

// simple dropzone without extra dep — custom
export function FileManager() {
  const { files } = useAppStore() as any
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const { push } = useToast()

  const handleFiles = async (list: FileList) => {
    setUploading(true)
    for (let i=0;i<list.length;i++) {
      const file = list[i]
      setProgress(Math.round((i/list.length)*100))
      try {
        const { key } = await storageService.getActive().upload(file)
        // add to store files if we had file store — for demo push toast
        push({ title: `Uploaded ${file.name}`, desc: `Stored as ${key}`})
      } catch(e:any) {
        push({ title: 'Upload failed', desc: String(e.message)})
      }
      await new Promise(r=> setTimeout(r,300))
    }
    setProgress(100)
    setTimeout(()=> { setUploading(false); setProgress(0)}, 800)
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={e=> e.preventDefault()}
        onDrop={e=> { e.preventDefault(); handleFiles(e.dataTransfer.files)}}
        className="rounded-2xl border border-dashed p-8 text-center hover:bg-accent/30 transition-colors"
      >
        <Upload size={20} className="mx-auto text-muted-foreground"/>
        <div className="font-medium mt-2">Drop files here</div>
        <div className="text-xs text-muted-foreground mt-1">Images, PDFs, videos, audio — up to 50MB each. Stored via {storageService.getActive().name}.</div>
        <label className="inline-flex mt-3">
          <input type="file" multiple hidden onChange={e=> e.target.files && handleFiles(e.target.files)}/>
          <span className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm cursor-pointer">Choose files</span>
        </label>
        {uploading && <div className="mt-4">
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-violet-500 transition-all" style={{ width: `${progress}%`}} />
          </div>
          <div className="text-xs text-muted-foreground mt-1">{progress}%</div>
        </div>}
      </div>

      <div className="rounded-2xl border bg-card">
        <div className="p-3 border-b font-medium text-sm flex items-center gap-2"><File size={16}/> Files in workspace</div>
        <div className="p-3 space-y-2">
          {[
            { name:'Q4 Roadmap.pdf', size:'2.4 MB', type:'pdf' },
            { name:'hero-image.png', size:'1.2 MB', type:'image' },
            { name:'demo.mp4', size:'14 MB', type:'video' },
          ].map(f=> (
            <div key={f.name} className="flex items-center gap-3 p-2 rounded-xl hover:bg-accent">
              <span className="w-8 h-8 rounded-lg bg-muted grid place-items-center">
                {f.type==='image' ? <ImageIcon size={14}/> : f.type==='video' ? <Video size={14}/> : <FileText size={14}/>}
              </span>
              <span className="flex-1 text-sm font-medium truncate">{f.name}</span>
              <span className="text-xs text-muted-foreground">{f.size}</span>
              <Button variant="ghost" size="sm">View</Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
