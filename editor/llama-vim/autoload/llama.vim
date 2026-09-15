" Public E746-compliant facade for llama.vim

function! llama#fim(manual) abort
  let bufnr = bufnr('%')
  let elig = llama#config#eligibility(bufnr, a:manual)
  if !elig.allowed
    return {'ok': 0, 'error': elig.reason}
  endif

  let cfg = llama#config#current()
  let pos = {'lnum': line('.'), 'col': col('.')}

  let payload = {}
  if exists('*llama#context#build')
    let c_res = llama#context#build(bufnr, pos, cfg)
    if c_res.ok
      let payload = c_res.payload
    endif
  endif

  if empty(payload)
    let lnum = pos.lnum
    let prefix = join(getline(max([1, lnum - cfg.n_prefix]), lnum), "\n")
    let suffix = join(getline(lnum + 1, min([line('$'), lnum + cfg.n_suffix])), "\n")
    let payload = {
          \ 'input_prefix': prefix,
          \ 'input_suffix': suffix,
          \ 'input_extra': [],
          \ 'prompt': prefix,
          \ 'endpoint': cfg.endpoint_fim
          \ }
  endif

  let opts = {'lnum': pos.lnum, 'col': pos.col, 'manual': a:manual}
  return llama#request#start(bufnr, payload, opts)
endfunction

function! llama#fim_cancel() abort
  call llama#request#cancel(bufnr('%'), 'user')
endfunction

function! llama#fim_accept(mode) abort
  let bufnr = bufnr('%')
  let snap = llama#request#snapshot(bufnr)
  return llama#render#accept(bufnr, get(snap, 'request_id', 0), a:mode)
endfunction

function! llama#statusline() abort
  if exists('*llama#status#statusline')
    return llama#status#statusline()
  endif
  return ''
endfunction
