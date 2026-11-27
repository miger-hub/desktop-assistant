import { createApp } from 'vue'
import App from './App.vue'
import { vuetify } from './plugins/vuetify'
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'
import '@milkdown/crepe/theme/common/style.css'
import './styles/main.css'

createApp(App).use(vuetify).mount('#app')
