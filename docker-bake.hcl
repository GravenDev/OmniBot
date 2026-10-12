# Both images the release ships, built in one call — `docker buildx bake`
# builds the pair, `docker buildx bake runtime` only the bot. The stages they
# share (base, deps, build) are solved once.
#
# The CI sets the platform, the cache and the outputs on top of this file.

group "default" {
  targets = ["runtime", "migrator"]
}

# Placeholder for the labels docker/metadata-action writes in CI, so that the
# `inherits` below also resolve on a local build.
target "docker-metadata-action" {}

target "runtime" {
  inherits = ["docker-metadata-action"]
  target   = "runtime"
  tags     = ["omnibot"]
}

target "migrator" {
  inherits = ["docker-metadata-action"]
  target   = "migrator"
  tags     = ["omnibot-migrator"]
}
