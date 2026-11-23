"""Package the public OJS Galley Studio release from its product source."""

import argparse
from io import BytesIO
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

RELEASE_FILES = (
    "README.md",
    "LICENSE.txt",
    "make-galleys.py",
    "register-galleys.php",
    "article-template.html",
)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    args = parser.parse_args()
    output = Path(__file__).resolve().parents[1] / "tools/ojs-galley-studio.zip"
    contents = BytesIO()
    with ZipFile(contents, "w") as archive:
        for name in RELEASE_FILES:
            archive.writestr(ZipInfo(name), (args.source / name).read_bytes(), compress_type=ZIP_DEFLATED)
    output.write_bytes(contents.getvalue())
    print(f"Packaged {len(RELEASE_FILES)} Galley Studio files.")
