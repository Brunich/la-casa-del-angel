import React from 'react';
import {createRoot} from 'react-dom/client';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/lora/400.css';
import '@fontsource/lora/400-italic.css';
import './styles.css';
import App from './App';
import {Capacitor} from '@capacitor/core';
// Installed apps open the care portal; the public website keeps its home page.
if(Capacitor.isNativePlatform()&&(location.pathname==='/'||location.pathname==='/index.html'))history.replaceState(null,'','/acceso');
createRoot(document.getElementById('root')!).render(<React.StrictMode><a href="#contenido" className="skip-link">Ir al contenido</a><App/></React.StrictMode>);
