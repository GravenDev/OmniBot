group "default" {
  targets = ["runtime", "migrator"]
}

target "runtime" {
  target = "runtime"
}

target "migrator" {
  target = "migrator"
}
