#!/bin/bash -e

# The scripts act on the workspace root, so move there. This lets them be
# called from anywhere, e.g. via the aliases in the container.
cd "$(dirname "$(readlink -f "$0")")/.."

# Type-check and bundle the editor into dist/.
pnpm run build

# The native validator, which loads the behaviors with BehaviorTree.CPP. The
# library is installed in the container only: skip it elsewhere.
if [ -f /usr/local/lib/cmake/behaviortree_cpp/behaviortree_cppConfig.cmake ] || [ -n "${BTCPP_PREFIX:-}" ]; then
    cmake -S validator -B build/validator -DCMAKE_BUILD_TYPE=Release ${BTCPP_PREFIX:+-DCMAKE_PREFIX_PATH=$BTCPP_PREFIX} > /dev/null
    cmake --build build/validator --parallel
else
    echo "BehaviorTree.CPP is not installed: skipping the native validator."
fi
