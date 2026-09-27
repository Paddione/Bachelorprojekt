-- Buffer-based Git-root resolution (T900655).
-- Never falls back to a foreign or stale directory, never changes CWD.
local M = {}

--- Resolve the repository top level for the current buffer.
--- @return string|nil
function M.root()
  local bufnr = 0
  local path = vim.api.nvim_buf_get_name(bufnr)
  local buftype = vim.bo[bufnr].buftype

  if path == '' or buftype ~= '' then
    vim.notify('gitroot: no project (unnamed or non-file buffer)', vim.log.levels.WARN)
    return nil
  end

  local dir = vim.fn.fnamemodify(path, ':p:h')
  local cmd = { 'git', '-C', dir, 'rev-parse', '--show-toplevel' }
  local ok, result = pcall(function()
    return vim.system(cmd, { text = true, timeout = 3000 }):wait()
  end)

  if not ok or result == nil or result.code ~= 0 then
    vim.notify('gitroot: no project (not inside a git checkout)', vim.log.levels.WARN)
    return nil
  end

  local top = vim.trim(result.stdout or '')
  if top == '' then
    vim.notify('gitroot: no project (empty git output)', vim.log.levels.WARN)
    return nil
  end

  return top
end

return M
