" Autoload module for async discovery, status snapshots and presentation

let s:status = {
      \ 'state': 'unknown',
      \ 'endpoint': 'http://127.0.0.1:8094/infill',
      \ 'port': 8094,
      \ 'model': 'qwen38-220k',
      \ 'model_source': 'default',
      \ 'n_ctx': 0,
      \ 'ring': {'chunks': 0, 'bytes': 0},
      \ 'last_error': {},
      \ 'diagnostics': [],
      \ 'updated_at': 0
      \ }

function! llama#status#snapshot() abort
  let snap = deepcopy(s:status)
  if exists('*llama#context#stats')
    let snap.ring = llama#context#stats()
  endif
  return snap
endfunction

function! llama#status#statusline() abort
  try
    let st = s:status.state
    if st ==# 'unknown'
      return ''
    endif
    let icon = (st ==# 'connected') ? '●' : ((st ==# 'probing') ? '○' : '×')
    return '[llama ' . icon . ' ' . s:status.model . ':' . s:status.port . ']'
  catch
    return ''
  endtry
endfunction

function! llama#status#show() abort
  let snap = llama#status#snapshot()
  echo "[llama.vim] Operator Status:"
  echo "  State:        " . snap.state
  echo "  Endpoint:     " . snap.endpoint . " (Port " . snap.port . ")"
  echo "  Model:        " . snap.model . " (" . snap.model_source . ")"
  echo "  Context n_ctx:" . (snap.n_ctx > 0 ? snap.n_ctx : "unknown")
  echo "  Ring Usage:   " . snap.ring.chunks . " chunks (" . snap.ring.bytes . " bytes)"
  if !empty(snap.last_error)
    echo "  Last Error:   " . string(snap.last_error)
  endif
  if !empty(snap.diagnostics)
    echo "  Diagnostics:  " . join(snap.diagnostics, "; ")
  endif
endfunction

function! llama#status#record(event, fields) abort
  if a:event ==# 'error'
    let s:status.last_error = deepcopy(a:fields)
  endif
  let s:status.updated_at = reltimefloat(reltime())
endfunction

function! s:parse_port(url) abort
  let m = matchlist(a:url, ':\(\d\+\)')
  if !empty(m) && !empty(m[1])
    return str2nr(m[1])
  endif
  return 8094
endfunction

function! s:get_base_url(url) abort
  if a:url =~# '/infill$'
    return substitute(a:url, '/infill$', '', '')
  endif
  let m = matchlist(a:url, '^\(https\?://[^/]\+\)')
  if !empty(m) && !empty(m[1])
    return m[1]
  endif
  return 'http://127.0.0.1:8094'
endfunction

function! llama#status#start(config) abort
  let endpoint = get(a:config, 'endpoint_fim', 'http://127.0.0.1:8094/infill')
  let s:status.endpoint = endpoint
  let s:status.port = s:parse_port(endpoint)
  let s:status.state = 'probing'

  let explicit_model = get(a:config, 'model_fim', '')
  if !empty(explicit_model)
    let s:status.model = explicit_model
    let s:status.model_source = 'explicit'
  else
    let s:status.model = 'qwen38-220k'
    let s:status.model_source = 'default'
  endif

  let base_url = s:get_base_url(endpoint)
  let timeout = get(a:config, 'probe_timeout_ms', 1000)

  " 1. Probe health
  call llama#request#probe(base_url . '/health', timeout, {res -> llama#status#_on_health_res(res, base_url, timeout)})
endfunction

function! llama#status#_on_health_res(res, base_url, timeout) abort
  if !a:res.ok
    let s:status.state = 'unreachable'
    let s:status.last_error = {'kind': 'transport', 'detail': 'health probe failed', 'http_status': a:res.http_status}
    return
  endif

  let s:status.state = 'connected'

  " 2. Probe props
  call llama#request#probe(a:base_url . '/props', a:timeout, {res -> llama#status#_on_props_res(res)})

  " 3. Probe models
  call llama#request#probe(a:base_url . '/v1/models', a:timeout, {res -> llama#status#_on_models_res(res)})
endfunction

function! llama#status#_on_props_res(res) abort
  if a:res.ok && !empty(a:res.body)
    try
      let data = json_decode(a:res.body)
      let n_ctx = get(get(data, 'default_generation_settings', {}), 'n_ctx', 0)
      if n_ctx > 0
        let s:status.n_ctx = n_ctx
      endif
    catch
    endtry
  endif
endfunction

function! llama#status#_on_models_res(res) abort
  if !a:res.ok || empty(a:res.body)
    return
  endif

  if s:status.model_source ==# 'explicit'
    " Explicit model wins over discovery
    return
  endif

  try
    let data = json_decode(a:res.body)
    let models = get(data, 'data', [])
    let selected = ''
    for m in models
      let caps = get(m, 'capabilities', [])
      if index(caps, 'infill') >= 0 || index(caps, 'fim') >= 0
        let selected = get(m, 'id', '')
        break
      endif
    endfor

    if !empty(selected)
      let s:status.model = selected
      let s:status.model_source = 'discovered'
    else
      call add(s:status.diagnostics, 'No FIM-capable model found in /v1/models; using default')
    endif
  catch
  endtry
endfunction
