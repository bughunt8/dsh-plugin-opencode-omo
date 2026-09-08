#!/usr/bin/env python3
"""Install/uninstall the @royenheart/dsh-plugin-opencode-omo plugin into a dsh profile.

The plugin is a dsh BUNDLE whose patch inserts its host row (role registry +
settings + browser routes). The `opencode-omo` AGENT PRESET is published
through dsh's native user preset root (`$DSH_HOME/.agent-presets`), which the
agent-presets service always scans, so no dsh-side preset-root patch is needed.

Installing it requires:

1. a symlink of the package into the profile node_modules,
2. adding it to the profile dsh.profile.bundles list (plus a link: dependency),
   and
3. a symlink `$DSH_HOME/.agent-presets/opencode-omo` to the package's preset.

Usage:
    python3 install.py install [--profile web] [--home ~/.dsh]
    python3 install.py uninstall [--profile web] [--home ~/.dsh]

Requires Python and Node.js 24. Source checkouts build their own locked
toolchain; built package artifacts reuse their shipped bundles. The installed
stock Harness supplies the base/web bundles when the profile starts.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

PACKAGE = "@royenheart/dsh-plugin-opencode-omo"

# LSP servers the preset preconfigures. The preset now self-disables its
# `lsp-stdio` row when a command is missing, so a missing server never breaks
# the whole mode; installation still reports the gap with the fix command.
LSP_SERVER_COMMANDS = {
    "typescript": (
        "typescript-language-server",
        "npm install -g typescript-language-server typescript",
    ),
}


def repo_root() -> Path:
    return Path(__file__).resolve().parent


def profile_dir(home: str, profile: str) -> Path:
    if not profile or profile in (".", "..") or Path(profile).name != profile:
        raise SystemExit("profile must be a single directory name")
    return Path(home).expanduser().absolute() / "profiles" / profile


def node_modules_pkg(profile: Path) -> Path:
    return profile / "node_modules" / PACKAGE


def read_json(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, data: dict) -> None:
    if path.is_symlink():
        raise SystemExit("refusing to replace a symlinked manifest: " + str(path))
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as f:
            temporary = Path(f.name)
            json.dump(data, f, indent=2)
            f.write("\n")
        if path.exists():
            temporary.chmod(path.stat().st_mode & 0o777)
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def ensure_profile(profile: Path) -> None:
    manifest = profile / "package.json"
    if not manifest.exists():
        profile.mkdir(parents=True, exist_ok=True)
        write_json(manifest, {
            "name": "dsh-profile-" + profile.name,
            "private": True,
            "dependencies": {},
            "dsh": {"profile": {"bundles": [
                "@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app",
            ]}},
        })



def ensure_link(link: Path, target: Path) -> None:
    """Create an owned link; never replace a foreign symlink or real path."""
    link.parent.mkdir(parents=True, exist_ok=True)
    if link.is_symlink():
        if link.resolve() == target.resolve():
            return
        raise SystemExit("refusing to replace foreign symlink: " + str(link))
    elif link.exists():
        raise SystemExit("refusing to overwrite existing path: " + str(link))
    link.symlink_to(target, target_is_directory=True)


def user_preset_dir(home: str) -> Path:
    """dsh-agent-presets' native user root, appended to every roster."""
    return Path(home).expanduser() / ".agent-presets"


def ensure_user_preset_link(root: Path, home: str) -> None:
    """Publish the shipped preset through dsh's user preset root.

    `dsh-agent-presets` resolves `$DSH_HOME/.agent-presets` after every
    configured root (includeUserRoot defaults to true). Discovery only accepts
    REAL directories as roster rows (`dirent.isDirectory()` does not follow
    symlinks), so the preset id is a real directory whose entries are symlinked
    into the package. Updates to shipped preset files therefore stay live
    without reinstalling.
    """
    source = root / "presets" / "opencode-omo"
    preset = user_preset_dir(home) / "opencode-omo"
    if preset.is_symlink():
        raise SystemExit("preset root must be a real directory: " + str(preset))
    preset.mkdir(parents=True, exist_ok=True)
    if preset.exists() and not preset.is_dir():
        raise SystemExit("refusing to overwrite non-directory path: " + str(preset))
    for existing in preset.iterdir():
        if not existing.is_symlink():
            continue
        try:
            target = existing.resolve()
        except OSError:
            continue
        if source.resolve() in target.parents and not (source / existing.name).exists():
            existing.unlink()
    for entry in sorted(source.iterdir()):
        ensure_link(preset / entry.name, entry)


