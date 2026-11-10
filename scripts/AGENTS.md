# scripts 说明

适用范围：`scripts/`。同时遵守根 `AGENTS.md`；测试约定见 `tests/AGENTS.md`。

- 脚本仅依赖 Node 内置模块；源码目录不安装依赖。
- 同步目标固定为宿主 `external/emojis`；拒绝符号链接与源码重叠，跳过数据、依赖、产物和凭据。只删除目标中的受管源码文件，不删除宿主配置或缓存。
- onebot-sandbox 验收从环境变量读取凭据，仅在本次创建的测试空间写入。结束后标记空间完成并停止测试机器人；报告不得含 token。
- `publish.mjs` 在本机发布到 npm：`node scripts/publish.mjs`，`--dry-run` 只演练，两步验证用 `--otp=<验证码>`。不经 yarn 运行，因为源码目录没有 `yarn.lock`。要求工作区干净、提交已推送、npm 已登录且 `v<版本>` tag 不存在。流程依次为：同步，清空副本的 `lib`、`dist`、`tsconfig.tsbuildinfo`，构建，类型检查，测试，`yarn pack`，解压后从目录 `npm publish`，最后打并推送 `v<版本>` tag。
  - 必须清空旧产物：同步不清理产物；`tsbuildinfo` 还在时，tsc 不重新生成类型声明。
  - 必须用 `yarn pack`：它会改写 `workspace:*`。
  - 必须解压后从目录发布：直接发布 tgz 时，元数据缺少 `readme`，插件市场会显示「暂无说明」。
- 不在 CI 发布：v2 仓库私有，`@chatluna/*` 未上 npm。`package.json` 的 `repository` 指向 `Sor85/chatluna-plugin-emojis`，以后改用 Trusted Publishing 时，provenance 校验依赖它。
