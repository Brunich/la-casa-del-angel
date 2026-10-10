export type Theme='light'|'dark';
const storageKey='casa-angel-theme';
const changeEvent='casa-angel-theme-change';
let theme:Theme='light';

if(typeof window!=='undefined') {
  try {theme=localStorage.getItem(storageKey)==='dark' ? 'dark' : 'light';} catch { /* The preference still works when browser storage is unavailable. */ }
  document.documentElement.dataset.theme=theme;
}

export function getTheme():Theme {return theme;}
export function setTheme(next:Theme) {
  theme=next;
  document.documentElement.dataset.theme=next;
  try {localStorage.setItem(storageKey,next);} catch { /* No account or clinical information is stored here. */ }
  window.dispatchEvent(new Event(changeEvent));
}
export function subscribeTheme(listener:()=>void):()=>void {
  function onStorage(event:StorageEvent) {
    if(event.key!==storageKey) return;
    theme=event.newValue==='dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme=theme;
    listener();
  }
  window.addEventListener(changeEvent,listener);
  window.addEventListener('storage',onStorage);
  return () => {window.removeEventListener(changeEvent,listener);window.removeEventListener('storage',onStorage);};
}
