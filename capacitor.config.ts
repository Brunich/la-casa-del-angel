import type {CapacitorConfig} from '@capacitor/cli';
import {OTA_PUBLIC_KEY_PKCS1} from './src/lib/ota-public-key';
const config:CapacitorConfig={appId:'mx.lacasadelangel.cuidados',appName:'La Casa del Ángel',webDir:'dist',server:{androidScheme:'https'},plugins:{LocalNotifications:{smallIcon:'ic_stat_care',iconColor:'#335B4C'},CapacitorUpdater:{autoUpdate:false,updateUrl:'',statsUrl:'',channelUrl:'',allowModifyUrl:false,publicKey:OTA_PUBLIC_KEY_PKCS1}}};
export default config;
