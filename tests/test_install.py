import argparse
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location("omo_install", Path(__file__).parents[1] / "install.py")
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class InstallTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="omo install ")
        self.addCleanup(temporary.cleanup)
        self.base = Path(temporary.name)
        self.root = self.base / "package"
        self.source = self.root / "presets" / "opencode-omo"
        self.source.mkdir(parents=True)
        (self.source / "preset.yml").write_text("name: opencode-omo\n")
        (self.source / "driver.mjs").write_text("export function apply() {}\n")
        self.home = self.base / "new home"
        self.profile = self.home / "profiles" / "web"
        self.args = argparse.Namespace(home=str(self.home), profile="web")
        for name, replacement in (
            ("repo_root", lambda: self.root),
            ("ensure_built", lambda root: None),
            ("ensure_runtime_dependencies", lambda root: None),
            ("check_lsp_servers", lambda: None),
        ):
            mocked = patch.object(installer, name, replacement)
            mocked.start()
            self.addCleanup(mocked.stop)

    def manifest(self):
        return json.loads((self.profile / "package.json").read_text())

    def test_fresh_install_and_repeat_without_shared_harness_links(self):
        self.assertFalse(self.home.exists())
        installer.install(self.args)
        before = (self.profile / "package.json").read_bytes()
        installer.install(self.args)
        self.assertEqual(before, (self.profile / "package.json").read_bytes())
        self.assertEqual(installer.node_modules_pkg(self.profile).resolve(), self.root)
        self.assertEqual(self.manifest()["dsh"]["profile"]["bundles"].count(installer.PACKAGE), 1)
        self.assertFalse((self.home / "profiles" / "node_modules").exists())
        self.assertFalse((self.home / ".agent-presets" / "opencode-omo").is_symlink())

    def test_reinstall_and_uninstall_preserve_unrelated_files_links_and_config(self):
        installer.install(self.args)
        preset = self.home / ".agent-presets" / "opencode-omo"
        custom = preset / "custom.txt"
        custom.write_text("keep")
        external = self.base / "external.txt"
        external.write_text("external")
        (preset / "custom-link").symlink_to(os.path.relpath(external, preset))
        data = self.manifest()
        data["dependencies"]["other"] = "1.0.0"
        data["dsh"]["profile"]["bundles"].append("other")
        installer.write_json(self.profile / "package.json", data)
        installer.install(self.args)
        installer.uninstall(self.args)
        self.assertEqual(custom.read_text(), "keep")
        self.assertEqual((preset / "custom-link").read_text(), "external")
        self.assertEqual(self.manifest()["dependencies"], {"other": "1.0.0"})
        self.assertIn("other", self.manifest()["dsh"]["profile"]["bundles"])

    def test_conflicting_preset_fails_before_profile_is_created(self):
        preset = self.home / ".agent-presets" / "opencode-omo"
        preset.mkdir(parents=True)
        (preset / "driver.mjs").write_text("user version")
        with self.assertRaisesRegex(SystemExit, "refusing to overwrite"):
            installer.install(self.args)
        self.assertFalse(self.profile.exists())
        self.assertEqual((preset / "driver.mjs").read_text(), "user version")

    def test_foreign_package_link_prevents_uninstall_changes(self):
        installer.install(self.args)
        before = (self.profile / "package.json").read_bytes()
        link = installer.node_modules_pkg(self.profile)
        link.unlink()
        foreign = self.base / "foreign"
        foreign.mkdir()
        link.symlink_to(foreign)
        installer.uninstall(self.args)
        self.assertEqual(link.resolve(), foreign)
        self.assertEqual((self.profile / "package.json").read_bytes(), before)

    def test_relative_owned_links_are_recognized_from_their_parent(self):
        installer.install(self.args)
        link = installer.node_modules_pkg(self.profile)
        link.unlink()
        link.symlink_to(os.path.relpath(self.root, link.parent))
        installer.install(self.args)
        installer.uninstall(self.args)
        self.assertFalse(link.is_symlink())

    def test_managed_directory_links_are_not_mutated(self):
        self.home.mkdir()
        foreign = self.base / "managed-profiles"
        foreign.mkdir()
        (self.home / "profiles").symlink_to(foreign)
        with self.assertRaisesRegex(SystemExit, "owning installer"):
            installer.install(self.args)
        self.assertEqual(list(foreign.iterdir()), [])

    def test_profile_name_cannot_escape_home(self):
        for name in ("..", "../other", "/tmp/other", ""):
            with self.assertRaises(SystemExit):
                installer.profile_dir(str(self.home), name)


if __name__ == "__main__":
    unittest.main()
