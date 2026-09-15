" Autoload module for owner-scoped ghost text rendering and accept

let s:render_state = {} " bufnr -> {request_id, anchor, text, timer}

function! llama#render#init() abort
  if has('textprop')
    if empty(prop_type_get('llama_ghost_text'))
      let hl = hlexists('Comment') ? 'Comment' : ''
      let opts = {'combine': 1}
      if !empty(hl)
        let opts.highlight = hl
      endif
      try
        call prop_type_add('llama_ghost_text', opts)
      catch
      endtry
    endif
  endif
  return {'ok': 1}
endfunction

function! s:do_render(bufnr, request_id, anchor, text) abort
  call llama#render#init()

  " Check if owner changed
  let state = get(s:render_state, a:bufnr, {})
  if empty(state) || state.request_id != a:request_id
    return
  endif

  if has('nvim-0.10') && exists('*luaeval')
    try
      call luaeval("require('llama.buffer').render(_A[1], _A[2], _A[3], _A[4])", [a:bufnr, a:request_id, a:anchor, a:text])
      return
    catch
    endtry
  endif

  if has('textprop')
    " Clear previous prop for this buffer first
    try
      call prop_remove({'type': 'llama_ghost_text', 'bufnr': a:bufnr})
    catch
    endtry

    if !empty(a:text) && bufexists(a:bufnr)
      let lnum = a:anchor.lnum
      let col = a:anchor.col
      let lines = split(a:text, "\n", 1)
      " Add inline prop for first line
      if !empty(lines[0])
        try
          call prop_add(lnum, col, {
                \ 'type': 'llama_ghost_text',
                \ 'text': lines[0],
                \ 'bufnr': a:bufnr
                \ })
        catch
        endtry
      endif
      " Add virtual lines for remaining lines
      for i in range(1, len(lines) - 1)
        if !empty(lines[i])
          try
            call prop_add(lnum + i - 1, 1, {
                  \ 'type': 'llama_ghost_text',
                  \ 'text': lines[i],
                  \ 'text_align': 'below',
                  \ 'bufnr': a:bufnr
                  \ })
          catch
          endtry
        endif
      endfor
    endif
  endif
endfunction

function! llama#render#queue(bufnr, request_id, anchor, text, delay_ms) abort
  let state = get(s:render_state, a:bufnr, {})
  if !empty(get(state, 'timer', 0))
    call timer_stop(state.timer)
  endif

  let state.request_id = a:request_id
  let state.anchor = deepcopy(a:anchor)
  let state.text = a:text
  let state.timer = 0
  let s:render_state[a:bufnr] = state

  if a:delay_ms <= 0
    call s:do_render(a:bufnr, a:request_id, a:anchor, a:text)
  else
    let state.timer = timer_start(a:delay_ms, {-> s:do_render(a:bufnr, a:request_id, a:anchor, a:text)})
  endif
  return {'ok': 1}
endfunction

function! llama#render#clear(bufnr, request_id) abort
  let state = get(s:render_state, a:bufnr, {})
  if empty(state)
    return
  endif

  if a:request_id != 0 && state.request_id != a:request_id
    return
  endif

  if !empty(get(state, 'timer', 0))
    call timer_stop(state.timer)
  endif

  let s:render_state[a:bufnr] = {}

  if has('nvim-0.10') && exists('*luaeval')
    try
      call luaeval("require('llama.buffer').clear(_A[1], _A[2])", [a:bufnr, a:request_id])
    catch
    endtry
  endif

  if has('textprop') && bufexists(a:bufnr)
    try
      call prop_remove({'type': 'llama_ghost_text', 'bufnr': a:bufnr})
    catch
    endtry
  endif
endfunction

function! llama#render#accept(bufnr, request_id, mode) abort
  let state = get(s:render_state, a:bufnr, {})
  if empty(state) || (a:request_id != 0 && state.request_id != a:request_id) || empty(get(state, 'text', ''))
    return {'ok': 0, 'inserted': ''}
  endif

  let full_text = state.text
  let to_insert = full_text

  if a:mode ==# 'line'
    let lines = split(full_text, "\n", 1)
    let to_insert = lines[0]
    if len(lines) > 1
      let remaining = join(lines[1:], "\n")
      let state.text = remaining
    else
      let state.text = ''
    endif
  else
    let state.text = ''
  endif

  " Insert text at cursor anchor
  if bufexists(a:bufnr) && !empty(to_insert)
    let cur_line = getline(state.anchor.lnum)
    let col = state.anchor.col
    let head = cur_line[: col - 2]
    let tail = cur_line[col - 1 :]
    let new_line = head . to_insert . tail
    call setline(state.anchor.lnum, new_line)
  endif

  call llama#render#clear(a:bufnr, a:request_id)
  return {'ok': 1, 'inserted': to_insert}
endfunction

function! llama#render#is_repetitive(text, config) abort
  if empty(a:text) | return 0 | endif
  let max_tokens = get(a:config, 'repeat_max_tokens', 16)
  let max_lines = get(a:config, 'repeat_max_lines', 4)

  " Check line repetitions
  let lines = split(a:text, "\n", 1)
  if len(lines) >= max_lines
    let repeat_count = 1
    for i in range(1, len(lines) - 1)
      if !empty(lines[i]) && lines[i] ==# lines[i-1]
        let repeat_count += 1
        if repeat_count >= max_lines
          return 1
        endif
      else
        let repeat_count = 1
      endif
    endfor
  endif

  " Check token/substring repetitions
  let tokens = split(a:text, '\s\+')
  if len(tokens) >= max_tokens
    let repeat_count = 1
    for i in range(1, len(tokens) - 1)
      if !empty(tokens[i]) && tokens[i] ==# tokens[i-1]
        let repeat_count += 1
        if repeat_count >= max_tokens
          return 1
        endif
      else
        let repeat_count = 1
      endif
    endfor
  endif

  return 0
endfunction
