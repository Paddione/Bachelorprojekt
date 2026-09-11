" Autoload module for per-buffer request lifecycle, transport & retry state machine

let s:requests = {} " bufnr -> request record
let s:next_id = 1

function! s:new_id() abort
  let id = s:next_id
  let s:next_id += 1
  return id
endfunction

function! llama#request#snapshot(bufnr) abort
  let req = get(s:requests, a:bufnr, {})
  if empty(req)
    return {
          \ 'request_id': 0,
          \ 'phase': 'idle',
          \ 'attempt': 0,
          \ 'text': '',
          \ 'cancel_reason': '',
          \ 'last_error': {}
          \ }
  endif
  return {
        \ 'request_id': req.id,
        \ 'phase': req.phase,
        \ 'attempt': req.attempt,
        \ 'text': req.text,
        \ 'cancel_reason': req.cancel_reason,
        \ 'last_error': deepcopy(req.last_error)
        \ }
endfunction

function! llama#request#is_current(bufnr, request_id) abort
  let req = get(s:requests, a:bufnr, {})
  if empty(req) || req.id != a:request_id
    return 0
  endif
  if index(['complete', 'cancelled', 'failed'], req.phase) >= 0
    return 0
  endif
  if bufexists(a:bufnr)
    let cur_tick = getbufvar(a:bufnr, 'changedtick')
    if req.anchor.changedtick != 0 && cur_tick != req.anchor.changedtick
      return 0
    endif
  endif
  return 1
endfunction

