# 瓶子堆整理大师

手机竖屏的层叠拾取 + 倒水排序游戏。JavaScript / Three.js / Vite，纯前端，无后端和数据库。

## 直接打开游戏

已构建时，**直接双击 `dist/index.html`** 即可游玩，无需启动 Node 或安装静态服务器。这个文件内嵌了游戏代码、Three.js 和样式，无远程字体、图片或网络请求。

项目根目录的 `index.html` 是开发入口；直接双击它时会自动跳转到 `dist/index.html`。若尚未构建，先按下方步骤生成 `dist/`。

## 开发与构建

需要 Node.js 20.19+ 或 22.12+。

```sh
npm install
npm run dev
```

开发时打开终端显示的 Local 地址。手机与电脑在同一网络时，可使用终端显示的 Network 地址。

```sh
npm run build    # 生成单文件 dist/index.html
npm run preview  # 通过本地 HTTP 检查构建结果
```

将 `dist/index.html` 上传普通静态网页托管即可；也可离线双击打开。Node 仅用于开发与打包。

## GitHub Pages 发布

游戏网址：https://fumoto0226.github.io/bottlegame/

仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
不要直接选择 `main / (root)`：根目录的 `index.html` 是 Vite 开发入口，Pages 不会自动执行 npm 构建，直接发布会白屏。

`.github/workflows/pages.yml` 会在每次推送到 `main` 后安装依赖、运行测试、构建，再发布 **`dist/`**。也可以在 Actions 中打开 **Deploy game to GitHub Pages**，点击 **Run workflow** 手动发布。等待部署成功后访问上方网址。

`vite.config.js` 使用相对路径 `base: "./"`，且构建输出为完整内嵌脚本和样式的单文件，兼容 `/bottlegame/` 项目路径及离线双击。

## 玩法

点击没有被遮挡的瓶子进入工作台，最多同时容纳五瓶。先选有水的源瓶，再选空瓶或顶部同色且有空间的目标瓶。自动转移顶部连续同色液体，容量为四单位。满四格单色瓶自动消除，空瓶保留作周转。工作台满且没有任何合法倒水操作才失败。

每关开局已有两个周转空瓶放在手里，另有三个可拾取位置。瓶堆清空且所有液体消除后自动回收空瓶通关。此规则调整已由项目方确认。

打开游戏后先进入主页面，可自由选择六个关卡。游戏内左上角返回主页面，右上角重新开始。底部只显示四个半透明瓶形虚线位置；已移除提示、音乐、步数和剩余瓶数。支持鼠标、触摸与 Tab / Enter；F 键切换全屏。满瓶先落下原版软木塞，再缩小消除。

## 原版 3D 与 UI

按项目方于 2026-10-26 确认“已有作者授权，可直接复用”，现已接入 [Evgeny-/water-sort](https://github.com/Evgeny-/water-sort) 的原版玻璃瓶、液体体积/截面 shader、水流和粒子组件，以及选定的背景、配色、按钮和关卡面板样式。层叠拾取与四槽规则由本项目实现，构图为手机竖屏。

来源、版本与授权依据见 `src/vendor/water-sort/README.md`；源码分析见 `docs/reference-analysis.md`。

## 项目结构

- `src/rules.js`：纯规则、状态转换、合法操作、求解器。
- `src/levels.js` / `src/level-data.js`：六关数据，颜色由瓶底到瓶口，堆放坐标、朝向、掉落顺序；可拾取性由 `src/pile.js` 的几何遮挡和沉降计算。
- `src/view.js`：参考相机、倒水编排、合并的连续同色液体、盖塞与渲染缓存。
- `src/vendor/water-sort/`：原版模型、shader、粒子、支持类型及选定的 UI 样式。
- `src/main.js`：点击锁、拾取、倒水、消除、通关、提示、音效。
- `src/style.css`：选关主页、手机竖屏布局与四个瓶形虚线槽。
- `docs/solutions.json`：三关合法通关路径。

三个关卡分别有 15 / 28 / 41 步可行路径，不宣称最优步数。关卡数据固定，至少存在一条可行路径；玩家仍可能因操作顺序进入死局。

## 验证

```sh
npm test
npm run verify
npx playwright install chromium
```

运行开发服务器后执行浏览器回归（默认端口 5174，可通过 GAME_URL 覆盖）：

```sh
node scripts/browser-test.js
```

验证离线双击打开（先构建）：

```sh
node scripts/file-test.js
```

验证 HTTP 静态发布包（先运行 `npm run preview -- --port 4174`）：

```sh
node scripts/static-test.js
```

测试截图输出到忽略的 `test-results/`，过程记录见 `progress.md`。开发模式开放 `window.gameTest`，发布包不包含该开发入口。另提供 `render_game_to_text`、`advanceTime` 供自动化调用。

需要支持 WebGL 的现代浏览器；已检查桌面及模拟手机视口，真实手机硬件的帧率与电耗尚未测量。

液体、盖塞与倒水的确定性截图检查：

```sh
node scripts/visual-test.js
```

本轮响应修正包括按需重建液层、复用按钮、pointerdown 输入、静止时降低重绘频率及采用参考倒水时长。单独软件 WebGL 测试中拾取实际耗时由约 556ms 降至 301ms；真实设备耗时取决于浏览器和 GPU。

倒水、拾取和盖塞按瓶分别锁定，其他瓶子仍可操作，两组互不关联的瓶子可同时倒水。拾取开始时立即预留一个位置；有瓶子或已预留的位置完全隐藏虚线。仅动画中的相关瓶子暂不可点击。返回主页或重新开始会统一取消未完成操作。

并行交互回归：

```sh
node scripts/concurrency-test.js
```

`src/session.js` 负责空位预留、按瓶锁与基于最新状态的动画提交；对应测试在 `scripts/session.test.js`。

新增005/006是50只堆中混色瓶、6色的容错对照，另有2只开局空瓶。它们共用相同几何、颜色总量与完整单瓶组合；开局均匀随机连续拾取3瓶、不倒水时，未立即失败的概率分别为98.04%和77.76%，不等于全关通关率。003–006已加入关内由易到难的暴露趋势。

`docs/difficulty-analysis.json` 保存指标和限制；`docs/004-current-analysis.json` 保存当前004的24种已验证完整拾取顺序（下限，不是总数）。

```sh
node scripts/analyze-levels.js
node scripts/analyze-current-004.js
node scripts/level-visual-test.js
```
