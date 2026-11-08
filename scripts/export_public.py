"""Export only explicitly allowed public files, never repository configuration."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
PAGES = ("index", "menu", "course", "shop", "about", "recruit", "privacy",
         "reserve", "takeout", "thanks", "thanks-recruit", "404")
FILES = tuple(name + ".html" for name in PAGES) + (
    "robots.txt", "sitemap.xml", "_redirects",
    "css/reset.css", "css/style.css", "css/responsive.css",
    "js/main.js", "js/slider.js", "js/instagram-feed.js", "js/form-demo.js",
)
DIRECTORIES = {
    "assets/icons": {".svg", ".png", ".webp", ".ico"},
    "assets/images/site": {".svg", ".png", ".webp", ".jpg", ".jpeg", ".gif", ".avif"},
}


def export_public():
    destination = ROOT / "dist"
    if destination.is_symlink():
        raise RuntimeError("dist must not be a symlink")
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir()
    files = [ROOT / name for name in FILES]
    for folder, suffixes in DIRECTORIES.items():
        files.extend(file for file in (ROOT / folder).rglob("*")
                     if file.is_file() and file.suffix.lower() in suffixes
                     and not any(part.startswith(".") for part in file.relative_to(ROOT).parts))
    for source in files:
        if source.is_symlink() or not source.resolve().is_relative_to(ROOT):
            raise RuntimeError("Public assets must be ordinary repository files")
        target = destination / source.relative_to(ROOT)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    print("exported", len(files), "public files to dist/")


if __name__ == "__main__":
    export_public()
