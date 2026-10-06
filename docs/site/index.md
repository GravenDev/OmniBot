---
layout: page
---

<script setup>
import { onMounted } from "vue";
import { useRouter, withBase } from "vitepress";

const router = useRouter();
onMounted(() => router.go(withBase("/fr/")));
</script>

[Documentation en français](/fr/) · [English documentation](/en/)
