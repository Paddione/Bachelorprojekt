" Autoload module for context providers, eligibility and bounded cross-file ring

let s:ring = {} " canonical_path -> list of chunk dicts
let s:extra_chunks = {} " bufnr -> list of extra chunk dicts

function! s:canonical_path(bufnr) abort
  let name = bufname(a:bufnr)
  if empty(name) | return '' | endif
  return resolve(fnamemodify(name, ':p'))
endfunction

function! llama#context#remember(bufnr) abort
  let cfg = llama#config#current()
  let elig = llama#config#eligibility(a:bufnr, 1)
  if !elig.allowed
    return
  endif

  let path = s:canonical_path(a:bufnr)
  if empty(path)
    return
  endif

  let lines = getbufline(a:bufnr, 1, '$')
  if empty(lines)
    return
  endif

  let text = join(lines, "\n")
  let hash = sha256(text)
  let total_bytes = len(text)

  let chunk = {
        \ 'path': path,
        \ 'hash': hash,
        \ 'text': text,
        \ 'source': 'ring',
        \ 'priority': 1,
        \ 'bytes': total_bytes,
        \ 'timestamp': reltimefloat(reltime())
        \ }

  if !has_key(s:ring, path)
    let s:ring[path] = []
  endif

  " Deduplicate identical hash
  for existing in s:ring[path]
    if existing.hash ==# hash
      return
    endif
  endfor

  call add(s:ring[path], chunk)

  " Enforce per-file max
  let per_file_max = get(cfg, 'ring_per_file_max', 4)
  if len(s:ring[path]) > per_file_max
    let s:ring[path] = s:ring[path][-per_file_max :]
  endif

  " Enforce total max ring chunks across files
  let total_max = get(cfg, 'ring_n_chunks', 32)
  let all_chunks = []
  for p in keys(s:ring)
    for c in s:ring[p]
      call add(all_chunks, c)
    endfor
  endfor

  if len(all_chunks) > total_max
    " Trim oldest chunks
    call sort(all_chunks, {a, b -> a.timestamp > b.timestamp ? 1 : -1})
    let keep = all_chunks[-total_max :]
    let s:ring = {}
    for c in keep
      if !has_key(s:ring, c.path)
        let s:ring[c.path] = []
      endif
      call add(s:ring[c.path], c)
    endfor
  endif
endfunction

function! llama#context#add_extra(bufnr, chunks) abort
  if !has_key(s:extra_chunks, a:bufnr)
    let s:extra_chunks[a:bufnr] = []
  endif
  for c in a:chunks
    call add(s:extra_chunks[a:bufnr], deepcopy(c))
  endfor
endfunction

function! llama#context#stats() abort
  let n_chunks = 0
  let n_bytes = 0
  for p in keys(s:ring)
    for c in s:ring[p]
      let n_chunks += 1
      let n_bytes += get(c, 'bytes', len(get(c, 'text', '')))
    endfor
  endfor
  return {'chunks': n_chunks, 'bytes': n_bytes}
endfunction

function! llama#context#on_config(config) abort
  " Prune ring according to new exclusions or limits
  let path_exclude = get(a:config, 'path_exclude', [])
  for path in keys(s:ring)
    let tail = fnamemodify(path, ':t')
    let excluded = 0
    for pat in path_exclude
      if glob2regpat(pat) !=# '' && tail =~? glob2regpat(pat)
        let excluded = 1
        break
      endif
    endfor
    if excluded
      unlet s:ring[path]
    endif
  endfor
endfunction

function! s:find_enclosing_structure(lines, lnum, filetype) abort
  let sig_line = -1
  let pat = ''
  if index(['typescript', 'javascript', 'typescriptreact', 'javascriptreact'], a:filetype) >= 0
    let pat = '^\s*\(export\s\+\|async\s\+\)*function\s\+\w\+\|^\s*\w\+\s*=\s*\(async\s*\)\?(.*)\s*=>'
  elseif a:filetype ==# 'python'
    let pat = '^\s*\(async\s\+\)\?def\s\+\w\+\|^\s*class\s\+\w\+'
  elseif a:filetype ==# 'lua'
    let pat = '^\s*\(local\s\+\)\?function\s\+\w\+'
  elseif index(['sh', 'bash', 'zsh'], a:filetype) >= 0
    let pat = '^\s*\(function\s\+\)\?\w\+\s*()\s*{'
  endif

  if !empty(pat)
    for idx in range(a:lnum - 1, 0, -1)
      if idx < len(a:lines) && a:lines[idx] =~# pat
        let sig_line = idx + 1
        break
      endif
    endfor
  endif
  return sig_line
