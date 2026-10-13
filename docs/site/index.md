---
layout: page
---

<script setup>
import { onMounted } from "vue";
import { withBase } from "vitepress";

onMounted(() => location.replace(withBase("/fr/")));
</script>

[Documentation en français](/fr/) · [English documentation](/en/)
