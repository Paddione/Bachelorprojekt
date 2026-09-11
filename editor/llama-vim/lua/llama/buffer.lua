-- Neovim 0.10+ buffer attachment, extmark rendering and LSP enrichment

local M = {}
local ns_id = nil

local function get_ns()
  if not ns_id and vim.api and vim.api.nvim_create_namespace then
    ns_id = vim.api.nvim_create_namespace("llama_ghost_text")
  end
  return ns_id
end

function M.attach(bufnr, opts)
  if not vim.api or not vim.api.nvim_buf_is_valid(bufnr) then
    return false
  end
  return true
end

function M.detach(bufnr)
  return true
end

function M.collect_lsp(bufnr, cursor, deadline_ms, callback)
  local chunks = {}
  if not vim.lsp or not vim.lsp.get_active_clients then
    callback(chunks)
    return
  end

  local clients = vim.lsp.get_active_clients({ bufnr = bufnr })
  if #clients == 0 then
    callback(chunks)
    return
  end

  -- Fallback if LSP request not completed within deadline
  local timer = vim.defer_fn(function()
    callback(chunks)
  end, deadline_ms)

  -- Query LSP definitions
  local params = vim.lsp.util.make_position_params()
  vim.lsp.buf_request(bufnr, 'textDocument/definition', params, function(err, result, ctx, config)
    pcall(function() timer:stop() end)
    if not err and result then
      local loc = result[1] or result
      if loc and loc.uri then
        local path = vim.uri_to_fname(loc.uri)
        table.insert(chunks, {
          source = 'lsp_definition',
          path = path,
          text = '',
          priority = 10
        })
      end
    end
    callback(chunks)
  end)
end

function M.render(bufnr, request_id, anchor, text)
  if not vim.api or not vim.api.nvim_buf_is_valid(bufnr) then
    return
  end

  local ns = get_ns()
  if not ns then return end

  M.clear(bufnr, request_id)

  if not text or text == "" then return end

  local lines = vim.split(text, "\n", { plain = true })
  local lnum = anchor.lnum - 1
  local col = anchor.col - 1

  if lines[1] and #lines[1] > 0 then
    pcall(vim.api.nvim_buf_set_extmark, bufnr, ns, lnum, col, {
      virt_text = { { lines[1], "Comment" } },
      virt_text_pos = "overlay",
      hl_mode = "combine",
    })
  end

  for i = 2, #lines do
    if lines[i] and #lines[i] > 0 then
      pcall(vim.api.nvim_buf_set_extmark, bufnr, ns, lnum + i - 1, 0, {
        virt_lines = { { { lines[i], "Comment" } } },
        hl_mode = "combine",
      })
    end
  end
end

function M.clear(bufnr, request_id)
  if not vim.api or not vim.api.nvim_buf_is_valid(bufnr) then
    return
  end
  local ns = get_ns()
  if ns then
    pcall(vim.api.nvim_buf_clear_namespace, bufnr, ns, 0, -1)
  end
end

return M
