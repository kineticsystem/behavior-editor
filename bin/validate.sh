#!/bin/bash -e

# Check a folder of behaviors from the command line; exits with 1 on errors.
#
#   validate.sh [folder] [--json] [--editor-only]
#
# The folder defaults to $BEHAVIORS_DIR.

# Make a folder argument absolute before moving: it is relative to the caller.
args=()
for arg in "$@"; do
    if [[ "$arg" != --* ]]; then
        arg="$(realpath "$arg")"
    fi
    args+=("$arg")
done

# The scripts act on the workspace root, so move there.
cd "$(dirname "$(readlink -f "$0")")/.."

exec pnpm --silent run validate "${args[@]}"
