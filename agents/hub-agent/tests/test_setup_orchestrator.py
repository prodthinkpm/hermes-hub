from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from hermes_hub_agent.command_runner import CommandRunner, success_result
from hermes_hub_agent.heartbeat import AgentConfig


def make_runner(hermes_home: Path) -> CommandRunner:
    return CommandRunner(
        AgentConfig(
            hub_url="http://127.0.0.1:1",
            hub_token="test-token",
            hermes_home=str(hermes_home),
        )
    )


class SetupOrchestratorTests(unittest.TestCase):
    def test_setup_run_success_with_required_env(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            runner = make_runner(root)

            result = runner.command_setup_run(
                {
                    "profile_name": "writer",
                    "mode": "create_flow",
                    "inputs": {
                        "provider": "openai",
                        "env": {"OPENAI_API_KEY": "sk-test-1234567890"},
                        "terminal": {"cwd": "."},
                    },
                }
            )

            self.assertEqual(result["status"], "success")
            self.assertEqual(len(result["step_results"]), 12)
            self.assertTrue((root / "profiles" / "writer" / "config.yaml").exists())
            self.assertTrue((root / "profiles" / "writer" / ".env").exists())
            self.assertTrue((root / "profiles" / "writer" / "SOUL.md").exists())

    def test_setup_run_writes_model_base_url(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            runner = make_runner(root)

            result = runner.command_setup_run(
                {
                    "profile_name": "writer",
                    "mode": "create_flow",
                    "inputs": {
                        "provider": "deepseek",
                        "model": {
                            "default": "deepseek-v4-flash",
                            "base_url": "https://openrouter.ai/api/v1",
                        },
                        "env": {"DEEPSEEK_API_KEY": "sk-test-1234567890"},
                        "terminal": {"cwd": "."},
                    },
                }
            )

            self.assertEqual(result["status"], "success")
            config_text = (root / "profiles" / "writer" / "config.yaml").read_text(encoding="utf-8")
            self.assertIn("base_url: https://openrouter.ai/api/v1", config_text)

    def test_setup_run_writes_gateway_platforms(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            runner = make_runner(root)

            result = runner.command_setup_run(
                {
                    "profile_name": "writer",
                    "mode": "create_flow",
                    "inputs": {
                        "provider": "openai",
                        "model": {"default": "gpt-4.1"},
                        "env": {"OPENAI_API_KEY": "sk-test-1234567890"},
                        "terminal": {"cwd": "."},
                        "gateway": {"platforms": ["discord", "slack"]},
                    },
                }
            )

            self.assertEqual(result["status"], "success")
            config_text = (root / "profiles" / "writer" / "config.yaml").read_text(encoding="utf-8")
            self.assertIn("platforms:", config_text)
            self.assertIn("- discord", config_text)
            self.assertIn("- slack", config_text)

    def test_setup_run_resume_from_failed_step(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            runner = make_runner(root)

            first = runner.command_setup_run(
                {
                    "profile_name": "repairme",
                    "mode": "create_flow",
                    "inputs": {"provider": "openai"},
                }
            )
            self.assertEqual(first["status"], "failed")
            failed_step = next(item["step"] for item in first["step_results"] if item["status"] == "failed")
            self.assertEqual(failed_step, "env.validate_required_keys")

            resumed = runner.command_setup_run(
                {
                    "profile_name": "repairme",
                    "mode": "repair",
                    "resume_from_step": failed_step,
                    "inputs": {
                        "provider": "openai",
                        "env": {"OPENAI_API_KEY": "sk-test-1234567890"},
                    },
                }
            )

            self.assertEqual(resumed["status"], "success")
            skipped = [item for item in resumed["step_results"] if item["status"] == "skipped"]
            self.assertGreater(len(skipped), 0)

    def test_setup_run_requires_deepseek_key_from_provider_catalog(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            runner = make_runner(root)

            failed = runner.command_setup_run(
                {
                    "profile_name": "deepseeker",
                    "mode": "create_flow",
                    "inputs": {"provider": "deepseek"},
                }
            )
            self.assertEqual(failed["status"], "failed")
            self.assertIn("DEEPSEEK_API_KEY", failed["error"]["message"])

            success = runner.command_setup_run(
                {
                    "profile_name": "deepseeker",
                    "mode": "repair",
                    "resume_from_step": "env.validate_required_keys",
                    "inputs": {
                        "provider": "deepseek",
                        "env": {"DEEPSEEK_API_KEY": "sk-test-deepseek"},
                    },
                }
            )
            self.assertEqual(success["status"], "success")

    def test_setup_catalog_contains_deepseek_provider(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            runner = make_runner(root)

            result = runner.command_setup_catalog({})
            deepseek = next((item for item in result["providers"] if item["id"] == "deepseek"), None)
            self.assertIsNotNone(deepseek)
            assert deepseek is not None
            self.assertIn("DEEPSEEK_API_KEY", deepseek["required_env_keys"])
            self.assertGreater(len(deepseek["models"]), 0)

    def test_success_result_turns_nonzero_returncode_into_failed(self) -> None:
        result = success_result({"returncode": 2, "stdout": "ok", "stderr": "bad"}, "2026-01-01T00:00:00Z")
        self.assertEqual(result["status"], "failed")
        self.assertIn("returncode 2", result["error"])


if __name__ == "__main__":
    unittest.main()
