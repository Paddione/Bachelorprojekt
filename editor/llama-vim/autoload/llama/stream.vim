" Autoload module for incremental SSE / NDJSON / final JSON streaming parser

function! llama#stream#new() abort
  return {
        \ 'buf': '',
        \ 'framing': 'unknown',
        \ 'done': 0,
        \ 'diagnostics': []
        \ }
endfunction

function! s:extract_content(obj) abort
  if type(a:obj) != v:t_dict
    return ''
  endif
  let res = ''
  if has_key(a:obj, 'content') && type(a:obj.content) == v:t_string
    let res .= a:obj.content
  endif
  if has_key(a:obj, 'completion') && type(a:obj.completion) == v:t_string
    let res .= a:obj.completion
  endif
  if !empty(res)
    return res
  endif
  if has_key(a:obj, 'choices') && type(a:obj.choices) == v:t_list && !empty(a:obj.choices)
    let choice = a:obj.choices[0]
    if type(choice) == v:t_dict
      if has_key(choice, 'delta') && type(choice.delta) == v:t_dict && has_key(choice.delta, 'content')
        return choice.delta.content
      endif
      if has_key(choice, 'text') && type(choice.text) == v:t_string
        return choice.text
      endif
    endif
  endif
  return ''
endfunction

function! llama#stream#feed(state, bytes, eof) abort
  let st = deepcopy(a:state)
  let events = []
  let diagnostics = []
  let st.buf .= a:bytes

  if st.done
    return {'state': st, 'events': events, 'diagnostics': diagnostics}
  endif

  " Detect framing if unknown
  if st.framing ==# 'unknown'
    let trimmed = substitute(st.buf, '^\s\+', '', '')
    if trimmed =~# '^data:' || trimmed =~# '^:'
      let st.framing = 'sse'
    elseif trimmed =~# '^{'
      " Could be NDJSON or final JSON
      if a:eof || st.buf =~# '\n'
        let st.framing = (st.buf =~# '\n.*{' || (!a:eof && st.buf =~# '\n')) ? 'ndjson' : 'json'
      endif
    endif
  endif

  if st.framing ==# 'sse'
    " SSE parser: look for \n\n or \r\n\r\n
    while 1
      let pos = match(st.buf, '\(\r\?\n\)\{2\}')
      if pos < 0
        break
      endif
      let match_len = len(matchstr(st.buf, '\(\r\?\n\)\{2\}'))
      let record = st.buf[: pos - 1]
      let st.buf = st.buf[pos + match_len :]

      let data_lines = []
      for line in split(record, '\r\?\n', 1)
        let line = substitute(line, '^\s\+', '', '')
        if line =~# '^:' || empty(line)
          " comment or empty line, ignore
          continue
        elseif line =~# '^data:'
          let d = substitute(line, '^data:\s*', '', '')
          call add(data_lines, d)
        endif
      endfor

      for d in data_lines
        if d ==# '[DONE]'
          let st.done = 1
          call add(events, {'type': 'done'})
          break
        else
          try
            let parsed = json_decode(d)
            let text = s:extract_content(parsed)
            if !empty(text)
              call add(events, {'type': 'delta', 'text': text})
            endif
          catch
            call add(events, {'type': 'error', 'kind': 'protocol', 'detail': 'malformed JSON in sse: ' . v:exception})
          endtry
        endif
      endfor

      if st.done
        break
      endif
    endwhile
  elseif st.framing ==# 'ndjson'
    while 1
      let pos = stridx(st.buf, "\n")
      if pos < 0
        break
      endif
      let line = st.buf[: pos - 1]
      let st.buf = st.buf[pos + 1 :]
      let line = substitute(line, '^\s\+', '', '')
      if empty(line) | continue | endif
      try
        let parsed = json_decode(line)
        let text = s:extract_content(parsed)
        if !empty(text)
          call add(events, {'type': 'delta', 'text': text})
        endif
      catch
        call add(events, {'type': 'error', 'kind': 'protocol', 'detail': 'malformed JSON in ndjson'})
      endtry
    endwhile
  elseif st.framing ==# 'json' || (a:eof && !empty(st.buf))
    if a:eof
      try
        let parsed = json_decode(st.buf)
        let text = s:extract_content(parsed)
        if !empty(text)
          call add(events, {'type': 'delta', 'text': text})
        endif
        let st.done = 1
        call add(events, {'type': 'done'})
        let st.buf = ''
      catch
        call add(events, {'type': 'error', 'kind': 'protocol', 'detail': 'malformed JSON'})
      endtry
    endif
  endif

  if a:eof && !st.done
    let st.done = 1
    call add(events, {'type': 'done'})
  endif

  return {'state': st, 'events': events, 'diagnostics': diagnostics}
endfunction
