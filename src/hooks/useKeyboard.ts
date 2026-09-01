import { useEffect } from 'react'
export function useKeyboard(shortcut: string, handler: (e:KeyboardEvent)=>void) {
  useEffect(()=> {
    const fn=(e:KeyboardEvent)=>{
      // shortcut like "Ctrl+K"
      const parts = shortcut.toLowerCase().split('+')
      const needCtrl = parts.includes('ctrl') || parts.includes('cmd')
      const key = parts[parts.length-1]
      if (needCtrl && !(e.ctrlKey||e.metaKey)) return
      if (e.key.toLowerCase() !== key) return
      handler(e)
    }
    window.addEventListener('keydown', fn)
    return ()=> window.removeEventListener('keydown', fn)
  }, [shortcut, handler])
}
