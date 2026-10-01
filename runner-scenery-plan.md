# 决战远征（Runner）背景升级实施方案

> 目标视觉对标：`concept_bg_v1.jpg`（三层视差 + 暖色点缀 + 拱门 + 雾带 + 辉光 + 暗角）
> 状态：**已完成（Phase 1–4 全部通过，2026-10-02）** ｜ 审批通过后按 Phase 1→4 顺序执行

---

## 1. 目标与范围

- **目标**：将 Runner 模式背景从「渐变 + 程序化天际线 + 稀疏路边物」升级为三层视差、带雾深、暖色光点、周期拱门的氛围场景，视觉效果对标 `concept_bg_v1.jpg`。
- **范围内**：纯视觉层 —— `RunnerRenderer.js`、新建 `RunnerScenery.js`、`RUNNER_SCENE_PROFILES` 配色扩展、新增 verify 脚本。
- **范围外（红线）**：不动 `RunnerRules.js` / `RunnerGameplay.js` / 碰撞 / 计分 / lane 逻辑；不引入 WebGL 或游戏引擎；不增大体积超过 200KB 的素材。

## 2. 技术选型（结论先行）

| 技术点 | 选型 | 理由 |
|---|---|---|
| 渲染管线 | 沿用 **Canvas 2D** | 项目无 WebGL 基座，2D 足够实现该风格 |
| 静态层 | **离屏烘焙一次 + 帧循环 blit** | 照搬 `FrontierScenery.prepareFrontierSprites()` 已验证范式 |
| 滚动 | **无缝平铺条带**（宽度 = 2×屏宽，modulo 偏移） | 无限滚动且零 path 构建 |
| 视差 | 复用已有 `depthToY()` / `scrollDistance` | 无需新机制，只加系数 |
| 辉光 | **烘焙径向渐变精灵 + drawImage**，禁用 `shadowBlur` | Canvas 2D 的省钱 bloom；shadowBlur 帧内十几个必掉帧 |
| 雾效 | 屏幕空间线性渐变带 ×2 | 一次 fillRect 完成纵深，不逐物体 |
| 素材染色 | 加载期 `source-in` 合成烘焙染色版 | 统一 Kenney 素材色调，帧内零成本 |
| DPR | 对齐 `GameEngine.dpr`（≤2），烘焙 2× | 与现有 sprite 烘焙一致，高清屏不糊 |
| 微粒 | 复用 `AmbientLayer` 池思想（预分配 + 空界回收），depth-space 简化版 | 帧内零分配 |

## 3. Phase 划分（每阶段独立验收、独立可回滚）

### Phase 1 — 基础设施：`RunnerScenery.js`
新建 `src/game/runner/RunnerScenery.js`，对标 `FrontierScenery.js`：

```
导出 class RunnerScenery（按尺寸惰性烘焙）
  prepare(width, height, dpr)          // 尺寸变化时重烘焙；node/无 document 时优雅跳过
  drawSkyline(ctx, scroll, profile)    // 远景条带，视差 0.2
  drawMidground(ctx, scroll, profile)  // 中景染色城市条带，视差 0.5
  drawFogBand(ctx, which, profile)     // 雾带 A / B
  drawGate(ctx, x, y, w, profile)      // 拱门精灵
  drawLampGlow(ctx, x, y, r, profile)  // 路灯暖光晕精灵 blit
  props[]                              // 确定性生成的道具生成表
```

烘焙内容：
- **skyline 条带**（2×屏宽 × 130px）：种子随机程序化塔楼群，替代现在每帧 48px 步进画天际线的写法；
- **midground 条带**（2×屏宽 × 220px）：Kenney 等距楼（`runnerCity01–10`）+ 深青蓝 `source-in` 中性染色 + `prepareFrontierSprites()` 同款 dpr=2 放大；
- **gate 精灵**（256×160）：拱门 + 青色光带；
- **lampGlow 精灵**（128×128）：琥珀色径向渐变。

**验收**：node 下 import 不报错；烘焙函数产出非空 canvas；spawn 表确定性（同 seed 同结果）。

### Phase 2 — 接入渲染层 + 暗角
改 `RunnerRenderer.js`：
- `ensureLayout()`：尺寸变化时调用 `scenery.prepare(w, h, dpr)`；
- `_drawBackdrop()`：删除 section 2 每帧程序化天际线 → `drawSkyline()`；`_drawExternalHorizon()` 保留城堡/巨环，city billboards 循环替换为 `drawMidground()`；天际线与中景间插雾带 A，中景与路面间插雾带 B；
- `render()`：`ctx.restore()` 后追加静态暗角（缓存 radial gradient，alpha≈0.25，与 damageFlash 叠加）。

