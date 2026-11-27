# 听见你

面向视障用户、照片焦虑者和低社交压力人群的语音优先交友原型。

产品不把声音包装成新的“魅力评分”。用户用四段真实回答介绍自己，系统只根据可核对的信息给出推荐理由，并生成一条可朗读、可随时退出的安全见面路线。

## 本次迭代（2026-11-27）

上一版本是无账号的纯静态原型：资料和见面卡只保存在浏览器 `localStorage`，线上只能演示浏览流程。

这一版新增：

- 注册、登录、退出与 30 天登录状态保持，账号页支持登录 / 注册切换、错误提示和已登录面板。
- 双模式账号存储：`npm start` 使用 Node + SQLite（`data/hear-you.db`，scrypt 加盐哈希、HttpOnly Cookie）；GitHub Pages 等静态环境自动切换为浏览器 IndexedDB（PBKDF2 加盐哈希）。
- 注册成功后自动登录，并把昵称带入声音资料；刷新页面后自动恢复登录状态。
- 新增账号自动化测试，覆盖重复注册、错误密码、会话过期和数据库重开后的再次登录。

## 在线地址

正式演示（GitHub Pages）：<https://esp-jsy.github.io/tingjianni-hear-you/>

注册 / 登录：<https://esp-jsy.github.io/tingjianni-hear-you/#auth>

仓库：<https://github.com/Esp-jsy/tingjianni-hear-you>

> GitHub Pages 上可直接注册和登录，账号保存在当前浏览器的 IndexedDB；通过 `npm start` 运行时会自动切换为服务器 SQLite 数据库，账号可跨浏览器使用。

代码推送到 `main` 分支后，GitHub Pages 会自动重新发布：

```powershell
git add .
git commit -m "更新说明"
git push
```

## 界面预览

![听见你首页](docs/screenshots/home-desktop.png)

![透明匹配理由](docs/screenshots/matches-desktop.png)

![声音资料详情](docs/screenshots/detail-desktop.png)

## 本地运行

```powershell
npm start
```

打开 <http://127.0.0.1:4173>。

首次运行会自动创建 SQLite 数据库 `data/hear-you.db`。注册的账号保存在其中，重启服务后仍可继续登录；也可以通过环境变量 `HEAR_YOU_DB` 指定其他数据库文件位置。数据库文件已被 `.gitignore` 排除，不会提交到仓库。

GitHub Pages 等纯静态环境没有 Node API，页面会自动改用浏览器 IndexedDB 保存账号；此时账号只存在于当前浏览器，换设备或清除站点数据后需要重新注册。

麦克风录音需要页面运行在 `localhost` 或 HTTPS 环境。原型支持 Chrome、Edge 等现代浏览器；不支持录音时仍可完成文字填写流程。

## 快速演示

GitHub Pages 在线演示（可直接注册或登录）：

- 匹配页：<https://esp-jsy.github.io/tingjianni-hear-you/?demo=1#matches>
- 声音资料详情：<https://esp-jsy.github.io/tingjianni-hear-you/?demo=1&view=detail>
- 安全见面路线：<https://esp-jsy.github.io/tingjianni-hear-you/?demo=1&view=plan>
- 账号页：<https://esp-jsy.github.io/tingjianni-hear-you/#auth>

本地运行时可打开：

- 匹配页：<http://127.0.0.1:4173/?demo=1#matches>
- 声音资料详情：<http://127.0.0.1:4173/?demo=1&view=detail>
- 安全见面路线：<http://127.0.0.1:4173/?demo=1&view=plan>
- 账号页：<http://127.0.0.1:4173/#auth>

90 秒演示建议从匹配页开始：

1. 点击“听见周予安”，展示真实声音入口。
2. 朗读资料，指出推荐理由只引用共同兴趣和交流偏好。
3. 点击“约一次轻松见面”，生成公共空间路线和离场机制。

## 已实现

- 账号注册、登录与退出：`npm start` 时使用 SQLite + scrypt 加盐哈希 + HttpOnly Cookie；GitHub Pages 静态部署时自动使用浏览器 IndexedDB + PBKDF2 加盐哈希，登录状态保持 30 天。
- 三步资料流程：坐标、声音、匹配。
- 浏览器麦克风录音与可选语音转写。
- 基于兴趣、交流方式、小组偏好和无障碍需求的透明排序。
- 候选人的文字资料、原型朗读和可核对推荐理由。
- 公共空间见面方案、定时提醒、无障碍路线、中性离场消息。
- 高对比模式、放大文字、减少动效、键盘焦点、跳转链接和语义化表单。
- 响应式布局，390px 视口无横向溢出。
- 资料与见面卡保存在当前浏览器的 `localStorage`，录音 Blob 不写入持久存储；本地运行时账号保存在 SQLite，静态部署时账号保存在浏览器 IndexedDB。

## 真实性与边界

- 原型中的候选人声音使用浏览器朗读，并在界面上明确标注；正式产品必须播放用户本人确认过的录音。
- 当前匹配使用可解释的本地规则，没有伪装成大模型语义匹配。
- 原型包含账号注册与登录，但没有作品上传、实时同步或内容审核服务；“离场消息”只在当前页面演示。
- 账号是原型实现：GitHub Pages 上的账号只保存在当前浏览器，不能跨设备同步；暂未提供邮箱验证、找回密码和登录限流，正式上线前需要补齐。
- AI 不应生成或克隆声音、代替用户聊天，也不应推测人格、健康、收入或恋爱价值。

## 正式版技术路线

- Web/PWA：Next.js 或 React。
- 音频：对象存储、短时签名 URL、用户可随时撤回和删除。
- 匹配：结构化偏好约束 + 文本向量检索；模型只辅助摘要和活动建议。
- 安全：实名或校园身份验证、举报与屏蔽、活动双方确认、敏感信息最小化。
- 账号与数据：托管数据库和成熟身份服务，补齐邮箱验证、找回密码、登录限流与跨设备同步。
- 无障碍：NVDA、VoiceOver、TalkBack 实机测试，键盘完成所有关键流程。

## 测试

```powershell
npm test
```

`logic.js` 的排序与资料状态、`auth.mjs` 的账号与会话均有 Node 内置测试，无需安装依赖即可运行。浏览器 IndexedDB 账号模式已通过静态站点场景的注册、刷新保持、退出与重新登录验证。
