#!/bin/bash -e

# The scripts act on the workspace root, so move there. This lets them be
# called from anywhere, e.g. via the aliases in the container.
cd "$(dirname "$(readlink -f "$0")")/.."

# Serve the editor built by build.sh, on http://localhost:${PORT:-8080}. The
# folder of behaviors is $BEHAVIORS_DIR (~/behaviors in the container).
exec pnpm run start
