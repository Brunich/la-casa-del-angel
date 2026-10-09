import {Capacitor} from '@capacitor/core';

export function isAppDisplay():boolean{
 return Capacitor.isNativePlatform()||window.matchMedia('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone===true;
}
export function residenceHref(anchor=''):string{
 return(isAppDisplay()?'/residencia':'/')+(anchor?'#'+anchor:'');
}
