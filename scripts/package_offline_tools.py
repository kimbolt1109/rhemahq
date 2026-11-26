"""Rebuild the two offline browser tool ZIPs served in tools/."""
import json
from io import BytesIO
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

SITE = Path(__file__).resolve().parents[1]
COMMON = (
    "assets/base.css",
    "assets/workbench.css",
    "assets/fonts/geist-latin.woff2",
    "assets/fonts/geist-OFL.txt",
    "assets/fonts/newsreader-latin.woff2",
    "assets/fonts/newsreader-OFL.txt",
)
TOOLS = (
    ("fulfillment", "ledger", (
        "assets/workbenches/fulfillment.js",
        "assets/invoice-mapping.css",
        "tools/ledger/vendor/xlsx.full.min.js",
        "tools/ledger/vendor/LICENSE",
    )),
    ("learning", "moodle", ("assets/workbenches/learning.js",)),
)


def package_tool(context, directory, extra):
    product = json.loads((SITE / f"src/domain/{context}/offer.json").read_text(encoding="utf-8"))
    entry = f"tools/{directory}/index.html"
    readme = (
        f"{product['name']}\n\n"
        f"Extract the entire ZIP, then open {entry} in a current browser.\n"
        "Keep the folders together. Load a sample or choose your own files to begin.\n"
        "The tool processes files offline. See LICENSE.txt for evaluation and commercial terms.\n"
        "Support: support@rhemahq.com\n"
    )
    destination = SITE / "tools" / product["archive"]
    files = {
        "README.txt": readme.encode("utf-8"),
        "LICENSE.txt": (SITE / "tools/LICENSE.txt").read_bytes(),
        **{name: (SITE / name).read_bytes() for name in (entry, *COMMON, *extra)},
    }
    contents = BytesIO()
    with ZipFile(contents, "w") as archive:
        for name, data in files.items():
            archive.writestr(ZipInfo(name), data, compress_type=ZIP_DEFLATED, compresslevel=9)
    destination.write_bytes(contents.getvalue())
    print(f"Packaged {destination.relative_to(SITE)} with {len(files)} files")


if __name__ == "__main__":
    for tool in TOOLS:
        package_tool(*tool)
