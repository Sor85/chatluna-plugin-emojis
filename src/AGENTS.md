# src 说明

适用范围：`src/`。同时遵守根 `AGENTS.md`；界面契约见 `client/AGENTS.md`，验证见 `tests/AGENTS.md`。

- `index.ts` 只装配 Config、命令、缓存服务和可选 WebUI。命令只返回一次 Satori 消息，不主动执行其他命令；无前缀 matcher 仅转交同一个 `emoji` 命令，使用 `session.execute(..., true)` 捕获结果，由宿主统一发送一次。
- `allowWithoutPrefix` 默认关闭，开启后通过生命周期受管的 `$processor.match` 匹配完整的两个 emoji，允许空白或单个加号分隔。非匹配消息继续正常处理，权限与宿主会话过滤仍由现有命令管线执行。
- 元数据来自管理员配置的 HTTP(S) 地址，允许自建镜像；请求走 `ctx.http`，限制响应体大小、超时并响应卸载取消。下载地址不可来自普通命令参数。
- 图片只接受 `https://www.gstatic.com/android/keyboard/emojikitchen/` 下的 PNG 地址，不提供任意 URL 代理或文件读取。图片以远程地址发送，下载/可达性由平台处理。
- 更新先校验并建立新索引，再原子替换单一缓存文件，最后切换内存索引；失败保留旧数据。缓存文件同存源地址、验证头和元数据，避免 ETag 与正文错配。条件请求只复用同一源的有效缓存。
- 同实例的更新并发合并；304 仅在存在同源有效索引时接受。无可用缓存时显示未就绪且保留手动重试入口。
- 普通合成不需要管理权限；手动更新命令与 WebUI action 均校验权限等级 3。WebUI 使用宿主认证与类型化 state/action，不暴露完整元数据或数据目录。
- 输入按 Unicode grapheme 分段，支持连写、空白和加号分隔；验证两个 emoji 后先查正向，再查反向，优先上游标记的最新组合。
