import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import packageInfo from './package.json';
export default defineConfig({plugins:[react(),{name:'release-version',generateBundle(){this.emitFile({type:'asset',fileName:'release.json',source:JSON.stringify({version:packageInfo.version})});}}],server:{host:'127.0.0.1'}});
