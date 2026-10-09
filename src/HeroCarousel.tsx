import {useRef,useState,type KeyboardEvent,type TouchEvent} from 'react';
import {ChevronLeft,ChevronRight,Sun} from 'lucide-react';
import './hero-carousel.css';

export interface HeroCarouselPhoto {src:string;caption:string}
export interface HeroCarouselProps {photos:readonly HeroCarouselPhoto[];onOpen:(index:number)=>void}

export function HeroCarousel({photos,onOpen}:HeroCarouselProps) {
  const [current,setCurrent] = useState(0);
  const touchStart = useRef<{x:number;y:number}|null>(null);
  const swipedAt = useRef(0);
  const photo = photos[current];
  if(!photo) return null;

  function move(direction:number) {setCurrent(index => (index+direction+photos.length)%photos.length);}
  function keyboard(event:KeyboardEvent<HTMLElement>) {
    if(event.key === 'ArrowLeft') {event.preventDefault();move(-1);}
    else if(event.key === 'ArrowRight') {event.preventDefault();move(1);}
    else if(event.key === 'Home') {event.preventDefault();setCurrent(0);}
    else if(event.key === 'End') {event.preventDefault();setCurrent(photos.length-1);}
  }
  function startTouch(event:TouchEvent<HTMLButtonElement>) {
    const point = event.touches[0];
    touchStart.current = event.touches.length === 1 ? {x:point.clientX,y:point.clientY} : null;
  }
  function finishTouch(event:TouchEvent<HTMLButtonElement>) {
    const start = touchStart.current;
    touchStart.current = null;
    const point = event.changedTouches[0];
    if(!start || !point) return;
    const horizontal = point.clientX-start.x;
    const vertical = point.clientY-start.y;
    if(Math.abs(horizontal) >= 50 && Math.abs(horizontal) > Math.abs(vertical)*1.2) {
      swipedAt.current = Date.now();move(horizontal < 0 ? 1 : -1);
    }
  }

  return <figure className="hero-photo hero-carousel" role="region" aria-roledescription="carrusel" aria-label="Fotografías de La Casa del Ángel" onKeyDown={keyboard}>
    <div className="hero-carousel-photo">
      <button type="button" className="hero-carousel-open" aria-label={'Abrir fotografía completa: '+photo.caption}
        onTouchStart={startTouch} onTouchMove={event => {if(event.touches.length > 1) touchStart.current = null;}}
        onTouchEnd={finishTouch} onTouchCancel={() => {touchStart.current = null;}}
        onClick={event => {if(Date.now()-swipedAt.current < 350) return;event.currentTarget.focus({preventScroll:true});onOpen(current);}}>
        <img src={photo.src.replace(/\.png$/,'.webp')} alt={photo.caption} width="1448" height="1086" fetchPriority={current === 0 ? 'high' : 'auto'} decoding="async" draggable={false}/>
      </button>
      {photos.length > 1 && <div className="hero-carousel-arrows">
        <button type="button" className="hero-carousel-arrow" aria-label="Fotografía anterior" onClick={() => move(-1)}><ChevronLeft size={24} aria-hidden="true"/></button>
        <button type="button" className="hero-carousel-arrow" aria-label="Fotografía siguiente" onClick={() => move(1)}><ChevronRight size={24} aria-hidden="true"/></button>
      </div>}
    </div>
    <figcaption>
      <span className="hero-carousel-caption"><Sun size={18} strokeWidth={1.5} aria-hidden="true"/>Un lugar para vivir a tu ritmo.</span>
      <div className="hero-carousel-dots" role="group" aria-label="Elegir fotografía">{photos.map((item,index) => <button type="button" key={item.src} className="hero-carousel-dot" aria-label={'Mostrar foto '+(index+1)+': '+item.caption} aria-pressed={current === index} onClick={() => setCurrent(index)}><span aria-hidden="true"/></button>)}</div>
      <span className="hero-carousel-status" role="status" aria-live="polite" aria-atomic="true">Foto {current+1} de {photos.length}: {photo.caption}</span>
    </figcaption>
  </figure>;
}
