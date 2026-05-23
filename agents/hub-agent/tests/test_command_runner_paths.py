from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

from hermes_hub_agent.command_runner import CommandRunner
from hermes_hub_agent.heartbeat import AgentConfig


def make_runner(hermes_home: Path) -> CommandRunner:
    return CommandRunner(
        AgentConfig(
            hub_url="http://127.0.0.1:1",
            hub_token="test-token",
            hermes_home=str(hermes_home),
        )
    )


class CommandRunnerPathBoundaryTests(unittest.TestCase):
    def test_config_read_returns_raw_yaml_text(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            config_text = "model:\n  provider: openai\n  default: gpt-4.1\nterminal:\n  cwd: .\n"
            (root / "config.yaml").write_text(config_text, encoding="utf-8")

            runner = make_runner(root)
            result = runner.command_config_read({"profile_home": str(root)})

            self.assertEqual(result["config"], config_text)
            self.assertEqual(result["provider"], "openai")
            self.assertEqual(result["model"], "gpt-4.1")

    def test_profile_create_can_clone_from_explicit_profile_home(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            root.mkdir(parents=True, exist_ok=True)
            (root / "config.yaml").write_text("model:\n  provider: openai\n", encoding="utf-8")
            (root / ".env").write_text("OPENAI_API_KEY=sk-test\n", encoding="utf-8")
            (root / "SOUL.md").write_text("# SOUL\n", encoding="utf-8")

            runner = make_runner(root)
            result = runner.command_profile_create({
                "profile_name": "writer",
                "clone_from_profile_home": str(root),
            })

            self.assertTrue(result["created"])
            self.assertTrue((root / "profiles" / "writer" / "config.yaml").exists())
            self.assertTrue((root / "profiles" / "writer" / ".env").exists())
            self.assertTrue((root / "profiles" / "writer" / "SOUL.md").exists())

    def test_explicit_profile_home_outside_configured_root_is_rejected_for_writes(self) -> None:
        root = Path("D:/aiproject/hermes-hub/.test-hermes")
        outside = root.parent / "outside"

        runner = make_runner(root)
        with mock.patch.object(Path, "write_text") as write_text:
            with self.assertRaisesRegex(ValueError, "profile_home must be inside"):
                runner.command_config_patch({
                    "profile_home": str(outside),
                    "content": "provider: test\n",
                })

        write_text.assert_not_called()

    def test_explicit_profile_home_outside_configured_root_is_not_deleted(self) -> None:
        root = Path("D:/aiproject/hermes-hub/.test-hermes")
        outside = root.parent / "outside"

        runner = make_runner(root)
        with mock.patch("hermes_hub_agent.command_runner.shutil.rmtree") as rmtree:
            with self.assertRaisesRegex(ValueError, "profile_home must be inside"):
                runner.command_profile_delete({"profile_home": str(outside)})

        rmtree.assert_not_called()

    def test_profile_create_rejects_path_traversal_name(self) -> None:
        root = Path("D:/aiproject/hermes-hub/.test-hermes")

        runner = make_runner(root)
        with mock.patch.object(Path, "mkdir") as mkdir:
            with self.assertRaisesRegex(ValueError, "profile_name must be a single path segment"):
                runner.command_profile_create({"profile_name": "../escape"})

        mkdir.assert_not_called()

    def test_profile_rename_rejects_path_traversal_name(self) -> None:
        root = Path("D:/aiproject/hermes-hub/.test-hermes")
        profile = root / "profiles" / "coder"

        runner = make_runner(root)
        with mock.patch.object(Path, "rename") as rename:
            with self.assertRaisesRegex(ValueError, "new_name must be a single path segment"):
                runner.command_profile_rename({
                    "profile_home": str(profile),
                    "new_name": "../escape",
                })

        rename.assert_not_called()

    def test_profile_rename_refuses_default_profile_root(self) -> None:
        root = Path("D:/aiproject/hermes-hub/.test-hermes")

        runner = make_runner(root)
        with mock.patch.object(Path, "exists", return_value=True), mock.patch.object(Path, "rename") as rename:
            with self.assertRaisesRegex(ValueError, "Refusing to rename the root"):
                runner.command_profile_rename({
                    "profile_home": str(root),
                    "new_name": "renamed",
                })

        rename.assert_not_called()


if __name__ == "__main__":
    unittest.main()
