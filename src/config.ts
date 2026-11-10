import { Schema } from '@chatluna/schema'

export interface Config {
  allowWithoutPrefix: boolean
  autoUpdate: boolean
  updateInterval: number
  metadataUrl: string
  timeout: number
  maxMetadataSize: number
  dataDir: string
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    allowWithoutPrefix: Schema.boolean().default(false).label('无前缀触发')
      .description('直接发送两个 emoji 即可合成，无需 emoji 命令前缀。')
  }).description('触发方式'),
  Schema.object({
    // checked() wraps the schema in a transform: the form renders only the inner schema, so label and description go
    // before it, while parsing reads the default from the outer schema.
    metadataUrl: Schema.string().role('link').label('元数据地址')
      .description('Emoji Kitchen 合成表的下载地址，须为无凭据的 HTTP(S) URL，支持兼容的镜像源；合成图片仍使用 Google gstatic 地址。')
      .checked((value) => {
        const url = new URL(value)
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('元数据地址必须是无凭据的 HTTP(S) URL。')
      }).default('https://raw.githubusercontent.com/xsalazar/emoji-kitchen-backend/main/app/metadata.json'),
    autoUpdate: Schema.boolean().default(true).label('自动更新')
      .description('按更新间隔定时检查元数据；无论是否开启，启动时均检查一次。'),
    updateInterval: Schema.number().min(3600).max(2592000).step(1).default(86400).label('更新间隔（秒）')
      .description('范围 3600–2592000；默认 86400 秒，即每天一次。')
  }).description('元数据更新'),
  Schema.object({
    timeout: Schema.number().min(1000).max(300000).step(1).default(30000).label('下载超时（毫秒）')
      .description('单次下载的最长等待时间，范围 1000–300000。'),
    maxMetadataSize: Schema.number().min(1).max(256).step(1).default(128).label('下载大小上限（MiB）')
      .description('元数据响应体超过此大小时中止下载，范围 1–256。'),
    dataDir: Schema.string().default('data/chatluna/emojis').label('缓存目录')
      .description('元数据缓存文件的保存位置；相对路径以当前 ChatLuna 实例目录为基准。')
  }).description('下载与缓存')
])
