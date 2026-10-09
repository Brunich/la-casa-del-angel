import {useEffect,useId,useRef} from 'react';
import {X,ChevronLeft,ChevronRight} from 'lucide-react';

export interface PhotoViewerProps {src:string;caption:string;onClose:()=>void;onPrevious?:()=>void;onNext?:()=>void;position?:string}

/** Render conditionally while open. The caller owns the source URL and its lifetime. */
export function PhotoViewer({src,caption,onClose,onPrevious,onNext,position}:PhotoViewerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const captionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if(!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    dialog.showModal();
    closeRef.current?.focus({preventScroll:true});
    return () => {
      if(dialog.open) dialog.close();
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
      if(opener?.isConnected) opener.focus({preventScroll:true});
    };
  },[]);

  return <dialog ref={dialogRef} className="photo-viewer" aria-labelledby={titleId} aria-describedby={captionId}
    onKeyDown={event=>{if(event.key==='ArrowLeft'&&onPrevious){event.preventDefault();onPrevious();}if(event.key==='ArrowRight'&&onNext){event.preventDefault();onNext();}}}
    onCancel={event => {event.preventDefault();onClose();}}
    onClick={event => {if(event.target === event.currentTarget) onClose();}}>
    <div className="photo-viewer-content">
      <header className="photo-viewer-header"><h2 id={titleId}>Fotografía completa</h2><button ref={closeRef} type="button" className="button light" onClick={onClose}><X size={20} aria-hidden="true"/>Cerrar</button></header>
      <div className="photo-viewer-stage" onClick={event => {if(event.target === event.currentTarget) onClose();}}><img className="photo-viewer-image" src={src} alt={caption}/></div>
      <div className="photo-viewer-bottom">{onPrevious&&<button type="button" className="button light" aria-label="Fotografía anterior" onClick={onPrevious}><ChevronLeft size={20}/><span>Anterior</span></button>}<p id={captionId} className="photo-viewer-caption" aria-live="polite">{position&&<span className="photo-position">{position} · </span>}{caption}</p>{onNext&&<button type="button" className="button light" aria-label="Fotografía siguiente" onClick={onNext}><span>Siguiente</span><ChevronRight size={20}/></button>}</div>
    </div>
  </dialog>;
}
