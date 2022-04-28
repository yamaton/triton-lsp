# ------------------------------------------------------------------
# Languge Server Configuraiton in JupyterLab-LSP
#
# Usage:
#   Put this file in the working directory,
#   OR to one of directories shown in `jupyter --path`.
#
# ------------------------------------------------------------------

# jupyter_server_config.py
import shutil
import pathlib


# c is a magic, lazy variable
c.LanguageServerManager.language_servers = {
    "triton-lsp": {
        # if installed as a binary
        "argv": [
            shutil.which("node"),
            (pathlib.Path(__file__).parent / "node_modules" / ".bin" / "triton-lsp").as_posix(),
            "--stdio",
        ],
        "languages": ["bash", "sh"],
        "version": 2,
        "mime_types": ["text/x-sh", "application/x-sh"],
        "display_name": "triton-lsp",
    }
}