def ensure_built(root: Path) -> None:
    """Build the repository's own host/client bundles before installing.

    `lib/` is generated locally and never versioned, so `install.py` always
    runs the package's own build instead of trusting whatever files happen to
    exist. `npm install` provisions the dev toolchain only when it is missing;
    a machine without npm reports an actionable error instead of continuing.
    """
    required = [root / "lib" / "index.js", root / "lib" / "client.js"]
    if not (root / "scripts" / "build.sh").exists():
        if all(path.is_file() for path in required):
            return
        raise SystemExit("package has no built bundles; use a built release or build the source checkout")
    npm = shutil.which("npm")
    if npm is None:
        raise SystemExit(
            "npm is not on PATH - install Node.js/npm, then run "
            "`npm install && npm run build` inside " + str(root)
        )
    try:
        if not (root / "node_modules" / ".bin" / "tsc").exists() or not (root / "node_modules" / ".bin" / "tsdown").exists():
            command = "ci" if (root / "package-lock.json").is_file() else "install"
            print("installing the repository's own toolchain (npm " + command + ")...")
            subprocess.run([npm, command, "--ignore-scripts", "--no-audit", "--no-fund"], cwd=root, check=True)
        print("building host/client bundles (npm run build)...")
        subprocess.run([npm, "run", "build"], cwd=root, check=True)
    except subprocess.CalledProcessError as error:
        raise SystemExit(
            "build failed (npm exit " + str(error.returncode) + ") - "
            "run `npm install` and `npm run build` inside " + str(root) + " to see the diagnostics"
        ) from error
    missing = [str(path) for path in required if not path.exists()]
    if missing:
        raise SystemExit(
            "build finished but produced no artifacts: " + ", ".join(missing)
        )


def ensure_runtime_dependencies(root: Path) -> None:
    """Validate declared peers through normal Node resolution, not global links."""
    node = shutil.which("node")
    if node is None:
        raise SystemExit("Node.js 24 is required")
    script = """
const { createRequire } = require('node:module');
const req = createRequire(process.argv[1]);
if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('Node.js 24 is required');
for (const name of ['dsh-tools', 'dsh-llm']) {
  const pkg = req('@deepseek-ai/' + name + '/package.json');
  if (pkg.version !== '0.1.2-rc.1') throw new Error(name + ' must be 0.1.2-rc.1; got ' + pkg.version);
}
req.resolve('js-yaml');
"""
    try:
        subprocess.run([node, "-e", script, str(root / "package.json")], check=True)
    except subprocess.CalledProcessError as error:
        raise SystemExit(
            "runtime dependencies are missing or incompatible; install this package's "
            "declared dependencies (npm ci for source, npm install --omit=dev "
            "--ignore-scripts for an extracted built package)"
        ) from error


def preflight(root: Path, profile: Path, home: str) -> None:
    """Validate ownership and manifest shape before changing the target home."""
    for directory in (profile.parent, profile, user_preset_dir(home)):
        if directory.is_symlink():
            raise SystemExit("managed directory symlink; use its owning installer: " + str(directory))
    manifest = profile / "package.json"
    if manifest.is_symlink():
        raise SystemExit("refusing to replace a symlinked manifest: " + str(manifest))
    if manifest.exists():
        data = read_json(manifest)
        try:
            dependencies = data.get("dependencies", {})
            bundles = data.get("dsh", {}).get("profile", {}).get("bundles", [])
            if not isinstance(dependencies, dict) or not isinstance(bundles, list):
                raise ValueError("dependencies must be an object and bundles a list")
            expected = "link:" + str(root)
            if PACKAGE in dependencies and dependencies[PACKAGE] != expected:
                raise ValueError("package dependency belongs to another installation")
        except (AttributeError, ValueError) as error:
            raise SystemExit("invalid or conflicting profile manifest: " + str(error)) from error
    source = root / "presets" / "opencode-omo"
    if not source.is_dir():
        raise SystemExit("shipped preset is missing: " + str(source))
    preset = user_preset_dir(home) / "opencode-omo"
    if preset.is_symlink() or (preset.exists() and not preset.is_dir()):
        raise SystemExit("preset root must be a real directory: " + str(preset))
    links = [(node_modules_pkg(profile), root)]
    links.extend((preset / entry.name, entry) for entry in source.iterdir())
    for link, target in links:
        if link.is_symlink() and link.resolve() == target.resolve():
            continue
        if link.is_symlink() or link.exists():
            raise SystemExit("refusing to overwrite existing path: " + str(link))


