#!/bin/bash -e

# The scripts act on the workspace root, so move there. This lets them be
# called from anywhere, e.g. via the aliases in the container.
cd "$(dirname "$(readlink -f "$0")")/.."

# Run the editor with hot reload, on http://localhost:5173, for working on the
# editor itself.
exec pnpm run dev
