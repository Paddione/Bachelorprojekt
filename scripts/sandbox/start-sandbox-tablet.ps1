# Devmesh Python Sandbox Worker on pk-tablet
$env:PYTHONPATH = "C:\Users\pkorc\devmesh-sandbox;C:\Users\pkorc\devmesh-sandbox\components\python-sandbox"
Set-Location "C:\Users\pkorc\devmesh-sandbox"
uv run --python C:\Users\pkorc\AppData\Local\Programs\Python\Python313\python.exe --with fastapi,uvicorn,pydantic,pytest python -m uvicorn components.python_sandbox.src.server:app --host 0.0.0.0 --port 8088
