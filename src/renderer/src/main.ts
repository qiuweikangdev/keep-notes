import { createApp } from 'vue'
import App from './App.vue'
import router from './router/index'
import pinia from './store/index'
import './assets/css/style.less'

createApp(App).use(router).use(pinia).mount('#app')
