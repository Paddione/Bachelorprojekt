from fastapi import FastAPI, UploadFile, File, Query, HTTPException
from fastapi.responses import Response
import subprocess, tempfile, os, shutil

app = FastAPI()

@app.post("/rig")
async def rig(
    glb: UploadFile = File(...),
    method: str = Query("blender", regex="^(blender|mixamo)$"),
):
    with tempfile.TemporaryDirectory() as tmp:
        input_path = os.path.join(tmp, "input.glb")
        output_path = os.path.join(tmp, "output.glb")
        with open(input_path, "wb") as f:
            f.write(await glb.read())

        if method == "blender":
            _rig_blender(input_path, output_path)
        else:
            _rig_mixamo(input_path, output_path)

        with open(output_path, "rb") as f:
            return Response(content=f.read(), media_type="model/gltf-binary")

def _rig_blender(input_path: str, output_path: str):
    script = os.path.join(os.path.dirname(__file__), "rig_for_mixamo.py")
    result = subprocess.run(
        ["blender", "--background", "--python", script,
         "--", input_path, output_path],
        capture_output=True, text=True, timeout=120,
    )
    if result.returncode != 0 or not os.path.exists(output_path):
        raise HTTPException(500, f"Blender rigging failed: {result.stderr[-500:]}")

def _rig_mixamo(input_path: str, output_path: str):
    # Playwright-Automation gegen mixamo.com
    # Erfordert MIXAMO_EMAIL + MIXAMO_PASSWORD in Env
    raise HTTPException(501, "Mixamo automation not yet implemented")
