import fs from 'node:fs'
import * as tf from '@tensorflow/tfjs-core'
import '@tensorflow/tfjs-backend-cpu'
import { loadGraphModel } from '@tensorflow/tfjs-converter'
const dir = process.argv[2]
const mj = JSON.parse(fs.readFileSync(`${dir}/model.json`))
const bufs = mj.weightsManifest.flatMap(g => g.paths.map(p => fs.readFileSync(`${dir}/${p}`)))
const weightData = Buffer.concat(bufs).buffer.slice(0)
await tf.setBackend('cpu')
const m = await loadGraphModel(tf.io.fromMemory({ modelTopology: mj.modelTopology, weightSpecs: mj.weightsManifest.flatMap(g => g.weights), weightData, format: mj.format, generatedBy: mj.generatedBy, convertedBy: mj.convertedBy, signature: mj.signature }))
const n = JSON.parse(fs.readFileSync(`${dir}/metadata.json`)).inputSize[0] // each model's own resolution
const out = m.predict(tf.fill([1, n, n, 3], 127.5))
const v = out.dataSync()
console.log('inputs', JSON.stringify(m.inputs.map(i=>[i.name,i.shape])), 'out', out.shape, 'sum', v.reduce((a,b)=>a+b,0).toFixed(5))
