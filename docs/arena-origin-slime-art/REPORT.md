# Arena 原始史莱姆美术定型报告

日期：2026-10-30
分支：`codex/arena-origin-slime-art`
基线：`19d9784`（上一阶段 Arena 骑士/法师真实验收记录）

本阶段只改造 Arena 的 `origin` 原始史莱姆。暴食、弹射、元素、暗影、共生史莱姆以及普通敌人和 Boss 的运行时美术没有切换或重构；主线战斗逻辑、碰撞半径、数值、技能机制和时序保持原样。

## 实现结果

`src/game/ArenaOriginSlimeArt.js` 是原始史莱姆的专属身体和五官绘制模块。身体使用 400×320 坐标空间，保留不规则低重心轮廓和叶冠识别点，分为受光体积、腹部透光、底部内暗、少量气泡、上左柔和高光和边缘描边。身体优先绘制到一次性的离屏缓存；缓存不可用时实时重画同一套矢量图，并记录警告，不切回旧 PNG。

五官始终实时绘制，提供 idle、blink、hurt、lowhp、angry 和 devour 六种状态输入。`Player.render()` 继续复用既有待机呼吸、移动拉伸、攻击前探、受击波纹、红闪、无敌闪烁、元素粒子、接地阴影和状态时钟；Arena 原始史莱姆另外加入了小幅移动回弹与受击反冲。急停 wobble 只对 Arena 原始史莱姆使用移动边沿触发，其他血统保留原逻辑。原始史莱姆低血量和眨眼表情优先于持续移动表情，确保走位时也能读到这两种状态。

绘制失败会在控制台记录 `[Arena origin slime]` 错误，并在角色位置画出洋红色 `ART ERROR` 标记。这样缓存失效可以技术性降级到同视觉的实时绘制，核心程序化绘制失败则明确可见，不会静默使用厚涂旧图。

可复用基础仍由现有 `SlimeRenderer`、`SlimeAppearance` 和 `Player` 状态层提供：身体缓存接口、实时五官、剪影填充/描边、统一脚点、受击/进化叠层和连续形变。原始史莱姆只新增自己的轮廓、材质层和脸型；后续暴食可替换宽体与巨口，元素可替换核心和内部流动，暗影可替换特殊轮廓，均不需要共享同一身体模型。

`src/components/SlimePortrait.vue` 的 origin 预览也改为同一轮廓和材质语言；其他血统仍使用已有 Art V1 资源。Arena 运行时不再调用 `artV1SlimeOrigin`，但仓库中的 Art V1 文件和其他史莱姆资源保留，未提前清理。

## 真实 Arena 证据

以下文件均来自正常注册、菜单选择、确认出发和自然战斗，没有注入敌人、修改生命或跳过玩法状态：

- [real-normal.png](real-normal.png)：第一章正常战斗，原始史莱姆与森林和骑士同屏。
- [real-peak-density.png](real-peak-density.png)：自然产生的 28 个可见骑士，主角仍可定位。
- [real-mixed.png](real-mixed.png)：第二章营道，原始史莱姆、骑士、法师、战獒和技能弹体同屏。
- [real-mageCast.png](real-mageCast.png)：法师真实施法状态（`_shootFlash > 0`）的混合战斗帧。
- [real-battle.webm](real-battle.webm)：约 11.96 秒真实混合战斗录像，包含移动、弹体和场景切换。
- [real-slime-moving.png](real-slime-moving.png)、[real-slime-stop.png](real-slime-stop.png)：同一真实战斗中移动拉伸和急停回弹帧，捕获时 `moveBlend` 分别超过 0.80、`_stopJitter` 为 0.13。
- [real-slime-face-blink.png](real-slime-face-blink.png)、[real-slime-face-hurt.png](real-slime-face-hurt.png)、[real-slime-face-angry.png](real-slime-face-angry.png)：按 Player 实际渲染状态捕获的眨眼、受击和移动表情帧。
- [real-normal-slime-close.png](real-normal-slime-close.png)、[real-mixed-slime-close.png](real-mixed-slime-close.png)、[real-mageCast-slime-close.png](real-mageCast-slime-close.png)：从上述真实帧裁出的近景，用于检查小尺寸轮廓和表情清晰度。
- [real-dpr2.png](real-dpr2.png)、[real-dpr3.png](real-dpr3.png)、[real-zoom125.png](real-zoom125.png)：真实战斗中的设备像素比和 125% 等效视口检查。
- [runtime.json](runtime.json)：完整采样、状态帧时刻、缓存统计、捕获时刻和页面错误记录。

本轮 `runtime.json` 的 `errors` 为空，原始史莱姆 `strain` 为 `origin`。Arena 骑士缓存调用 94,067 次、法师缓存调用 6,174 次；旧 `artV1SlimeOrigin` 绘制计数为 0，唯一旧 Art V1 调用为边界守卫资源。DPR 1 共记录 7,494 个样本，CPU render 平均约 0.66 ms；自然密度峰值为 28 个可见敌人。DPR 2/3 条件仍出现较长呈现间隔，这是上一阶段已记录的环境/呈现问题，本阶段没有把它归因于史莱姆身体缓存，也没有扩展底层性能修复。

视觉复核结论：主角保持比森林更亮的灰绿主体，深色边缘和固定上左高光与新版骑士、法师相容；不规则底缘和叶冠避免了绿色圆球观感。缩小到实际战斗尺寸时眼睛、嘴、轮廓和接地影子仍可读。真实战斗截图覆盖移动、急停、受击、眨眼、混合敌人和骑士密集场景，没有发现锚点跳变或错位。低血量脸型现已优先于移动表情，但本次自然战斗在低血量阈值前通过升级恢复了生命，没有捕获一张低血量实战帧；未通过写入玩家生命的方式补造截图。

## 验证

- `npm test`：完整回归套件通过。
- `npm run build`：通过；保留既有大于 500 kB 的构建分块提示。
- `node verify-art-v1.mjs`：通过；Art V1 资源清单仍为 16 个 RGBA PNG，origin 改由程序化模块验证。
- `node verify-arena-knight-mage.mjs`：通过。
- `node --check src/game/ArenaOriginSlimeArt.js`、`node --check src/game/entities/Player.js`：通过。
- 真实 Arena 验收脚本：完整正常登录并推进至第二章，`runtime.json` 页面错误为空，已保存上述截图和录像。

本阶段停止在原始史莱姆样板。没有开始暴食、元素或暗影史莱姆的美术改造。
