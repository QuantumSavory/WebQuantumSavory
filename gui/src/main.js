import { createApp } from 'vue'
import './css/style.css'
import './css/quantumSavory.css'
import './assets/app.css'
import App from './App.vue'
import { api } from './utils/ApiConnector'
import PrimeVue from 'primevue/config';
import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';
import JsonViewer from "vue3-json-viewer";
import "vue3-json-viewer/dist/vue3-json-viewer.css";
import 'katex/dist/katex.min.css'
import Tooltip from 'primevue/tooltip';

const MyPreset = definePreset(Aura, {
    semantic: {
        primary: {
            50: '{indigo.50}',
            100: '{indigo.100}',
            200: '{indigo.200}',
            300: '{indigo.300}',
            400: '{indigo.400}',
            500: '#4345ac',
            600: '#3637a0',
            700: '{indigo.700}',
            800: '{indigo.800}',
            900: '{indigo.900}',
            950: '{indigo.950}'
        }
    }
});


api.init()

const app = createApp(App);
app.directive('tooltip', Tooltip);
app.use(JsonViewer);
app.use(PrimeVue, {
    theme: {
        preset: MyPreset,
        options: {
            // The application currently has one complete semantic palette.
            // Keep PrimeVue on that same light palette until dark tokens exist.
            darkModeSelector: false,
        },
    }
});

app.mount('#app')
