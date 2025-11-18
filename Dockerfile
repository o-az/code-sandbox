# syntax=docker/dockerfile:1
FROM docker.io/cloudflare/sandbox:0.5.1

ENV TERM="xterm-256color"
ENV COLORTERM="truecolor"
ENV FOUNDRY_DISABLE_NIGHTLY_WARNING=1
ENV NODE_OPTIONS="npm_config_yes=true"

RUN apt-get update --yes \
  && apt-get install --yes --no-install-recommends vim-tiny \
  && rm -rf /var/lib/apt/lists/*


RUN ls -la
RUN npm install --global \
  @foundry-rs/cast@nightly \
  @foundry-rs/forge@nightly \
  @foundry-rs/anvil@nightly \
  @foundry-rs/chisel@nightly

ENV WS_PORT=8080

EXPOSE ${WS_PORT}
EXPOSE 6969
EXPOSE 42044