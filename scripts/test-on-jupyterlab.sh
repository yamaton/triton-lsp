#!/usr/bin/env bash

# -------------------------------------------------------------
# Prepare Triton-LSP for Jupyter Lab
#
#   Requirement:
#     - jupyterlab
#     - jupyterlab-lsp
#     - jq
#
#   Usage:  Just run this script.
#
#     $ ./test-on-jupyterlab.sh
#
# -------------------------------------------------------------

if [[ ! "$(command -v jupyter)" ]]; then
  echo "jupyter is missing. Right env?"
  exit 1
fi

if [[ ! "$(command -v node)" ]]; then
  echo "jupyter is missing. Right env?"
  exit 1
fi

if [[ "$(node --version | cut -d v -f 2 | cut -d . -f 1)" != "16" ]]; then
  echo "node version is NOT 16: "$(node --version)""
  exit 1
fi

target="$HOME/playground/jup"
name="triton-lsp"

script_dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
repo_root="$script_dir"/..
version="$(cat ${repo_root}/package.json | jq .version | tr -d \")"
package="$repo_root/${name}-${version}.tgz"

mkdir -p "$target"

echo "[info] packing $name"
cd "$repo_root"
npm pack

if [[ ! -f "$package" ]]; then
    echo "${package} is missing"
    exit 1
fi

echo "[info] installing to $target"
cd "$target"
npm install "$package"


readonly server_config="$repo_root"/scripts/jupyter_server_config.py
if [[ ! -f "$server_config" ]]; then
    echo "${server_config} is missing"
    exit 1
fi

echo "[info] copy jupyter_server_config.py to $target"
cp -f "$server_config" "$target"

echo "[info] launching jupyterlab"
jupyter lab --debug --no-browser
