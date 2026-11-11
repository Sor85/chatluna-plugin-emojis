# AGENTS.md — chatluna-plugin-emojis

ChatLuna v2 Emoji Kitchen 合成插件。此目录是唯一源码入口，宿主 `external/emojis` 仅用于构建与运行。

## 开发与验证

- 源码目录不安装依赖、不生成锁文件；使用 `node scripts/sync-to-v2.mjs --once` 单向同步。默认宿主 `../../chatluna-v2-mirror`，可通过 `CHATLUNA_V2_ROOT` 指定。
- 首次同步或依赖变更后，在宿主根运行 `yarn install`；构建运行 `yarn yakumo build emojis`。在宿主 `external/emojis` 运行 `yarn typecheck`、`yarn test`。
- 修改需重启生效的内容后，完整停止宿主 launcher/worker，确认端口释放，再启动并验证新产物。
- 测试仅用临时目录、模拟 HTTP 或独立 onebot-sandbox 测试空间；不修改真实聊天数据。凭据通过环境变量传入，禁止写进源码、日志或报告。
- 不自行创建分支、提交或发布。协议 MIT。分发保留 `src`、`lib`，不含数据和验收产物。
- 源码仓库为 `Sor85/chatluna-plugin-emojis`。发布 npm 用 `node scripts/publish.mjs`，细节见下方 scripts 子目录说明。

## 通用约定

- 使用 Cordis 4、`@chatluna/schema`、宿主 Koishi 命令桥和 Satori 消息；不引入旧版 ChatLuna API 或创建另一个 Koishi 实例。
- 配置由 Schema 传入，注册和取消绑定当前 fiber。插件不提供 WebUI 页面，只通过聊天命令使用；配置只由宿主 SchemaForm 管理。
- README 面向使用者，仅描述功能、用法与限制，不介绍参考项目或本地验收过程。
- 时间戳使用 ISO 8601；码点标识为小写十六进制、以连字符连接，查找时忽略变体选择符，不剥离肤色或 ZWJ。

## 子目录说明

- `src/AGENTS.md`：元数据协议、缓存、网络与命令边界。
- `scripts/AGENTS.md`：单向同步及隔离验收。
- `tests/AGENTS.md`：测试覆盖及项目结构守卫。
