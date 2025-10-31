# syntax=docker/dockerfile:1
FROM docker.io/cloudflare/sandbox:0.4.14

ENV FOUNDRY_DISABLE_NIGHTLY_WARNING=1

# Expose any ports you might want to use (optional)
# EXPOSE 3000 8080
