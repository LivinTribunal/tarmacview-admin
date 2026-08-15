// airlock: turns the quarantined observation mirror into machine-readable contracts.
//
// this is dirty-side tooling - it reads the mirror. its OUTPUT is the only thing the
// clean side ever sees, so the output must carry structure and never records. three
// rules hold that line:
//
//   1. identifiers are masked  - 32-hex org tokens -> {org}, numeric segments -> {id}
//   2. values are never read   - field names and constraints only, never `value`,
//                                never <option> text, never table cell contents
//   3. schemas, not payloads   - json responses become key paths and types
//
// the mirror path is an argument, never hardcoded, so no tracked file points into it.
//
// usage: node tools/extract-contracts.mjs <mirrorRoot> [outDir]

import fs from 'node:fs'
import path from 'node:path'

const MIRROR = path.resolve(process.argv[2] || process.env.CAMO_MIRROR || '')
const OUT = path.resolve(process.argv[3] || 'contracts')

if (!MIRROR || !fs.existsSync(MIRROR)) {
  console.error('usage: node tools/extract-contracts.mjs <mirrorRoot> [outDir]')
  process.exit(2)
}

const HEX32 = /\b[0-9a-f]{32}\b/g

// paths are the one place identifiers survive capture, so they get masked first
const maskPath = p => p
  .replace(HEX32, '{org}')
  .replace(/\/\d+(?=\/|$|\.)/g, '/{id}')

// ---------------------------------------------------------------------------
// 1. route contract
//
// doc 02 records which routes serve anonymously; that is an Observed finding and
// cannot be re-derived from an authenticated capture, so it is applied as an overlay.
// ---------------------------------------------------------------------------
const PUBLIC = [/^\/map\/[^/]+(\/embed|\/kml)?$/, /^\/login$/, /^\/sanctum\/csrf-cookie$/]

function routes() {
  const manifest = path.join(MIRROR, '_meta', 'manifest.jsonl')
  const lines = fs.readFileSync(manifest, 'utf8').split('\n').filter(Boolean)
  const byPattern = new Map()

  for (const line of lines) {
    let r
    try { r = JSON.parse(line) } catch { continue }
    const u = new URL(r.url)
    const pattern = maskPath(u.pathname)
    const params = [...new URLSearchParams(u.search).keys()].sort()

    const key = pattern
    const e = byPattern.get(key) || {
      path: pattern, methods: ['GET'], statuses: new Set(),
      queryParams: new Set(), contentTypes: new Set(), samples: 0,
    }
    e.statuses.add(r.status)
    params.forEach(p => e.queryParams.add(p))
    if (r.contentType) e.contentTypes.add(r.contentType.split(';')[0].trim())
    e.samples++
    byPattern.set(key, e)
  }

  const out = [...byPattern.values()]
    .map(e => ({
      path: e.path,
      methods: e.methods,
      auth: PUBLIC.some(re => re.test(e.path)) ? 'public' : 'session',
      observedStatuses: [...e.statuses].sort(),
      queryParams: [...e.queryParams].sort(),
      contentTypes: [...e.contentTypes].sort(),
      samples: e.samples,
    }))
    .sort((a, b) => a.path.localeCompare(b.path))

  return {
    note: 'observed by GET-only capture of an authenticated session. methods other than GET were not exercised.',
    absent: {
      note: 'confirmed 404 in doc 02 - no self-service registration or password reset. locked here so it is not restored by accident.',
      paths: ['/register', '/forgot-password', '/password/reset'],
    },
    routes: out,
  }
}

// ---------------------------------------------------------------------------
// 2. form contract
//
// field names and validation attributes are interface. values are records. only the
// former crosses. `value`, <option> text and all element text content are never read.
// ---------------------------------------------------------------------------
const KEEP = ['id', 'name', 'wire:model', 'type', 'role', 'required', 'min', 'max', 'minlength',
  'maxlength', 'step', 'accept', 'pattern', 'multiple', 'disabled', 'readonly', 'rows']

const ATTR = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g

const CONTROL = new Set(['input', 'select', 'textarea'])
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
  'meta', 'param', 'source', 'track', 'wbr'])

// livewire carries form state through a binding, so `data.*` is the shape every identity
// takes - as a name, as a wire:model, as the id filament leaves on a select, or as the
// path an alpine component entangles
const STATE_PATH = /^data\.\w+(\.\w+)*$/
const statePath = v => (v && STATE_PATH.test(v) ? v : undefined)

