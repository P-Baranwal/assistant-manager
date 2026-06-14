import { mount } from 'svelte';
import App from './App.svelte';
import { initPWA } from './lib/pwa.js';
import '../style.css';

// Initialize PWA features
initPWA();

const app = mount(App, {
  target: document.getElementById('app')
});

export default app;