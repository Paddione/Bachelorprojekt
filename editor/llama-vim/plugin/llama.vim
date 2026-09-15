" Top-level plugin entry point for llama.vim

if exists('g:loaded_repo_llama_vim')
  finish
endif
let g:loaded_repo_llama_vim = 1

function! s:has_capabilities() abort
  if exists('g:llama_capability_override')
    let ov = g:llama_capability_override
    if type(ov) == v:t_dict
      if get(ov, 'job', 1) == 0 || get(ov, 'textprop', 1) == 0 || get(ov, 'timers', 1) == 0
        return 0
      endif
    endif
  endif

  if !executable('curl')
    return 0
  endif

  if has('nvim-0.10')
    return 1
  endif

  if has('job') && has('timers') && has('textprop') && has('channel')
    return 1
  endif

  return 0
endfunction

let s:auto_timer = 0

function! s:trigger_auto_fim() abort
  if s:auto_timer != 0
    call timer_stop(s:auto_timer)
    let s:auto_timer = 0
  endif
  let cfg = llama#config#current()
  if !cfg.auto_fim
    return
  endif
  let delay = cfg.debounce_ms
  let s:auto_timer = timer_start(delay, {-> llama#fim(0)})
endfunction

function! s:setup_autocmds() abort
  augroup LlamaVimGroup
    autocmd!
    if s:has_capabilities()
      autocmd TextChangedI * call s:trigger_auto_fim()
      autocmd CursorMovedI * call s:trigger_auto_fim()
      autocmd InsertLeavePre * call llama#fim_cancel()
    endif
  augroup END
endfunction

function! s:cmd_enable() abort
  let cfg = llama#config#current()
  call s:setup_autocmds()
  try
    call llama#context#on_config(cfg)
  catch
  endtry
  try
    call llama#status#start(cfg)
  catch
  endtry
  echo "[llama.vim] Enabled"
endfunction

function! s:cmd_disable() abort
  call llama#request#cancel_all('disabled')
  augroup LlamaVimGroup
    autocmd!
  augroup END
  echo "[llama.vim] Disabled"
endfunction

function! s:cmd_reload() abort
  let reload_res = llama#config#reload()
  if !reload_res.ok
    echohl WarningMsg
    echo "[llama.vim] Reload failed: " . join(reload_res.diagnostics, "; ")
    echohl None
    return
  endif

  let diff = reload_res.diff
  if diff.request_incompatible
    call llama#request#cancel_all('config_reload')
  endif
  if diff.events_changed
    call s:setup_autocmds()
  endif

  let cfg = reload_res.effective
  try
    call llama#context#on_config(cfg)
  catch
  endtry
  try
    call llama#status#start(cfg)
  catch
  endtry

  echo "[llama.vim] Configuration reloaded"
endfunction

function! s:cmd_status() abort
  try
    call llama#status#show()
  catch
    let bufnr = bufnr('%')
    let snap = llama#request#snapshot(bufnr)
    let cfg = llama#config#current()
    echo "[llama.vim] Status:"
    echo "  Endpoint: " . cfg.endpoint_fim
    echo "  Model:    " . cfg.model_fim
    echo "  Phase:    " . snap.phase
  endtry
endfunction

command! -nargs=0 LlamaEnable call s:cmd_enable()
command! -nargs=0 LlamaDisable call s:cmd_disable()
command! -nargs=0 LlamaFim call llama#fim(1)
command! -nargs=0 LlamaCancel call llama#fim_cancel()
command! -nargs=0 LlamaAccept call llama#fim_accept('all')
command! -nargs=0 LlamaAcceptLine call llama#fim_accept('line')
command! -nargs=0 LlamaReloadConfig call s:cmd_reload()
command! -nargs=0 LlamaStatus call s:cmd_status()

call s:setup_autocmds()