// $entangle('data.x') binds an element that is not a control at all - a toggle is a
// <button role="switch">. the quotes come through escaped, hence the alternation.
const ENTANGLE = /\$entangle\(\s*(?:&#0?39;|&quot;|["'])([^&"']*)/g

function attrs(tagText) {
  const found = {}
  let m
  while ((m = ATTR.exec(tagText))) {
    let k = m[1].toLowerCase()
    // livewire binds as wire:model.live / .blur / .debounce - all the same binding
    if (k.startsWith('wire:model')) k = 'wire:model'
    if (!KEEP.includes(k)) continue
    const raw = m[2] ?? m[3] ?? m[4]
    // boolean attributes present with no value
    if (found[k] === undefined) found[k] = raw === undefined ? true : raw
  }
  return found
}

// alpine attributes hold arrow functions, so a tag does not end at the first '>' and
// cannot be matched with [^>]*. scan for the first unquoted one instead.
function tags(html) {
  const lower = html.toLowerCase()
  const open = /<(\/?)([a-zA-Z][-a-zA-Z0-9]*)/g
  const out = []
  let m
  while ((m = open.exec(html))) {
    if (html.startsWith('<!--', m.index)) {
      const end = html.indexOf('-->', m.index)
      if (end < 0) break
      open.lastIndex = end + 3
      continue
    }
    let i = open.lastIndex
    let quote = ''
    for (; i < html.length; i++) {
      const c = html[i]
      if (quote) { if (c === quote) quote = '' }
      else if (c === '"' || c === "'") quote = c
      else if (c === '>') break
    }
    const inner = html.slice(open.lastIndex, i)
    const name = m[2].toLowerCase()
    out.push({ name, close: !!m[1], selfClosing: inner.trimEnd().endsWith('/'), attrs: inner })
    open.lastIndex = i + 1
    // script and style bodies are not markup
    if (!m[1] && (name === 'script' || name === 'style')) {
      const end = lower.indexOf(`</${name}`, i)
      open.lastIndex = end < 0 ? html.length : end
    }
  }
  return out
}

// a filament file upload puts the state path on a wrapper several levels above its
// <input type="file">, so identity has to be looked for outward as well as on the tag
function enclosingPath(nodes, from) {
  let depth = 0
  for (let i = from - 1; i >= 0; i--) {
    const n = nodes[i]
    if (n.close) { depth++; continue }
    if (n.selfClosing || VOID.has(n.name)) continue
    if (depth) { depth--; continue }
    // a section's id is a slug of its heading, not a state path, so it never names a field
    if (n.name === 'section') continue
    const p = statePath(attrs(n.attrs).id)
    if (p) return p
  }
}

// the contract records what the markup is, so a toggle stays a <button role="switch">
// rather than being flattened into a checkbox
function field(name, control, a) {
  const f = { name: String(name).replace(HEX32, '{org}'), control }
  if (a.type) f.type = a.type
  for (const k of ['role', 'required', 'min', 'max', 'minlength', 'maxlength', 'step', 'accept', 'pattern', 'multiple', 'readonly', 'disabled', 'rows']) {
    if (a[k] !== undefined) f[k] = a[k]
  }
  return f
}

function fieldsFrom(html, source) {
  const nodes = tags(html)
  const out = []
  const entangled = []
  let unbound = 0
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    if (n.close) continue
    if (!CONTROL.has(n.name)) {
      // an element that is not a control still holds form state when alpine entangles it
      const paths = new Set()
      let m
      while ((m = ENTANGLE.exec(n.attrs))) { const p = statePath(m[1]); if (p) paths.add(p) }
      if (paths.size === 1) entangled.push(field([...paths][0], n.name, attrs(n.attrs)))
      // two paths on one element name no single field - announce it rather than guess
      else if (paths.size > 1) console.error(`AMBIG ${source} — <${n.name}> entangles ${[...paths].join(' and ')}`)
      continue
    }
    const a = attrs(n.attrs)
    const name = a.name || a['wire:model'] || statePath(a.id) || enclosingPath(nodes, i)
    // no binding of any kind means the control carries no form state - client-side ui
    if (!name) { unbound++; continue }
    // framework plumbing, not domain fields
    if (/^(_token|_method)$/.test(name)) continue
    // a hidden input is still a field when livewire writes to it
    if (a.type === 'hidden' && !a['wire:model']) continue

    out.push(field(name, n.name, a))
  }
  // one field binds many times (radio pair, checkbox group, modal + inline); collapse on
  // name. entangled elements come last, so a control always describes its own field - the
  // wrapper filament entangles around a file upload never displaces the <input> inside it.
  const seen = new Map()
  for (const f of [...out, ...entangled]) if (!seen.has(f.name)) seen.set(f.name, f)
  return {
    fields: [...seen.values()].sort((a, b) => a.name.localeCompare(b.name)),
    unbound,
  }
}

// how far the claim goes, stated where it is read. the label this replaces asserted the
// forms were lazy-loaded, which was never observed - all it measured was how many controls
// the extractor had failed to name. contracts/README.md carries what is not covered.
const FORM_NOTE = 'complete for the captured records, not proven exhaustive - a form branch that no captured record exercises cannot be ruled out.'

function forms() {
  const pagesRoot = path.join(MIRROR, 'pages', 'admin')
  if (!fs.existsSync(pagesRoot)) return {}

  const byResource = {}
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) { walk(full); continue }
      if (!e.name.endsWith('.html')) continue

      const rel = path.relative(pagesRoot, full)
      const resource = rel.split(path.sep)[0].replace(/\.html$/, '')
      const shape = /create\.html$/.test(e.name) ? 'create'
        : /edit(__.*)?\.html$/.test(e.name) ? 'edit'
        : 'index'
      if (shape === 'index') continue

      const html = fs.readFileSync(full, 'utf8')
      const { fields, unbound } = fieldsFrom(html, maskPath('/' + rel.split(path.sep).join('/')))
      if (!fields.length) continue

      byResource[resource] ||= { resource, note: FORM_NOTE, create: null, edit: null, coverage: {}, sources: [] }
      byResource[resource].sources.push(maskPath('/' + rel.split(path.sep).join('/')))
      // first sample wins; later ones only fill gaps, so one record's shape does not
      // become the contract for all of them. coverage is read off that same sample.
      if (!byResource[resource][shape]) {
        byResource[resource][shape] = fields
        byResource[resource].coverage[shape] = { fields: fields.length, controlsWithoutBinding: unbound }
      }
    }
  }
  walk(pagesRoot)

  for (const r of Object.values(byResource)) r.sources = [...new Set(r.sources)].sort()
  return byResource
}

