# Ubuntu 24.04 with user "developer", Node.js, pnpm and BehaviorTree.CPP.
#
# BehaviorTree.CPP is only needed by the authoritative validator in
# ../validator, which loads the behaviors with the real library. The editor
# itself is a Node.js application.

FROM ubuntu:24.04 AS editor

LABEL name="develop:behavior-editor"

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update

RUN apt-get -y install sudo
RUN echo 'root:docker' | chpasswd                      # Update user root password.

# Ubuntu 24.04 base images ship a default 'ubuntu' user at uid/gid 1000. Remove
# it so 'developer' can be created with a matching uid/gid to the host user
# (passed in via build args), which keeps the bind-mounted workspace writable.
RUN if id -u ubuntu >/dev/null 2>&1; then userdel -r ubuntu; fi
RUN if getent group ubuntu >/dev/null 2>&1; then groupdel ubuntu; fi

ARG USER_UID=1000
ARG USER_GID=1000

# Create the user developer with a uid/gid matching the host user so files
# created in the bind-mounted workspace (node_modules, dist, build, and the
# behaviors saved by the editor) are writable and owned correctly on the host.
RUN groupadd -g ${USER_GID} developer
RUN useradd --create-home --shell /bin/bash --uid ${USER_UID} --gid ${USER_GID} developer
RUN echo 'developer:developer' | chpasswd              # Update user developer password.
RUN usermod -aG sudo developer                         # Add user to sudoers.

RUN apt-get -y upgrade
RUN apt-get -y install ca-certificates curl wget git unzip
RUN apt-get -y install build-essential cmake           # To build BehaviorTree.CPP and the validator.

# Node.js from the official binaries, and pnpm through corepack, which ships
# with Node.js and pins the pnpm version declared in package.json.
ARG NODE_VERSION=24.15.0
RUN arch=$(dpkg --print-architecture | sed 's/amd64/x64/') \
 && curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${arch}.tar.xz \
  | tar -xJ -C /usr/local --strip-components=1 \
 && corepack enable

# BehaviorTree.CPP, without the optional ZeroMQ publisher and SQLite logger,
# which the validator does not use.
ARG BTCPP_VERSION=4.10.0
RUN git clone --depth 1 --branch ${BTCPP_VERSION} https://github.com/BehaviorTree/BehaviorTree.CPP.git /tmp/btcpp \
 && cmake -S /tmp/btcpp -B /tmp/btcpp/build \
      -DCMAKE_BUILD_TYPE=Release \
      -DBTCPP_EXAMPLES=OFF \
      -DBTCPP_UNIT_TESTS=OFF \
      -DBUILD_TESTING=OFF \
      -DBTCPP_GROOT_INTERFACE=OFF \
      -DBTCPP_SQLITE_LOGGING=OFF \
 && cmake --build /tmp/btcpp/build --parallel \
 && cmake --install /tmp/btcpp/build \
 && ldconfig \
 && rm -rf /tmp/btcpp

# The container user is in the sudo group, but a password prompt makes the
# scripts in ./bin unusable from a non-interactive shell, e.g.
# `docker exec <container-name> serve.sh`.
RUN echo 'developer ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/developer \
 && chmod 0440 /etc/sudoers.d/developer

CMD ["bash"]

USER developer

ENV HOME=/home/developer

# Answer corepack's download prompt for pnpm, so that non-interactive commands
# do not hang on it.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# The folder of behaviors the editor shows. docker-compose.yml bind-mounts the
# host folder here.
ENV BEHAVIORS_DIR=/home/developer/behaviors

# The repo is bind-mounted at ~/ws (see docker-compose.yml), so ./bin lives at
# a fixed path inside the container. Putting it on the PATH here rather than in
# the bashrc means it also applies to non-interactive shells, e.g.
# `docker exec <container-name> serve.sh`.
ENV PATH="/home/developer/ws/bin:${PATH}"

# Whatever genuinely needs an interactive shell -- the aliases -- lives in this
# file, which is versioned in the repo instead of being echoed line by line
# into ~/.bashrc. Source it from the stock ~/.bashrc rather than replacing that
# file, to keep the distribution's own settings.
COPY --chown=developer:developer bashrc /home/developer/.bashrc.editor
RUN echo "source ~/.bashrc.editor" >> ~/.bashrc

WORKDIR /home/developer/ws
