-- lua/plugins/nodectl.lua — lazy.nvim spec for the nodectl node-control layer.
--
-- Install: copy to ~/.config/nvim/lua/plugins/nodectl.lua and add
-- `{ import = 'plugins.nodectl' },` to the require('lazy').setup() table.
-- Requires ../config/nodectl.lua (copy to ~/.config/nvim/lua/config/).
--
-- Plugins (all control the bare-metal node / its clusters from inside nvim):
--   Ramilito/kubectl.nvim      full kubectl view: pods, logs, describe, exec
--   akinsho/toggleterm.nvim    persistent terminals: k9s (fleet/devmesh),
--                              lazygit, devmesh status.sh
--   nvim-telescope/telescope.nvim + plenary.nvim  repo-wide pickers for
--                              manifests, logs, rendered yaml
return {
  {
    'Ramilito/kubectl.nvim',
    cmd = { 'Kubectl', 'Kubectx', 'Kubens' },
    keys = { { '<leader>Nk', ':Kubectl<CR>', desc = 'nodectl: kubectl view' } },
    -- intentionally empty: upstream defaults. Tune via :Kubectl docs, not here.
    opts = {},
    config = function(_, opts)
      local ok, err = pcall(require('kubectl').setup, opts)
      if not ok then
        vim.notify('kubectl.nvim setup failed: ' .. tostring(err), vim.log.levels.WARN, { title = 'nodectl' })
      end
      require('config.nodectl').setup()
    end,
  },

  {
    'akinsho/toggleterm.nvim',
    version = '*',
    cmd = { 'ToggleTerm', 'NodeK9sFleet', 'NodeK9sDevmesh', 'NodeStatus' },
    keys = {
      { '<leader>Nf', desc = 'nodectl: k9s fleet' },
      { '<leader>Nd', desc = 'nodectl: k9s devmesh' },
      { '<leader>Ng', desc = 'nodectl: lazygit' },
      { '<leader>Ns', desc = 'nodectl: devmesh status' },
    },
    opts = {
      open_mapping = false,
      direction = 'float',
      float_opts = { border = 'rounded' },
    },
    config = function(_, opts)
      require('toggleterm').setup(opts)
      local nodectl_cfg = require('config.nodectl')
      -- Native Windows: k9s/lazygit are not installed and status.sh is a Linux
      -- script — the WSL-routed :Node* commands from config/nodectl.lua are the
      -- supported path there. No shadow maps, so the working commands win.
      if nodectl_cfg.is_win then
        nodectl_cfg.setup()
        return
      end
      local Terminal = require('toggleterm.terminal').Terminal
      local float = function(cmd, dir)
        return Terminal:new({ cmd = cmd, dir = dir, direction = 'float', close_on_exit = true })
      end
      local repo = nodectl_cfg.repo_root()
      local k9s_fleet = float('k9s --context fleet')
      local k9s_devmesh = float('k9s --context devmesh')
      local lazygit = float('lazygit', repo)
      local devstatus = float('bash ' .. nodectl_cfg.linux_root .. '/scripts/devmesh/status.sh; exec bash')
      vim.keymap.set('n', '<leader>Nf', function() k9s_fleet:toggle() end,
        { desc = 'nodectl: k9s fleet', silent = true })
      vim.keymap.set('n', '<leader>Nd', function() k9s_devmesh:toggle() end,
        { desc = 'nodectl: k9s devmesh', silent = true })
      vim.keymap.set('n', '<leader>Ng', function() lazygit:toggle() end,
        { desc = 'nodectl: lazygit', silent = true })
      vim.keymap.set('n', '<leader>Ns', function() devstatus:toggle() end,
        { desc = 'nodectl: devmesh status', silent = true })
      require('config.nodectl').setup()
    end,
  },

  {
    'nvim-telescope/telescope.nvim',
    branch = 'master',
    dependencies = { 'nvim-lua/plenary.nvim' },
    cmd = { 'Telescope' },
    keys = {
      { '<leader>N/', desc = 'nodectl: grep repo' },
      { '<leader>Nm', desc = 'nodectl: find manifests' },
    },
    opts = {},
    config = function(_, opts)
      require('telescope').setup(opts)
      local builtin = require('telescope.builtin')
      -- repo_root(): UNC checkout on native Windows, ~/Bachelorprojekt
      -- elsewhere, nil (= cwd) when neither exists. Never runs silently
      -- against an unrelated directory.
      local repo = require('config.nodectl').repo_root()
      vim.keymap.set('n', '<leader>N/', function() builtin.live_grep({ cwd = repo }) end,
        { desc = 'nodectl: grep repo', silent = true })
      vim.keymap.set('n', '<leader>Nm', function()
        builtin.find_files({ cwd = repo, find_command = { 'rg', '--files', '-g', '*.yaml', '-g', '*.yml' } })
      end, { desc = 'nodectl: find manifests', silent = true })
    end,
  },
}
