"""Build the buyer ZIP from app/ plus a hash manifest. Local only: never uploads or publishes.
Usage: python3 tools/build-release.py 1.0.0-review
"""
from pathlib import Path
import hashlib, json, sys, zipfile
root = Path(__file__).resolve().parent.parent
app = root / 'app'
version = sys.argv[1] if len(sys.argv) > 1 else '0.0.0-review'
dist = root / 'dist'; dist.mkdir(exist_ok=True)
archive = dist / f'PrompterPro-{version}.zip'
files = sorted(p for p in app.rglob('*') if p.is_file() and p.name != '.DS_Store')
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in files:
        info = zipfile.ZipInfo('PrompterPro/' + str(p.relative_to(app)), date_time=(2026, 10, 19, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        z.writestr(info, p.read_bytes())
manifest = {'version': version, 'approved_for_sale': False,
            'files': {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files},
            'zip_sha256': hashlib.sha256(archive.read_bytes()).hexdigest()}
(dist / f'PrompterPro-{version}.manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(archive); print(manifest['zip_sha256'])
