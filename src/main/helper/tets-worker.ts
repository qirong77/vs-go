import { parentPort } from "process"

setInterval(()=>{
    console.log('tets-worker')
    parentPort.postMessage('tets-worker')
},1000)