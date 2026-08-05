import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      // 思源宿主运行时注入的外部依赖，测试环境解析到本地桩
      siyuan: new URL("./test/stubs/siyuan.ts", import.meta.url).pathname,
    },
  },
})
