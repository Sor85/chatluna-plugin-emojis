# client 说明

适用范围：`client/`。同时遵守根 `AGENTS.md`；服务端边界见 `src/AGENTS.md`。

- 仅组合 `@chatluna/ui-kit`、宿主 locale、state/action；不安装独立控件库，不覆盖主题、鼠标指针或模态行为。
- 页面根显式声明 `text-sm leading-6`，复用宿主页面滚动容器；emoji 目录分页显示，不新建嵌套滚动区。
- 中文、英文文案位于 `locales/zh.yml` 与 `locales/en.yml`，键必须一致；通过 `ctx.locale.register` 注册。
- 合成、未命中、输入错误、图片加载失败和元数据更新状态必须可见。异步结果必须匹配当前输入，不展示旧请求覆盖新输入的结果。
- 配置只在宿主插件 SchemaForm 修改；页面仅提供合成预览、目录检索、缓存状态和手动更新。
- 保留 `@chatluna/ui-client` 开发依赖，宿主据此识别客户端构建入口。
