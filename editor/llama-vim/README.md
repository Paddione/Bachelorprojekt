# llama.vim — Repository-owned Vim FIM Integration

`llama.vim` provides progressive, local Fill-In-the-Middle (FIM) code completion for Vim 9.1+ and Neovim 0.10+.

## Prerequisites and Compatibility

- **Vim 9.1+** compiled with `+job`, `+timers`, `+textprop`, and `+channel`.
- **curl** available in `$PATH`.
- **Neovim 0.10+** (optional; native `vim.system` and extmark rendering adapter).
- **llama.cpp / Local LLM Server**: local FIM endpoint running on loopback (default: `http://127.0.0.1:8094/infill`).

Note: Installation of `llama.vim` does not install an editor, LLM server, or GPU drivers, and does not start/stop/switch servers.

## Quick Start & Installation

Run the explicit installer script from the repository root:

```bash
# Preview installation (dry-run)
bash scripts/vim/install-llama.sh --install --dry-run

# Install package in copy mode (default)
bash scripts/vim/install-llama.sh --install

# Install package in link mode (symlink to repository source)
bash scripts/vim/install-llama.sh --install --mode link

# Preview removal
bash scripts/vim/install-llama.sh --remove --dry-run

# Remove package and restore configuration
bash scripts/vim/install-llama.sh --remove
```

The installer targets `$HOME/.vim/pack/bachelorprojekt/opt/llama-vim` and adds a marked loader block to `$HOME/.vimrc` (backing up an existing `.vimrc` before modification).

## Configuration

Set options in `g:llama_config` in your `.vimrc`:

```vim
let g:llama_config = {
      \ 'endpoint_fim': 'http://127.0.0.1:8094/infill',
      \ 'model_fim': 'qwen38-220k',
      \ 'auto_fim': v:true,
      \ 'filetype_exclude': ['markdown', 'text'],
      \ 'path_exclude': ['*.env', '.env*', '*.pem', '*.key', 'id_rsa*', '*secret*'],
      \ 'n_prefix': 512,
      \ 'n_suffix': 64,
      \ 'ring_n_chunks': 32,
      \ 'debounce_ms': 150
      \ }
```

### Commands

| Command | Action |
|---|---|
| `:LlamaEnable` | Enable auto-FIM autocommands and start background health discovery |
| `:LlamaDisable` | Disable auto-FIM autocommands and cancel active requests/timers |
| `:LlamaFim` | Trigger manual FIM completion at cursor position |
| `:LlamaCancel` | Cancel current FIM request in current buffer |
| `:LlamaAccept` | Accept full ghost text completion at cursor |
| `:LlamaAcceptLine` | Accept first line of ghost text completion |
| `:LlamaReloadConfig` | Reload configuration diff transactionally |
| `:LlamaStatus` | Display operator status snapshot |

### Statusline Integration

Add the side-effect-free statusline function to your `'statusline'`:

```vim
set statusline+=%{llama#statusline()}
```

## Documentation & Provenance

- See [UPSTREAM.md](UPSTREAM.md) for provenance details and upstream synchronization procedures.
- See [docs/dev/llama-vim.md](../../docs/dev/llama-vim.md) for operation, troubleshooting, and developer reference.
