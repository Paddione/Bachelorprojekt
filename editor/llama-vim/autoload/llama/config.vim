" Autoload module for llama.vim configuration management

let s:defaults = {
      \ 'endpoint_fim': 'http://127.0.0.1:8094/infill',
      \ 'model_fim': 'qwen38-220k',
      \ 'auto_fim': v:true,
      \ 'filetype_exclude': [],
      \ 'path_exclude': ['*.env', '.env*', '*.pem', '*.key', 'id_rsa*', '*secret*'],
      \ 'n_prefix': 512,
      \ 'n_suffix': 64,
      \ 'n_predict': 128,
      \ 'max_context_bytes': 32768,
      \ 'ring_n_chunks': 32,
      \ 'ring_chunk_size': 64,
      \ 'ring_per_file_max': 4,
      \ 'debounce_ms': 150,
      \ 'render_throttle_ms': 16,
      \ 't_connect_ms': 1000,
      \ 't_max_predict_ms': 3000,
      \ 'probe_timeout_ms': 1000,
      \ 'retry_max_attempts': 3,
      \ 'retry_base_ms': 250,
      \ 'retry_cap_ms': 2000,
      \ 'retry_jitter_ms': 100,
      \ 'repeat_max_tokens': 16,
      \ 'repeat_max_lines': 4,
      \ 'lsp_enable': v:true,
      \ 'lsp_deadline_ms': 150,
      \ 'context_callback': ''
      \ }

let s:current_config = {}

function! llama#config#defaults() abort
  return deepcopy(s:defaults)
endfunction

function! s:levenshtein(s, t) abort
  let m = len(a:s)
  let n = len(a:t)
  if m == 0 | return n | endif
  if n == 0 | return m | endif
  let d = []
  for i in range(m + 1)
    let row = []
    for j in range(n + 1)
      call add(row, 0)
    endfor
    call add(d, row)
  endfor
  for i in range(m + 1) | let d[i][0] = i | endfor
  for j in range(n + 1) | let d[0][j] = j | endfor
  for i in range(1, m)
    for j in range(1, n)
      let cost = (a:s[i-1] ==# a:t[j-1]) ? 0 : 1
      let d[i][j] = min([d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + cost])
    endfor
  endfor
  return d[m][n]
endfunction

function! llama#config#load() abort
  let user_config = get(g:, 'llama_config', {})
  let effective = deepcopy(s:defaults)
  let diagnostics = []
  let explicit_keys = keys(user_config)

  for [k, v] in items(user_config)
    if has_key(s:defaults, k)
      let effective[k] = v
    else
      " Check for typo
      let best_match = ''
      let min_dist = 999
      for valid_key in keys(s:defaults)
        let dist = s:levenshtein(k, valid_key)
        if dist < min_dist && dist <= 3
          let min_dist = dist
          let best_match = valid_key
        endif
      endfor
      if !empty(best_match)
        call add(diagnostics, "Unknown key '" . k . "', did you mean '" . best_match . "'?")
      else
        call add(diagnostics, "Unknown key '" . k . "'")
      endif
    endif
  endfor

  " Validate rules
  let ok = 1
  if !empty(diagnostics)
    let ok = 0
    let effective.auto_fim = v:false
  endif
  if effective.retry_base_ms > effective.retry_cap_ms
    let ok = 0
    call add(diagnostics, "retry_base_ms must be <= retry_cap_ms")
  endif
  if effective.endpoint_fim !~# '^https\?://'
    let ok = 0
    call add(diagnostics, "endpoint_fim must start with http:// or https://")
  endif

  let result = {
        \ 'ok': ok,
        \ 'effective': effective,
        \ 'diagnostics': diagnostics,
        \ 'explicit_keys': explicit_keys
        \ }
  let s:current_config = deepcopy(effective)
  return result
endfunction

function! llama#config#current() abort
  if empty(s:current_config)
    call llama#config#load()
  endif
  return deepcopy(s:current_config)
endfunction

function! llama#config#reload() abort
  let old_config = llama#config#current()
  let load_res = llama#config#load()
  if !load_res.ok
    return {
          \ 'ok': 0,
          \ 'effective': old_config,
          \ 'diff': {'changed_keys': [], 'request_incompatible': 0, 'events_changed': 0},
          \ 'diagnostics': load_res.diagnostics,
          \ 'auto_allowed': 0
          \ }
  endif

  let new_config = load_res.effective
  let changed_keys = []
  let req_incomp = 0
  let ev_changed = 0

  for k in keys(s:defaults)
    if get(old_config, k, '') !=# get(new_config, k, '')
      call add(changed_keys, k)
      if index(['endpoint_fim', 'model_fim', 't_connect_ms', 't_max_predict_ms', 'max_context_bytes'], k) >= 0
        let req_incomp = 1
      endif
      if index(['auto_fim', 'filetype_exclude', 'path_exclude', 'debounce_ms'], k) >= 0
        let ev_changed = 1
      endif
    endif
  endfor

  return {
        \ 'ok': 1,
        \ 'effective': new_config,
        \ 'diff': {
        \   'changed_keys': changed_keys,
        \   'request_incompatible': req_incomp,
        \   'events_changed': ev_changed
        \ },
        \ 'diagnostics': load_res.diagnostics,
        \ 'auto_allowed': new_config.auto_fim && empty(load_res.diagnostics)
        \ }
endfunction

function! llama#config#eligibility(bufnr, manual) abort
  let cfg = llama#config#current()

  " Check non-existent buffer
  if !bufexists(a:bufnr)
    return {'allowed': 0, 'reason': 'buffer_not_found'}
  endif

  let bufname = bufname(a:bufnr)
  let buftype = getbufvar(a:bufnr, '&buftype')
  let modifiable = getbufvar(a:bufnr, '&modifiable')
  let filetype = getbufvar(a:bufnr, '&filetype')

  if !empty(buftype) || !modifiable
    return {'allowed': 0, 'reason': 'special_or_nonmodifiable_buffer'}
  endif

  " Check path exclusions (blocks both auto and manual)
  if !empty(bufname)
    let tail = fnamemodify(bufname, ':t')
    for pat in cfg.path_exclude
      if glob2regpat(pat) !=# '' && tail =~? glob2regpat(pat)
        return {'allowed': 0, 'reason': 'path_excluded'}
      endif
    endfor
  endif

  " Check if auto_fim is false
  if !a:manual && !cfg.auto_fim
    return {'allowed': 0, 'reason': 'auto_fim_disabled'}
  endif

  " Check filetype exclusions (only blocks auto if manual=0)
  if !a:manual && index(cfg.filetype_exclude, filetype) >= 0
    return {'allowed': 0, 'reason': 'filetype_excluded'}
  endif

  return {'allowed': 1, 'reason': 'ok'}
endfunction
