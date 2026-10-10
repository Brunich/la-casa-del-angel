import {useEffect,useId,useRef,useState} from 'react';
import {HeartHandshake,X,ShieldCheck,House,Users,Stethoscope,Images,Phone,ChevronRight,LockKeyhole,Menu,type LucideIcon} from 'lucide-react';
import type {Role} from './domain';
import {ThemeToggle} from './ThemeToggle';
import {residenceHref} from './lib/app-display';
import './brand-navigation.css';

export interface BrandNavigationItem {id:string;label:string;icon?:LucideIcon;onSelect:()=>void}
export interface BrandNavigationProps {compact?:boolean;role?:Role;items?:BrandNavigationItem[];activeItem?:string}
const roleNames:Record<Role,string>={owner:'Dirección general',manager:'Manager',nurse:'Enfermería',family:'Familia',patient:'Mi cuenta'};

export function BrandNavigation({compact=false,role,items,activeItem}:BrandNavigationProps) {
  const [open,setOpen] = useState(false);
  const dialogId = useId();
  return <>
    <button type="button" className={'brand brand-navigation-trigger'+(compact ? ' compact' : '')} aria-label={items!==undefined ? 'Abrir menú de mi portal' : 'Abrir menú de La Casa del Ángel'} aria-haspopup="dialog" aria-expanded={open} aria-controls={dialogId}
      onClick={event => {event.currentTarget.focus({preventScroll:true});setOpen(true);}}>
      <span className="brand-navigation-menu"><Menu size={22} aria-hidden="true"/></span>
      <HeartHandshake className="brand-navigation-symbol" size={compact ? 29 : 34} strokeWidth={1.4} aria-hidden="true"/>
      <span>{compact ? <>La Casa<br/>del Ángel</> : <>La Casa del Ángel<small>Residencia para adultos mayores</small></>}</span>
    </button>
    {open && <BrandDrawer id={dialogId} role={role} items={items} activeItem={activeItem} onClose={() => setOpen(false)}/>}
  </>;
}

function BrandDrawer({id,onClose,role,items,activeItem}:{id:string;onClose:()=>void;role?:Role;items?:BrandNavigationItem[];activeItem?:string}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [closing,setClosing]=useState(false);
  const closeTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useEffect(() => {
    const dialog = dialogRef.current;
    if(!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';document.documentElement.style.overflow = 'hidden';
    dialog.showModal();closeRef.current?.focus({preventScroll:true});
    return () => {
      clearTimeout(closeTimer.current);
      if(dialog.open) dialog.close();
      document.body.style.overflow = bodyOverflow;document.documentElement.style.overflow = rootOverflow;
      if(opener?.isConnected) opener.focus({preventScroll:true});
    };
  },[]);
  function close(afterClose?:()=>void) {
    if(closeTimer.current) return;
    setClosing(true);
    const duration=window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180;
    closeTimer.current=setTimeout(() => {
      dialogRef.current?.close();onClose();
      // Route actions run after the modal releases focus and its opener is restored.
      if(afterClose) requestAnimationFrame(() => {requestAnimationFrame(afterClose);});
    },duration);
  }
  const portalMode=items!==undefined;
  const residenceLinks=<ul>{[
    {anchor:'',label:'Inicio',Icon:House},
    {anchor:'nosotros',label:'Quiénes somos',Icon:Users},
    {anchor:'cuidados',label:'Cuidados',Icon:Stethoscope},
    {anchor:'espacios',label:'Nuestros espacios',Icon:Images},
    {anchor:'contacto',label:'Contacto y visitas',Icon:Phone},
  ].map(({anchor,label,Icon}) => <li key={anchor}><a href={residenceHref(anchor)} onClick={()=>close()}><Icon size={22} aria-hidden="true"/><span>{label}</span><ChevronRight size={18} aria-hidden="true"/></a></li>)}</ul>;
  return <dialog id={id} ref={dialogRef} className={'brand-drawer'+(closing ? ' is-closing' : '')} aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={event => {event.preventDefault();close();}}
    onClick={event => {if(event.target === event.currentTarget) close();}}>
    <div className="brand-drawer-panel">
      <header className="brand-drawer-header"><h2 id={titleId}>{portalMode ? 'Mi portal' : 'La Casa del Ángel'}</h2><button ref={closeRef} type="button" className="brand-drawer-close" onClick={()=>close()}><X size={20} aria-hidden="true"/>Cerrar</button></header>
      <div className="brand-drawer-content">
        <p id={descriptionId}>{portalMode ? <>{role ? roleNames[role] : 'Cuenta pendiente'}. Elige la sección que necesitas.</> : 'Elige tu portal de cuidados o conoce la residencia.'}</p>
        {portalMode ? <nav className="brand-drawer-actions" aria-label="Secciones de mi portal"><ul>{items.map(({id:itemId,label,icon:Icon=ShieldCheck,onSelect}) => <li key={itemId}><button type="button" aria-current={activeItem===itemId ? 'page' : undefined} disabled={closing} onClick={()=>close(onSelect)}><Icon size={23} aria-hidden="true"/><span>{label}</span><ChevronRight size={18} aria-hidden="true"/></button></li>)}</ul></nav> : <a className="brand-drawer-portal" href="/acceso" onClick={()=>close()}><ShieldCheck size={26} aria-hidden="true"/><span><strong>Portal privado</strong><small>Entrar con mi cuenta autorizada</small></span><ChevronRight size={22} aria-hidden="true"/></a>}
        <nav className="brand-drawer-residence" aria-label="La residencia">{portalMode ? <details><summary>Conoce la residencia</summary>{residenceLinks}</details> : <><h3>Conoce la residencia</h3>{residenceLinks}</>}</nav>
        <ThemeToggle/>
      </div>
      <footer className="brand-drawer-footer"><p><LockKeyhole size={20} aria-hidden="true"/><span>Tu cuenta es personal. Cierra la sesión al terminar en un dispositivo compartido.</span></p><div><a href="/privacidad" onClick={()=>close()}>Privacidad</a><a href="/instalar" onClick={()=>close()}>Usar en mi celular</a></div></footer>
    </div>
  </dialog>;
}
