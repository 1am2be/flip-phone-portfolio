# 00s Room · 一通来自 00 年代的来电

这是互动作品集的新版发布源。运行目录是 `room-whitebox/`，包含三维房间、旧版翻盖手机作品集、简历、CCD 摄影和 PIXEL ME。

## 启动

从仓库根目录运行以下命令。Windows 本地也可以双击 [launch-preview.cmd](room-whitebox/launch-preview.cmd)。

```bash
python -m pip install -r room-whitebox/requirements.txt
python room-whitebox/preview.py
```

服务器部署入口如下。端口按平台要求配置。

```bash
python room-whitebox/preview.py --production --host 0.0.0.0 --port 8080 --no-browser
```

在部署平台的密钥设置里配置 `OPENAI_API_KEY`。将 `PIXEL_ME_DB_PATH` 指向持久磁盘中的 SQLite 文件，例如 `/data/wall.sqlite3`。保持一个应用实例，并在同一个 HTTPS 站点上提供页面和 `/api/pixel-me/*`。 [服务端配置与数据说明](room-whitebox/PIXEL-ME.md)

## 替换旧版作品集

1. 读取旧发布项目的域名、托管类型和可回滚版本。仓库 `main` 分支的 `HANDOFF.md`、`.openai/hosting.json` 和 `dist/` 记录的是旧版 WorkBuddy 静态发布。
2. 从发布分支先起一个预览部署。若原托管项目仅提供静态文件，选用支持常驻 Python 进程和持久存储的服务，确认旧网址能否切到新版。
3. 用桌面和手机验证房间旋转、来电及六个手机板块、简历下载和 CCD 回放。检查 `/api/pixel-me/status` 的 `generationEnabled`，用一张经本人同意的测试照片验证生成、穿搭描述、透明 PNG 下载、可选昵称和双会话合照可见性。服务重启后复验合照记录。
4. 通过预览验收后再切换已有生产域名或托管入口。保留旧发布版本和回滚方法。如果平台生成的网址无法迁移，先报告可保留原网址的办法，再确认切换范围。
