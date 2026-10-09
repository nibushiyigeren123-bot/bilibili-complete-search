from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json

root = Path(__file__).resolve().parent
extension = root / "extension"
manifest = json.loads((extension / "manifest.json").read_text(encoding="utf-8"))
output = root / f"B站搜索完整包含_v{manifest['version']}.zip"
with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
    for file in sorted(extension.iterdir()):
        if file.is_file():
            archive.write(file, "extension/" + file.name)
with ZipFile(output) as archive:
    assert archive.testzip() is None
    assert "extension/manifest.json" in archive.namelist()
    print(json.dumps({"path": str(output), "bytes": output.stat().st_size, "files": len(archive.namelist())}, ensure_ascii=False))
