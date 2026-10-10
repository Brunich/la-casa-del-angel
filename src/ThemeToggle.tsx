import {useSyncExternalStore} from 'react';
import {Moon,Sun} from 'lucide-react';
import {getTheme,setTheme,subscribeTheme} from './lib/theme';
import './theme.css';

export function ThemeToggle({className=''}:{className?:string}) {
  const dark=useSyncExternalStore(subscribeTheme,getTheme,()=> 'light')==='dark';
  const Icon=dark ? Sun : Moon;
  return <button type="button" className={'theme-toggle '+className} aria-pressed={dark} aria-label={dark ? 'Desactivar modo oscuro' : 'Activar modo oscuro'} onClick={() => setTheme(dark ? 'light' : 'dark')}><Icon size={20} aria-hidden="true"/><span>{dark ? 'Light mode' : 'Dark mode'}</span></button>;
}