endfunction

function! llama#context#build(bufnr, position, config) abort
  let lnum = a:position.lnum
  let col = a:position.col
  let filetype = getbufvar(a:bufnr, '&filetype')
  let lines = getbufline(a:bufnr, 1, '$')

  let n_prefix = get(a:config, 'n_prefix', 512)
  let n_suffix = get(a:config, 'n_suffix', 64)
  let max_bytes = get(a:config, 'max_context_bytes', 32768)

  " Determine prefix start line
  let start_line = max([1, lnum - n_prefix])
  let sig_line = s:find_enclosing_structure(lines, lnum, filetype)
  if sig_line > 0 && sig_line < start_line
    let start_line = sig_line
  endif

  let safe_lnum = min([len(lines), lnum])
  let prefix_lines = (safe_lnum >= start_line && !empty(lines)) ? lines[start_line - 1 : safe_lnum - 1] : []

  " Truncate current line at cursor col
  if !empty(prefix_lines)
    let cur_line = prefix_lines[-1]
    let prefix_lines[-1] = cur_line[: col - 2]
  endif
  let input_prefix = join(prefix_lines, "\n")

  let suffix_lines = (safe_lnum < len(lines)) ? lines[safe_lnum : min([len(lines), safe_lnum + n_suffix]) - 1] : []
  if safe_lnum <= len(lines) && !empty(lines)
    let cur_line = lines[safe_lnum - 1]
    let suffix_rest = cur_line[col - 1 :]
    if !empty(suffix_rest)
      call insert(suffix_lines, suffix_rest, 0)
    endif
  endif
  let input_suffix = join(suffix_lines, "\n")

  " Assemble extra chunks
  let input_extra = []
  let current_path = s:canonical_path(a:bufnr)

  " 1. Add extra chunks from LSP / Vim callback (definition, reference)
  let extras = get(s:extra_chunks, a:bufnr, [])
  for ex in extras
    call add(input_extra, {
          \ 'filename': get(ex, 'path', ''),
          \ 'text': get(ex, 'text', ''),
          \ 'source': get(ex, 'source', 'lsp_definition')
          \ })
  endfor

  " 2. Add ring chunks from other files
  for path in keys(s:ring)
    if path !=# current_path
      for chunk in s:ring[path]
        call add(input_extra, {
              \ 'filename': chunk.path,
              \ 'text': chunk.text,
              \ 'source': 'ring'
              \ })
      endfor
    endif
  endfor

  " Sort input_extra so definition / reference chunks rank above ring chunks
  call sort(input_extra, {a, b -> (a.source =~# 'lsp' ? 0 : 1) - (b.source =~# 'lsp' ? 0 : 1)})

  " Optional Vim callback execution
  let cb = get(a:config, 'context_callback', '')
  if !empty(cb) && exists('*' . cb)
    try
      let cb_res = call(cb, [a:bufnr, a:position, max_bytes])
      if type(cb_res) == v:t_list
        for item in cb_res
          if type(item) == v:t_dict
            call add(input_extra, {
                  \ 'filename': get(item, 'path', ''),
                  \ 'text': get(item, 'text', ''),
                  \ 'source': 'callback'
                  \ })
          endif
        endfor
      endif
    catch
    endtry
  endif

  let payload = {
        \ 'input_prefix': input_prefix,
        \ 'input_suffix': input_suffix,
        \ 'input_extra': input_extra,
        \ 'prompt': input_prefix,
        \ 'endpoint': get(a:config, 'endpoint_fim', '')
        \ }

  return {
        \ 'ok': 1,
        \ 'payload': payload,
        \ 'diagnostics': []
        \ }
endfunction
