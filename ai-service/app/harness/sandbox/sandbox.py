"""
Sandbox execution for tool handlers
"""
import subprocess
import tempfile
import os
from typing import Dict, Any


class Sandbox:
    def __init__(self, allowed_paths: list = None):
        self.allowed_paths = allowed_paths or ["/tmp", os.getcwd()]

    def execute_command(self, command: str, timeout: int = 60) -> Dict[str, Any]:
        try:
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=os.getcwd()
            )
            return {
                "success": True,
                "stdout": result.stdout,
                "stderr": result.stderr,
                "returncode": result.returncode
            }
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "error": "Command timed out",
                "returncode": -1
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "returncode": -1
            }


def create_sandbox() -> Sandbox:
    return Sandbox()
