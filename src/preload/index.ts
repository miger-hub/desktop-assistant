import { contextBridge } from 'electron'
import { createApi } from './api'

// 只暴露必要的业务 API，不暴露 ipcRenderer / fs / process
contextBridge.exposeInMainWorld('desktop', createApi())
