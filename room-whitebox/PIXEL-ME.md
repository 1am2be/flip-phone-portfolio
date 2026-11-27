# PIXEL ME 本地运行和部署

在项目根目录安装服务端依赖，然后启动房间。Windows 也可以双击 `room-whitebox/launch-preview.cmd`。

```powershell
python -m pip install -r room-whitebox/requirements.txt
python room-whitebox/preview.py
```

在启动服务的环境里设置 OpenAI 项目的 `OPENAI_API_KEY`，重启后即可启用真实照片生成。默认使用 `gpt-image-2.5-sunburst`。如果通过 `OPENAI_IMAGE_MODEL` 改用其他模型，所选模型需要支持图像编辑、两张参考图和透明 PNG 输出。

缺少密钥时，CRT 里的「体验样图」仍可运行，演示昵称仅保留在浏览器的当前页面。

## 合照墙

共享墙由一个 Python 服务进程及其 SQLite 数据库提供。部署时在同一 HTTPS 域名下转发房间页面和 `/api/pixel-me/*`。通过 `PIXEL_ME_DB_PATH` 指向网站目录外的持久存储，数据库所在目录也用于 SQLite 的辅助文件。默认数据库位于项目根目录的 `.pixel-me-data/wall.sqlite3`。

```powershell
python room-whitebox/preview.py --production --host 0.0.0.0 --port 8080 --no-browser
```

网站仅在访客确认上墙后写入生成的小人图与可选昵称。原照与穿搭描述在生成请求中临时处理。OpenAI 项目的留存行为由服务商的数据配置决定。 [OpenAI API 数据说明](https://developers.openai.com/api/docs/guides/your-data)

生产模式由 Waitress 运行。反向代理需支持 4 MiB 请求体，并为图像生成保留至少 190 秒的响应等待时间。保持 `/api/pixel-me/generate` 的请求体仅在内存中流转，关闭代理层的请求体落盘和日志记录。只有当代理覆盖客户端提供的转发头时，才设置 `PIXEL_ME_TRUSTED_PROXY` 为该代理的确切 IP，以按访客 IP 限制生成频率。健康检查地址为 `/api/pixel-me/status`。生产验收应确认其 `generationEnabled` 为 `true`，再用实际照片完成一次生成和发布。 [Waitress 参数说明](https://docs.pylonsproject.org/projects/waitress/en/stable/arguments.html)