// ---------------------------------------------------------------------------
// 3. report schema
//
// the operator report's /data payload is the product's whole contract. keys and types
// cross; values never do.
// ---------------------------------------------------------------------------
function typeOf(v) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

function schemaOf(value, into, prefix = '') {
  const t = typeOf(value)
  const e = into[prefix || '$'] ||= { types: new Set(), nullable: false, seen: 0 }
  e.types.add(t)
  e.seen++
  if (t === 'null') e.nullable = true

  if (t === 'object') {
    for (const [k, v] of Object.entries(value)) schemaOf(v, into, prefix ? `${prefix}.${k}` : k)
  } else if (t === 'array') {
    for (const v of value.slice(0, 50)) schemaOf(v, into, `${prefix}[]`)
  }
}

function reportSchema() {
  const dir = path.join(MIRROR, 'json', 'organization-reports')
  if (!fs.existsSync(dir)) return null

  const acc = {}
  let files = 0
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name)
      if (e.isDirectory()) { walk(full); continue }
      if (!e.name.endsWith('.json')) continue
      let j
      try { j = JSON.parse(fs.readFileSync(full, 'utf8')) } catch { continue }
      schemaOf(j, acc)
      files++
    }
  }
  walk(dir)

  const keys = Object.entries(acc)
    .map(([k, v]) => ({
      path: k,
      types: [...v.types].sort(),
      nullable: v.nullable,
      occurrences: v.seen,
    }))
    .sort((a, b) => a.path.localeCompare(b.path))

  return {
    note: 'shape only, derived from captured payloads. parity target is schema parity - equal key sets, types and nesting - never equal values; the rebuild has its own records.',
    sampledPayloads: files,
    keys,
  }
}

// ---------------------------------------------------------------------------
// write + self-check
// ---------------------------------------------------------------------------
fs.mkdirSync(path.join(OUT, 'forms'), { recursive: true })

const r = routes()
const f = forms()
const s = reportSchema()

fs.writeFileSync(path.join(OUT, 'routes.json'), JSON.stringify(r, null, 2) + '\n')
for (const [name, data] of Object.entries(f)) {
  fs.writeFileSync(path.join(OUT, 'forms', `${name}.json`), JSON.stringify(data, null, 2) + '\n')
}
if (s) fs.writeFileSync(path.join(OUT, 'report-schema.json'), JSON.stringify(s, null, 2) + '\n')

// the gate runs in CI, but a leak should fail here - at the airlock - not at review
const LEAK = [
  { re: /\b[0-9a-f]{32}\b/, what: '32-hex organisation token' },
  { re: /[a-z0-9._%+-]+@(zephyruas|vsdas|ithelps)\.[a-z]{2,}/i, what: 'predecessor e-mail address' },
  { re: /\b(SVK|LUX)-?RP-?\s?[a-z0-9]{8,}/i, what: 'licence number' },
]
let leaks = 0
const scan = dir => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) { scan(full); continue }
    const text = fs.readFileSync(full, 'utf8')
    for (const l of LEAK) {
      if (l.re.test(text)) { console.error(`LEAK  ${path.relative(OUT, full)} — ${l.what}`); leaks++ }
    }
  }
}
scan(OUT)

console.log(JSON.stringify({
  routes: r.routes.length,
  formResources: Object.keys(f).length,
  reportKeys: s ? s.keys.length : 0,
  sampledPayloads: s ? s.sampledPayloads : 0,
  leaks,
}, null, 2))

process.exit(leaks ? 1 : 0)
