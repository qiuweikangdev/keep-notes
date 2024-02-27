import { createApp } from 'vue'
import App from './App.vue'
import router from './router/index'
import './assets/css/style.less'
import '@milkdown/theme-nord/style.css'

createApp(App).use(router).mount('#app')