def check_lsp_servers() -> None:
    """Warn about missing LSP server executables without failing the install.

    The preset disables its `lsp-stdio` row when a server command is absent,
    so the opencode-omo mode stays selectable; this message tells the user how
    to re-enable LSP support.
    """
    missing = [
        (server, command, install_hint)
        for server, (command, install_hint) in LSP_SERVER_COMMANDS.items()
        if shutil.which(command) is None
    ]
    if not missing:
        return
    print("WARNING: LSP server commands are missing from PATH; opencode-omo still installs, "
          "but the preset will run with LSP disabled until they are installed:")
    for server, command, install_hint in missing:
        print(f"  - {server}: {command} (install: {install_hint})")
    print("  Install the commands and restart dsh to enable LSP.")


def install(args: argparse.Namespace) -> None:
    profile = profile_dir(args.home, args.profile)
    root = repo_root()
    preflight(root, profile, args.home)
    ensure_built(root)
    ensure_runtime_dependencies(root)
    check_lsp_servers()
    ensure_profile(profile)
    ensure_user_preset_link(root, args.home)

    # 1. Symlink the package into the profile node_modules (idempotent).
    target = root
    link = node_modules_pkg(profile)
    link.parent.mkdir(parents=True, exist_ok=True)
    if link.is_symlink() or link.exists():
        if link.is_symlink() and link.resolve() == target:
            print("already linked:", link)
        else:
            raise SystemExit("refusing to overwrite existing path: " + str(link))
    else:
        link.symlink_to(target, target_is_directory=True)
        print("linked:", link, "->", target)

    # 2. Add the dependency + bundle entry to the profile manifest.
    manifest_path = profile / "package.json"
    data = read_json(manifest_path)
    deps = data.setdefault("dependencies", {})
    if PACKAGE not in deps:
        deps[PACKAGE] = "link:" + str(target)
        print("added dependency:", PACKAGE)
    else:
        print("dependency already present:", PACKAGE)

    dsh = data.setdefault("dsh", {})
    prof = dsh.setdefault("profile", {})
    bundles = prof.setdefault("bundles", [])
    if PACKAGE not in bundles:
        bundles.append(PACKAGE)
        print("added bundle:", PACKAGE)
    else:
        print("bundle already present:", PACKAGE)

    write_json(manifest_path, data)
    print("installed into profile", repr(args.profile), "at", profile)


def uninstall(args: argparse.Namespace) -> None:
    profile = profile_dir(args.home, args.profile)
    manifest_path = profile / "package.json"
    for directory in (profile.parent, profile, user_preset_dir(args.home)):
        if directory.is_symlink():
            raise SystemExit("managed directory symlink; use its owning installer: " + str(directory))
    if manifest_path.is_symlink():
        raise SystemExit("refusing to replace a symlinked manifest: " + str(manifest_path))

    link = node_modules_pkg(profile)
    if link.is_symlink() and link.resolve() == repo_root():
        link.unlink()
        print("removed link:", link)
    elif link.is_symlink():
        print("skipping foreign package link:", link)
        return
    elif link.exists():
        print("skipping non-symlink path:", link)
        return
    else:
        print("no link present:", link)

    preset = user_preset_dir(args.home) / "opencode-omo"
    source = (repo_root() / "presets" / "opencode-omo").resolve()
    if preset.is_dir() and not preset.is_symlink():
        removed = False
        for entry in list(preset.iterdir()):
            if not entry.is_symlink():
                continue
            try:
                owned = source in entry.resolve().parents
            except OSError:
                owned = False
            if owned:
                entry.unlink()
                removed = True
        try:
            preset.rmdir()
        except OSError:
            pass
        print("removed preset root entries:" if removed else "no owned preset root entries:", preset)
    elif preset.is_symlink():
        print("skipping legacy preset root symlink (remove manually):", preset)
    else:
        print("no preset root directory present:", preset)

    if manifest_path.exists():
        data = read_json(manifest_path)
        deps = data.get("dependencies", {})
        if deps.get(PACKAGE) == "link:" + str(repo_root()):
            del deps[PACKAGE]
            print("removed dependency:", PACKAGE)
            bundles = data.get("dsh", {}).get("profile", {}).get("bundles", [])
            if PACKAGE in bundles:
                bundles.remove(PACKAGE)
                print("removed bundle:", PACKAGE)
            write_json(manifest_path, data)

    print("uninstalled from profile", repr(args.profile), "at", profile)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Install/uninstall the opencode-omo dsh plugin"
    )
    parser.add_argument("command", choices=["install", "uninstall"])
    parser.add_argument("--profile", default="web", help="dsh profile name (default: web)")
    parser.add_argument(
        "--home",
        default=os.environ.get("DSH_HOME", "~/.dsh"),
        help="dsh home (default: $DSH_HOME or ~/.dsh)",
    )
    args = parser.parse_args()

    if args.command == "install":
        install(args)
    else:
        uninstall(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
