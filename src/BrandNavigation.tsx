import {useEffect,useId,useRef,useState} from 'react';
import {HeartHandshake,X,ShieldCheck,House,Users,Stethoscope,Images,Phone,ChevronRight,LockKeyhole,Menu} from 'lucide-react';
import {residenceHref} from './lib/app-display';
import './brand-navigation.css';

export interface BrandNavigationProps {compact?:boolean}

export function BrandNavigation({compact=false}:BrandNavigationProps) {
  const [open,setOpen] = useState(false);
  const dialogId = useId();
  return <>
    <button type="button" className={'brand brand-navigation-trigger'+(compact ? ' compact' : '')} aria-label="Abrir menú de La Casa del Ángel" aria-haspopup="dialog" aria-expanded={open} aria-controls={dialogId}
      onClick={event => {event.currentTarget.focus({preventScroll:true});setOpen(true);}}>
      <HeartHandshake size={compact ? 29 : 34} strokeWidth={1.4} aria-hidden="true"/>
      <span>{compact ? <>La Casa<br/>del Ángel</> : <>La Casa del Ángel<small>Residencia para adultos mayores</small></>}</span>
      <Menu className="brand-menu-icon" size={20} aria-hidden="true"/>
    </button>
    {open && <BrandDrawer id={dialogId} onClose={() => setOpen(false)}/>}
  </>;
}

function BrandDrawer({id,onClose}:{id:string;onClose:()=>void}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if(!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';document.documentElement.style.overflow = 'hidden';
    dialog.showModal();closeRef.current?.focus({preventScroll:true});
    return () => {
      if(dialog.open) dialog.close();
      document.body.style.overflow = bodyOverflow;document.documentElement.style.overflow = rootOverflow;
      if(opener?.isConnected) opener.focus({preventScroll:true});
    };
  },[]);
  function close() {dialogRef.current?.close();onClose();}
  return <dialog id={id} ref={dialogRef} className="brand-drawer" aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={event => {event.preventDefault();close();}}
    onClick={event => {if(event.target === event.currentTarget) close();}}>
    <div className="brand-drawer-panel">
      <header className="brand-drawer-header"><h2 id={titleId}>La Casa del Ángel</h2><button ref={closeRef} type="button" className="brand-drawer-close" onClick={close}><X size={20} aria-hidden="true"/>Cerrar</button></header>
      <div className="brand-drawer-content">
        <p id={descriptionId}>Elige tu portal de cuidados o conoce la residencia.</p>
        <a className="brand-drawer-portal" href="/acceso" onClick={close}><ShieldCheck size={26} aria-hidden="true"/><span><strong>Portal privado</strong><small>Entrar con mi cuenta autorizada</small></span><ChevronRight size={22} aria-hidden="true"/></a>
        <nav className="brand-drawer-residence" aria-label="La residencia"><h3>Conoce la residencia</h3><ul>{[
          {anchor:'',label:'Inicio',Icon:House},
          {anchor:'nosotros',label:'Quiénes somos',Icon:Users},
          {anchor:'cuidados',label:'Cuidados',Icon:Stethoscope},
          {anchor:'espacios',label:'Nuestros espacios',Icon:Images},
          {anchor:'contacto',label:'Contacto y visitas',Icon:Phone},
        ].map(({anchor,label,Icon}) => <li key={anchor}><a href={residenceHref(anchor)} onClick={close}><Icon size={22} aria-hidden="true"/><span>{label}</span><ChevronRight size={18} aria-hidden="true"/></a></li>)}</ul></nav>
      </div>
      <footer className="brand-drawer-footer"><p><LockKeyhole size={20} aria-hidden="true"/><span>Tu cuenta es personal. Cierra la sesión al terminar en un dispositivo compartido.</span></p><div><a href="/privacidad" onClick={close}>Privacidad</a><a href="/instalar" onClick={close}>Usar en mi celular</a></div></footer>
    </div>
  </dialog>;
}