function! s:start_job(req) abort
  let cfg = llama#config#current()
  let endpoint = get(a:req.payload, 'endpoint', cfg.endpoint_fim)
  if empty(endpoint) | let endpoint = cfg.endpoint_fim | endif

  let payload_json = json_encode(a:req.payload)
  let req_id = a:req.id

  " Neovim transport check
  if has('nvim-0.10') && exists('*luaeval')
    try
      let spec = {
            \ 'id': req_id,
            \ 'url': endpoint,
            \ 'body': payload_json,
            \ 'timeout_ms': cfg.t_max_predict_ms
            \ }
      let handle = luaeval("require('llama.transport').start(_A)", spec)
      let a:req.job = handle
      let a:req.phase = 'running'
      return
    catch
    endtry
  endif

  " Portable Vim job_start with -i to capture HTTP status header
  let argv = ['curl', '-s', '-i', '-N', '--no-buffer', '-X', 'POST',
        \ '-H', 'Content-Type: application/json',
        \ '-d', payload_json,
        \ endpoint]

  let options = {
        \ 'out_cb': {chan, msg -> llama#request#on_data(req_id, msg)},
        \ 'err_cb': {chan, msg -> llama#request#on_error(req_id, 'transport', msg)},
        \ 'exit_cb': {job, code -> llama#request#on_exit(req_id, {'exit_code': code, 'http_status': 0})},
        \ 'mode': 'raw'
        \ }

  let job = job_start(argv, options)
  let a:req.job = job
  let a:req.phase = 'running'
endfunction

function! llama#request#start(bufnr, payload, opts) abort
  let cfg = llama#config#current()
  call llama#request#cancel(a:bufnr, 'superseded')

  let req_id = s:new_id()
  let anchor = {
        \ 'lnum': get(a:opts, 'lnum', line('.')),
        \ 'col': get(a:opts, 'col', col('.')),
        \ 'changedtick': getbufvar(a:bufnr, 'changedtick')
        \ }

  let req = {
        \ 'id': req_id,
        \ 'bufnr': a:bufnr,
        \ 'path': fnamemodify(bufname(a:bufnr), ':p'),
        \ 'anchor': anchor,
        \ 'payload': deepcopy(a:payload),
        \ 'opts': deepcopy(a:opts),
        \ 'phase': 'scheduled',
        \ 'attempt': 1,
        \ 'job': 0,
        \ 'text': '',
        \ 'cancel_reason': '',
        \ 'last_error': {},
        \ 'stream_state': llama#stream#new(),
        \ 'timer': 0,
        \ 'header_parsed': 0,
        \ 'raw_buf': '',
        \ 'http_status': 0
        \ }

  let s:requests[a:bufnr] = req
  call s:start_job(req)
  return {'ok': 1, 'request_id': req_id, 'error': ''}
endfunction

function! llama#request#on_data(request_id, bytes) abort
  let target_buf = 0
  let req = {}
  for [b, r] in items(s:requests)
    if r.id == a:request_id
      let target_buf = str2nr(b)
      let req = r
      break
    endif
  endfor

  if empty(req) || !llama#request#is_current(target_buf, a:request_id)
    return
  endif

  if req.phase ==# 'running'
    let req.phase = 'streaming'
  endif

  let bytes_to_feed = a:bytes

  if !req.header_parsed
    let req.raw_buf .= a:bytes
    if req.raw_buf =~# '^HTTP/'
      let pos = match(req.raw_buf, '\(\r\?\n\)\{2\}')
      if pos < 0
        return
      endif
      let match_len = len(matchstr(req.raw_buf, '\(\r\?\n\)\{2\}'))
      let header_part = req.raw_buf[: pos - 1]
      let bytes_to_feed = req.raw_buf[pos + match_len :]
      let req.header_parsed = 1
      let req.raw_buf = ''

      let status_str = matchstr(header_part, '^HTTP/\d\.\d \zs\d\+\ze')
      let status = !empty(status_str) ? str2nr(status_str) : 200
      let req.http_status = status

      if status >= 400
        let kind = (status == 408 || status == 429 || status >= 500) ? 'http_transient' : 'http_permanent'
        let req.last_error = {'kind': kind, 'detail': 'HTTP ' . status, 'http_status': status}
        if kind ==# 'http_permanent'
          let req.phase = 'failed'
        endif
        return
      endif
    else
      let req.header_parsed = 1
      let bytes_to_feed = req.raw_buf
      let req.raw_buf = ''
    endif
  endif

  if empty(bytes_to_feed)
    return
  endif

  let feed_res = llama#stream#feed(req.stream_state, bytes_to_feed, 0)
  let req.stream_state = feed_res.state
  let cfg = llama#config#current()

  for ev in feed_res.events
    if ev.type ==# 'delta'
      let req.text .= ev.text
      if llama#render#is_repetitive(req.text, cfg)
        call llama#request#cancel(target_buf, 'repetition')
        return
      else
        call llama#render#queue(target_buf, req.id, req.anchor, req.text, cfg.render_throttle_ms)
      endif
    elseif ev.type ==# 'done'
      let req.phase = 'complete'
    elseif ev.type ==# 'error'
      let req.last_error = {'kind': ev.kind, 'detail': get(ev, 'detail', ''), 'http_status': req.http_status}
      let req.phase = 'failed'
    endif
  endfor
endfunction

function! llama#request#on_error(request_id, kind, detail) abort
  for [b, r] in items(s:requests)
    if r.id == a:request_id
      let r.last_error = {'kind': a:kind, 'detail': a:detail, 'http_status': r.http_status}
      break
    endif
  endfor
endfunction

function! s:retry_job(bufnr, request_id) abort
  let req = get(s:requests, a:bufnr, {})
  if empty(req) || req.id != a:request_id || req.phase !=# 'retry_wait'
    return
  endif
  let req.attempt += 1
  let req.header_parsed = 0
  let req.raw_buf = ''
  let req.stream_state = llama#stream#new()
  call s:start_job(req)
endfunction

function! llama#request#on_exit(request_id, result) abort
  let target_buf = 0
  let req = {}
  for [b, r] in items(s:requests)
    if r.id == a:request_id
      let target_buf = str2nr(b)
      let req = r
      break
    endif
  endfor

  if empty(req) || req.phase ==# 'cancelled'
    return
  endif

  let cfg = llama#config#current()
  let exit_code = get(a:result, 'exit_code', 0)
  let http_status = get(a:result, 'http_status', req.http_status)
  if http_status == 0 | let http_status = req.http_status | endif

  if http_status >= 400 && http_status < 500 && http_status != 408 && http_status != 429
    let req.phase = 'failed'
    let req.last_error = {'kind': 'http_permanent', 'detail': 'HTTP ' . http_status, 'http_status': http_status}
    return
  endif

  if exit_code != 0 || http_status == 408 || http_status == 429 || http_status >= 500
    let kind = (exit_code == 28) ? 'timeout' : ((http_status == 429 || http_status >= 500) ? 'http_transient' : 'transport')
    let req.last_error = {'kind': kind, 'detail': 'exit ' . exit_code . ' http ' . http_status, 'http_status': http_status}

    if req.attempt < cfg.retry_max_attempts
      let req.phase = 'retry_wait'
      let base_delay = cfg.retry_base_ms
      let delay = min([cfg.retry_cap_ms, base_delay * (1  < (req.attempt - 1))])
      let req.timer = timer_start(delay, {-> s:retry_job(target_buf, a:request_id)})
      return
    else
      let req.phase = 'failed'
      return
    endif
  endif

  if req.phase !=# 'failed'
    let req.phase = 'complete'
  endif
endfunction

function! llama#request#cancel(bufnr, reason) abort
  let req = get(s:requests, a:bufnr, {})
  if empty(req) || req.phase ==# 'cancelled' || req.phase ==# 'complete'
    return
  endif

  let req.phase = 'cancelled'
  let req.cancel_reason = a:reason

  if !empty(get(req, 'timer', 0))
    call timer_stop(req.timer)
    let req.timer = 0
  endif

  if !empty(get(req, 'job', 0))
    if type(req.job) == v:t_job
      call job_stop(req.job)
    elseif has('nvim-0.10') && exists('*luaeval')
      try
        call luaeval("require('llama.transport').stop(_A)", req.job)
      catch
      endtry
    endif
    let req.job = 0
  endif

  call llama#render#clear(a:bufnr, req.id)
endfunction

function! llama#request#cancel_all(reason) abort
  for bufnr in keys(s:requests)
    call llama#request#cancel(str2nr(bufnr), a:reason)
  endfor
endfunction

function! llama#request#probe(url, timeout_ms, Callback) abort
  let sec = string(a:timeout_ms / 1000 + 1)
  let argv = ['curl', '-s', '-m', sec, '-w', '\n%{http_code}', a:url]
  let output = []

  let options = {
        \ 'out_cb': {chan, msg -> add(output, msg)},
        \ 'exit_cb': {job, code -> llama#request#_on_probe_exit(code, output, a:Callback)},
        \ 'mode': 'raw'
        \ }

  try
    call job_start(argv, options)
    return {'ok': 1, 'error': ''}
  catch
    return {'ok': 0, 'error': v:exception}
  endtry
endfunction

function! llama#request#_on_probe_exit(code, output, Callback) abort
  if a:code != 0 || empty(a:output)
    call a:Callback({'ok': 0, 'http_status': 0, 'body': '', 'kind': 'transport', 'detail': 'exit ' . a:code})
    return
  endif
  let raw = join(a:output, '')
  let lines = split(raw, '\r\?\n', 1)
  if empty(lines)
    call a:Callback({'ok': 0, 'http_status': 0, 'body': '', 'kind': 'transport', 'detail': 'empty output'})
    return
  endif
  let status_line = lines[-1]
  let http_status = str2nr(status_line)
  let body = (len(lines) > 1) ? join(lines[:-2], "\n") : ''
  call a:Callback({'ok': (http_status >= 200 && http_status < 300), 'http_status': http_status, 'body': body, 'kind': 'ok', 'detail': ''})
endfunction
