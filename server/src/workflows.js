import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'

const manifest = JSON.parse(fs.readFileSync(path.join(config.workflowsDir, 'manifest.json'), 'utf8'))
const templates = {}

function template(name) {
  const entry = manifest[name]
  if (!entry) throw new Error(`Unknown workflow: ${name}`)
  templates[name] ??= JSON.parse(fs.readFileSync(path.join(config.workflowsDir, entry.file), 'utf8'))
  return { entry, graph: structuredClone(templates[name]) }
}

export const ratios = manifest.ratios

export function buildGraph(name, params = {}, imageNames = []) {
  const { entry, graph } = template(name)

  for (const [key, targets] of Object.entries(entry.params)) {
    if (params[key] === undefined) continue
    for (const [nodeId, input] of targets) graph[nodeId].inputs[input] = params[key]
  }

  if (entry.imageSlots) {
    if (imageNames.length === 0) throw new Error(`${name} needs at least one image`)
    entry.imageSlots.forEach((slot, i) => {
      if (imageNames[i]) {
        graph[slot.node].inputs.image = imageNames[i]
      } else {
        delete graph[slot.node]
        if (slot.encoderInput) delete graph[entry.encoderNode].inputs[slot.encoderInput]
      }
    })
  }
  return { graph, entry }
}

export function extractOutputs(entry, history) {
  return { images: history.outputs?.[entry.output]?.images ?? [] }
}
