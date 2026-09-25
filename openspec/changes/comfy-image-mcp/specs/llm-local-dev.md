## ADDED Requirements

### Requirement: Image Generation MCP for Muse Code

The repository SHALL provide an MCP server `scripts/comfy-image-mcp/server.mjs` that lets Muse Code generate
images with the local ComfyUI instance. It SHALL listen with Streamable HTTP on `127.0.0.1` (default port
`13008`, env `COMFY_IMAGE_MCP_PORT`), SHALL reject requests without the bearer token from
`COMFY_IMAGE_MCP_TOKEN` before reading the body, and SHALL use only the Node.js standard library plus modules
under `scripts/lib/`. It SHALL expose exactly the tools `image_generate`, `image_result` and `image_status`.
`image_generate` SHALL return a job id without waiting for the image; jobs SHALL run one at a time in FIFO
order with a per-job timeout. `image_result` SHALL wait at most 55 seconds per call and, once the job has
ended, return its status, the written file path, the seed used, and the `git status --porcelain` of that file.
When no seed is given, the server SHALL choose one and report it.

Rationale: one image takes about two minutes on the RTX 3060 Ti (measured 111.64 s for 768x768 with 25 steps,
T900379), longer than an MCP call should block. The start/result split follows the Glimmer worker.

#### Scenario: Unauthenticated requests are rejected

- **GIVEN** the server runs with a token
- **WHEN** a `tools/list` request arrives without a matching `Authorization: Bearer` header
- **THEN** the response status is 401 and no tool is invoked

#### Scenario: A job writes the image into the working tree

- **GIVEN** the server runs against a ComfyUI endpoint that returns a PNG
- **WHEN** `image_generate` is called with an `out_path` inside a Git working tree and `image_result` is polled
- **THEN** the job ends with status `done`, the file exists at `out_path`, and the result reports a seed

### Requirement: Image Output Is Confined to Git Working Trees

`image_generate` SHALL accept `out_path` in WSL form and in Windows form, mapped with the same rules as the
Glimmer worker. It SHALL refuse the call without queueing a job when the parent directory of `out_path` does
not exist or is not inside a Git working tree, and when a file already exists at `out_path` unless
`overwrite` is `true`.

Rationale: every generated asset stays visible as a diff and can be reverted; an existing asset is never
replaced by accident.

#### Scenario: Output outside a Git working tree is refused

- **GIVEN** an `out_path` whose parent directory is not inside a Git working tree
- **WHEN** `image_generate` is called
- **THEN** the call returns `isError: true` and no job is queued

#### Scenario: An existing file is not overwritten by default

- **GIVEN** a file already exists at `out_path`
- **WHEN** `image_generate` is called without `overwrite: true`
- **THEN** the call returns `isError: true` and the file is unchanged

### Requirement: ComfyUI Runs Only While Images Are Requested

ComfyUI SHALL run as the systemd user unit `comfyui` that is not started at login. Before running a job the
server SHALL start the unit when ComfyUI does not answer on its endpoint, and SHALL fail the job when ComfyUI
does not become ready within the start timeout. When the queue has been empty for the idle period (default
15 minutes, env `COMFY_IMAGE_IDLE_MIN`), the server SHALL stop the unit.

Rationale: the model occupies the RTX 3060 Ti and the CPU-resident text encoder occupies about 10 GB RAM;
both should be free when no images are being made.

#### Scenario: The first job starts ComfyUI

- **GIVEN** ComfyUI is not running
- **WHEN** a job is queued
- **THEN** the server runs `systemctl --user start comfyui` before submitting the prompt

#### Scenario: An idle server stops ComfyUI

- **GIVEN** the last job has ended and no job is queued
- **WHEN** the idle period elapses
- **THEN** the server runs `systemctl --user stop comfyui`

### Requirement: Generated Images Can Be Cut Out and Pixelated

The server SHALL post-process an image with `scripts/comfy-image-mcp/postprocess.py` when `transparent` or
`pixelate` is requested, and SHALL keep the unprocessed image as `<name>.raw.png` next to `out_path`.
`transparent` SHALL remove the background and produce an RGBA image. `pixelate` SHALL downscale the longer side
to `size` pixels, reduce the opaque pixels to at most `colors` colours, optionally upscale by the integer
`scale` with nearest-neighbour sampling, and SHALL make the alpha channel binary when the image has one.

Rationale: game sprites need transparency, and pixel art needs a hard grid and a small palette, neither of
which the diffusion model produces by itself.

#### Scenario: Pixelate yields a small palette and a hard alpha

- **GIVEN** an RGBA image with a soft-edged shape
- **WHEN** `postprocess.py` runs with `--pixelate 32 --colors 8`
- **THEN** the longer side of the output is 32 pixels, at most 8 distinct opaque colours remain, and every
  alpha value is 0 or 255

### Requirement: The Image MCP Is Registered Only in Muse Code

`scripts/comfy-image-mcp/install.sh` SHALL register the server as `mcpServers.comfy-image` (`type: "http"`,
URL `http://127.0.0.1:13008/mcp`, bearer header) in the Muse Code settings of WSL and of Windows, preserving
all other keys and writing a backup first. The server SHALL NOT be declared in
`docs/agent-guide/registry/mcp.yaml`.

Rationale: the use case is Muse Code; wiring it into opencode through the registry is a separate decision.

#### Scenario: Registration merges into existing settings

- **GIVEN** a Muse `settings.json` that already declares `mcpServers.glimmer-worker`
- **WHEN** the installer registers the image server against that file
- **THEN** both `glimmer-worker` and `comfy-image` are declared and a backup of the previous file exists