**验收**：三层视差肉眼可见；雾带过渡自然；`_drawBackdrop` 每帧耗时不升反降（移除逐帧 path）。

### Phase 3 — 近景丰富 + 暖色点缀
- `_drawRoadsideLandmarks()` 扩展：保留能量塔；栅栏升级为发光能量栅栏（fence 位图 + accent 描边，已有雏形）；**新增路灯类型**（灯杆 + 烘焙暖光晕 blit + alpha 呼吸）；
- 新增**周期拱门**：按 `scrollDistance` 每 ~600px 生成一座，居中横跨路面，通过时可选闪光反馈；
- 侧边 speed lines 循环增加**漂浮微粒**（池化，约 24 颗）；
- `RUNNER_SCENE_PROFILES` 全部 8 个 profile 增加 `lamp` 暖色键（7 个已有 + default）。

**验收**：效果对标概念图；fever 时光晕增强（延续现有 `isFeverActive ? +0.12` 模式）。

### Phase 4 — 验证与调优
- 新增 `verify-runner-scenery.mjs`（对齐现有 `verify-frontier-scenery.mjs` 传统）：断言烘焙精灵非空、视差 offset 回 wraparound 正确、spawn 表确定性、node 环境无 document 不崩溃；
- 跑全部已有 smoke test（`smoke-test.mjs`、`runner-fusion-smoke.mjs`、`gameplay-smoke.mjs` 等）确认无回归；
- 1080p + dpr=2 实测帧率不低于改动前；
- 参数集中收尾：视差系数/雾带 alpha/微粒数统一为文件顶部常量表，集中调校。

## 4. 性能预算与红线

帧循环内**禁止**：每层多次 path 构建、`shadowBlur`、新建渐变对象（全部 prepare 期建好）。
帧循环新增 `drawImage` ≤ ~40 次；`_drawBackdrop` 总耗时不高于改动前。

## 5. 风险与回滚

| 风险 | 对策 |
|---|---|
| 视差/雾感不对 | 全部参数集中常量表，单点调 |
| 帧率下降 | Phase 3 后实测；超标先降微粒数与栅栏辉光 |
| 需要回滚 | 保留旧 `_drawBackdrop` 逻辑为 `_drawBackdropLegacy()`，Phase 4 验收通过后才删除 |

## 6. 待批准事项

1. 是否按 Phase 1→4 全量执行（可裁剪为 1–2）；
2. git commit 粒度：每 Phase 一个 / 全部完成后一个 / 暂不 commit；
3. Phase 3 是否同步制作「生成精灵图」替换程序化图形（建议先否，跑通后再评估）。

---

## 7. 执行记录（2026-10-02）

**审批结果**：Phase 1→4 全量执行；全部完成后统一 commit。

**实际落地与方案的偏差（均已验证）**：
1. 文件路径为 `src/game/gameplay/runner/RunnerScenery.js`（与 RunnerRenderer 同级，便于共享几何），非方案的 `src/game/runner/`；
2. 中景采用**程序化剪影 + 暖窗光**而非 Kenney 位图染色——消除异步素材依赖、剪影控制更贴合概念图，Kenney 城堡/塔楼仍留在远景点缀；
3. 拱门排期增加**半间距相位**：避免开局第一帧有巨物拱门贴在玩家平面；
4. **拱门必须画在路面之后**：初版画在 `_drawBackdrop` 被路面梯形完全遮盖（浏览器实测发现），已移至 `_drawRoad` 之后、实体之前；
5. 临时验证页 `scenery-preview.html` 已完成使命并删除。

**验收证据**：
- `verify-runner-scenery.mjs`：node 无 document 安全降级、拱门/微粒确定性、视差与雾带不变量、RunnerRenderer 全渲染路径 smoke；
- `npm test` 全量回归通过（22 个 smoke/verify 脚本，含既有 runner fusion / gameplay / tower defense 等）；
- 浏览器实测（1600×900 预览页）：烘焙天际线 + 中景楼群暖窗 + 双层雾带 + 拱门穿越帧 + 路灯呼吸辉光 + 暗角，fever 态辉光增强均符合预期。

**调参入口**：`RunnerScenery.js` 顶部 `SCENERY_CONFIG`（视差系数、雾带高度、拱门间距、微粒数）。
