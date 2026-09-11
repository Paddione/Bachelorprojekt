-- Neovim 0.10+ vim.system transport adapter

local M = {}

function M.start(spec)
  if not vim.system then
    error("vim.system is not available in this Neovim version")
  end

  local req_id = spec.id
  local url = spec.url
  local body = spec.body

  local argv = {
    "curl", "-s", "-i", "-N", "--no-buffer",
    "-X", "POST",
    "-H", "Content-Type: application/json",
    "-d", body,
    url
  }

  local obj = vim.system(argv, {
    stdout = function(err, data)
      if data and #data > 0 then
        vim.schedule(function()
          vim.fn["llama#request#on_data"](req_id, data)
        end)
      end
    end,
    stderr = function(err, data)
      if data and #data > 0 then
        vim.schedule(function()
          vim.fn["llama#request#on_error"](req_id, "transport", data)
        end)
      end
    end
  }, function(out)
    vim.schedule(function()
      vim.fn["llama#request#on_exit"](req_id, {
        exit_code = out.code or 0,
        http_status = 0
      })
    end)
  end)

  return obj
end

function M.stop(handle)
  if handle and handle.kill then
    pcall(function() handle:kill(15) end)
  end
end

return M
