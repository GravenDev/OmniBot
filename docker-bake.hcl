# Both images the release ships, built in one call — `docker buildx bake`
# builds the pair, `docker buildx bake runtime` only the bot. The stages they
# share (base, deps, build) are solved once.
#
# The CI sets the platforms, the cache and the outputs on top of this file,
# and on a release the tags and labels docker/metadata-action derives.

group "default" {
  targets = ["runtime", "migrator"]
}

target "runtime" {
  target = "runtime"
  tags   = ["omnibot"]
}

target "migrator" {
  target = "migrator"
  tags   = ["omnibot-migrator"]
}
