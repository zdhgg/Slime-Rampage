# 小怪（敌人）当前美术方案

> 当前生效版本：`current-r2`，与六种史莱姆同一套材质规则。这份文档是后续敌人造型、姿态和战斗表现的唯一入口。
> 旧的 `ArenaKnight*` / `ArenaMage*` 原型（直线多边形、固定 64px 缓存）已删除，不再作为设计依据。

## 为什么重做

- 同屏有四套画风：新史莱姆是圆润扁平+，旧骑士/法师是直线硬边，弓手/魔像是厚涂 PNG，其余五职是早期渐变精灵。
- 旧骑士整张脸被面罩盖住、没有表情；冷青灰配色与森林的明度几乎相同；描边近黑，整体偏脏。
- 敌人没有接地阴影；缓存与实时两套绘制的步态相位单位不一致；缓存固定 64px，DPR 2 发软。

## 统一规则

- 顺序固定：**轮廓 → 外部身份锚点 → 表情 → 材质**。不能用换色代替轮廓差异。
- 材质直接复用 `slime-art/slime-painter.js`：暗部 / 底色 / 亮部 + 一个高光 + 同色系描边，描边按屏幕像素保持恒定（r14 约 1.7px）。敌人不另写一套绘制工具；共用调色板与辅助函数在 `enemy-art/enemy-kit.js`。
- 比例：Q 版 2–2.5 头身，大头、短腿、低重心。**身体与头部轮廓保持圆润，盔甲、武器、盾牌用棱角**——既与史莱姆同属软萌世界，又能区分敌我。四足的战獒走侧身剪影。
- **必须露脸**：统一用"敌意"脸（斜眉 + 点状、狭缝或发光眼），与史莱姆的圆点眼区分。
- 人类敌人共用一枚金色"王国徽记"小菱形（骑士胸甲与盾牌），作为阵营识别。主色避开森林的绿/灰蓝区间，也避开史莱姆的六个色相；五个职业之间按色相拉开。
- 绘制空间：调用方平移到身体中心，缩放 `r * cast.scale / 100`，角色朝 +x，地面接触线在 `y = +feetY`。每个职业在自己的 `enemy-art/cast-*.js` 里登记 `baseR`（碰撞半径）、`scale`（视觉放大）、`surface`（缓存画布 CSS px）、`feetY`、`shadowRx`、可选的 `gait`（步频倍数）、`floats`（悬浮）、`frames` 与 `frameKey`；`enemy-cast.js` 汇总为 `ENEMY_CAST`。
- 视觉尺寸只放大外观，**不改碰撞半径与任何战斗数值**。
- `r < 40` 自动进入战斗 LOD：隐藏嘴型等细节。

## 已迁移职业

| 职业 | 轮廓 | 外部身份锚点（r14 必须先读到） | 主色 |
| --- | --- | --- | --- |
| 骑士 | 圆头圆身 + 左侧大盾 | 钢盔红羽 + 蓝盾金徽 + 金柄长剑 | 亮钢银 / 王国蓝 / 红羽 / 金 |
| 法师 | 圆兜帽 + 钟形袖袍，悬浮 | 兜帽后翘尖 + 发光黄眼 + 高杖金球 | 提亮的紫 / 金 |
| 战獒 | 侧身四足，唯一的横向剪影 | 尖耳 + 背脊刺鬃 + 红项圈铜钉 + 红眼 | 土黄 / 奶白 / 红 |
| 刺客 | 窄身兜帽忍者 | 紫黑兜帽 + 肤色眼带里的红色狭缝眼 + 品红长围巾 + 双匕首 | 暗紫 / 品红 |
| 弓手 | 圆脸小帽 + 大弓 | 橙羽棕帽 + 琥珀围巾 + 身侧大反曲弓 + 背后箭袋 | 橙棕 / 琥珀 |
| 牧师 | 白金法衣，悬浮 | 头顶悬浮金光环 + 胸口金十字 + 十字圣光杖 | 白金 / 金 |
| 狂战 | 壮实矮身，裸臂 | 炸毛红发 + 狼皮披肩 + 双刃巨斧 + 咆哮嘴 | 古铜 / 红发 / 钢斧 |
| 魔像 | 宽厚石躯，没有脖子 | 层叠石块 + 胸口青色核心 + 巨石拳 + 独眼缝 | 浅石灰 / 青核 |
| 怨灵 | 兜帽破袍化尾，没有腿，悬浮 | 兜帽空洞脸 + 幽绿鬼火眼 + 爪臂 + 拖地幽雾 | 幽绿 / 青白 |

姿态与驱动它的已有时钟（只读）：

| 职业 | 姿态帧 | 选择依据 |
| --- | --- | --- |
| 骑士 | 待机、移动 ×4、前摇（剑举过肩）、斩击（长剑前指 + 前冲） | `_moving` / `_walkT`；`attackCd < 0.28` 且站定；`_swingT` |
| 战獒 | 待机、奔跑 ×4、前摇（蹲伏低吼）、撕咬（头前扑、张口） | 同上；步频 ×1.6 |
| 法师 | 待机、移动 ×4（袍摆波浪）、蓄力（杖抬起、金球放大、副手聚光）、发射（杖前推、金球白闪） | `attackCd < 0.5` 且站定；`_shootFlash` |
| 弓手 | 待机、移动 ×4、拉弓（弦拉满、箭上弦）、放箭（弦回弹） | `attackCd < 0.45` 且站定；`_shootFlash` |
| 刺客 | 待机、移动 ×4、蓄力（后仰蹲伏、双匕首举起、红眼放光）、突刺（前倾拉长、围巾平拉）、硬直（直立垂刃、头顶星星） | `assassinState`：stalking / charging / dashing / cooldown；步频 ×1.4 |
| 牧师 | 待机、移动 ×4（袍摆波浪）、治疗（杖抬起、圣球放光、光环增亮、副手聚光） | `_healBeamTimer`；悬浮 |
| 狂战 | 待机、移动 ×4、重劈（巨斧过头）；狂暴是独立的 `r_*` 缓存键（发竖、白眼、斧芯红焰、肩头火苗），不是叠层 | `_swingT`；`isEnraged` 进缓存键；步频 ×1.25 |
| 魔像 | 待机、移动 ×4（缓慢重踏）、举拳（核心增亮）、砸地（拳落 + 扬尘碎石） | `_swingT` 归一化到 0.3s 前摇，前半举拳后半砸地；步频 ×0.8 |
| 怨灵 | 待机、移动 ×4（袍尾三片飘带交错、墓尘环绕）、索命（双臂前探、鬼火眼炽盛） | `_swingT`；悬浮；步频 ×1.1 |

蓄力与前摇姿态只在敌人站定时出现：冷却值只在站定时递减，走动中的残留冷却不应表现成"正在蓄力"。

## 运行时接入

- `src/game/enemy-art/`：`enemy-kit.js`（调色板、辅助函数、步态帧索引）、`cast-<职业>.js`（造型与姿态表）、`enemy-cast.js`（注册表）。
- `src/game/EnemyArtRenderer.js`：固定帧缓存、运动叠层、地面阴影、个体差异层与精英描边。
  - 缓存按"职业 × 姿态（× 造型变体）"建帧，**不按实体、半径或时间建**（狂战的狂暴是独立的 `r_*` 缓存键、骑士羽冠三种造型是 `#v1`/`#v2` 后缀键）；分 1× / 2× 两档（`dpr > 1.1` 用 2×，与引擎 DPR 上限 2 一致），按需构建一次。九个职业共 81 帧，加白剪影孪生帧后约 4.5 MB（1×）/ 18 MB（2×），玩家只会构建其中一档；首次遇到某职业时一次性建帧约数毫秒。
  - 每一帧带一张**白剪影孪生帧**：受击是在当前姿态上叠白，不再替换姿态，也不再盖圆斑。
  - 运动叠层（挤压、前冲、后坐、呼吸）全部由敌人已有的时钟推出，只读；突刺中不叠加走路起伏。
  - 缓存画布不可用（无头环境）时自动退回实时绘制。
- `Enemy.render`：已迁移职业画地面阴影（钉在地面接触线，不随弹跳/悬浮/翻转移动）+ `drawEnemyArt`。姿态输入见 `Enemy._artState()`，全部来自 `_walkT`、`_swingT`、`attackCd`、`_shootFlash`、`assassinState`、`flash`、`_artSeed` 与 `isElite`，渲染不写入任何战斗状态。刺客的幽影光环、蓄力红线、"破绽"字样、冲刺残影等原有特效保持不变。
- **`_walkT` 的单位是弧度，一个步态周期 = 2π**；`gait > 1` 的职业只是更快地走完同一个周期，不改 `_walkT` 的更新速率。传给渲染层的相位额外叠加 `_artSeed` 个体偏移。

## 个体差异与精英（P3）

- 每只敌人按 `_artSeed` 哈希出三件东西，同屏不再是复制粘贴：
  - **色相微调**：把已缓存的白剪影重染成变体色，再以 `hue` 混合低透明度叠回原帧——只有高饱和的配饰色偏移，钢色、白眼和剪影不变；约三分之一个体保持默认色。零额外缓存帧。
  - **体型 ±4%**：`enemySizeMul(seed)` 只作用于绘制（帧放大 + 阴影），**不动碰撞半径**；精英再乘 1.08。
  - **造型变体**：骑士作为第一章刷屏单位额外烘焙三种羽冠（高冠 / 后掠 / 窄脊），其余职业 `variants = 1` 不加缓存开销。
- **步态相位错开**：`_artState` 把 `_walkT + _artSeed` 传给渲染层（含浮空、光环、旗帜脉动等所有装饰相位），同屏步伐与呼吸不再齐刷刷。
- **精英进模型**：金色剪影描边（白剪影染金、放大 1.08 垫在原帧之后）+ 体型 ×1.08，脚下脉动金环保留为第二重标识。
- **脚点 y 排序**：`EnemyManager.renderBodies` 把可见敌人与玩家合并成一条按地面接触线排序的序列，`GameEngine` 在 player 槽位调用——南侧（屏幕下方）的后画盖住北侧的。敌人脚点 = `y + enemyArtFeet`，玩家 = `y + r*0.85`。子弹、溶解/吞噬通道、浮动文本仍在覆盖层，先后关系不变。
- `EnemyManager._drawDissolving`：溃散与吞噬通道使用同一套新美术（待机帧，按朝向翻转），不再回退到旧 `char_*` 精灵，退场时外形不再跳变。
- `TowerDefenseRenderer._drawEnemyCharacter`：`ENEMY_ROLE_MAP` 映射到的职业走同一套新美术（脚点落在路径点上，`walkTime` 按四分之一周期换算成弧度；特质光环、麻痹/支援/护罩、冰冻投影等特效环保持原样）；`siege` → `boss:gate_marshal`（塔盾城墙）、`boss` → `boss:knight`（王庭加冕）两个首领单位也走首领铸型。`boss:` id 只作美术角色，精灵回退键仍拼 `char_boss_knight_*`；独特铸型的血条改叠到 `enemyArtTop` 之上，金色八边形气场、◆ 小首领徽章与徽章字形全部保留。
- `RunnerRenderer._drawEnemy`：同理走新美术（脚点钉在地面阴影高度），`carrier_boss` → `boss:knight`；`cyber_*` 回退键同样只用无前缀精灵角色。运宝车保持原样。
- 牧师治疗光束、圣光环、狂战狂暴气场环等世界空间特效在迁移后照旧绘制。
- 全部首领单位已迁移：Arena 16 只 + 塔防 `siege`/`boss` + Runner `carrier_boss` 都解析到 `boss:*` 铸型；旧 `boss_knight` 精灵只剩各模式里的回退链（缓存不可用时兜底）。

## 首领（Arena Boss）美术方案

Arena 首领与小怪共用 `EnemyArtRenderer` 一套帧缓存 / 运动叠层 / 地面阴影 / 白剪影受击机制，但走独立的 `boss-cast.js` 注册表与 `cast-boss-*.js` 铸型，规则与小怪不同：

- **命名空间**：铸型 id 一律 `boss:<name>`，不会与旧精灵键 `boss_knight`、实体类型 `boss-knight` 冲突。
- **`unique: true`**：首领不吃个体差异（色相微调 / ±4% 体型抖动 / 造型变体 / 精英金边）——同一只首领在任何种子下造型唯一。
- **17 帧契约**：`idle`、`move0`–`move3`、`windup`、`strike`、`recover`、`r_idle`、`r_move0`–`r_move3`、`r_windup`、`r_strike`、`r_recover`、`r_roar`。`r_*` 是二阶段狂怒孪生帧（不是叠层，整帧重画），`r_roar` 是阶段切换咆哮帧；`frameKey = st => bossFrameKey(st, .8)` 统一从 `attackPresentation` 阶段、`_moving`、`_walkT` 等已有时钟推出，只读。
- **体格**：`motionMul: 2.2`（运动叠层振幅放大，表现重量感）、`gait: .8`；`baseR` 34–40，`scale` 1.1–1.18，`surface` 200–229 px（逐帧安全边距 ≥ 9 px）；`topY` 声明头顶高度，血条在 `topY` 之上排布；悬浮型首领（法师系 6 只）带 `floats: true`，阴影随悬浮缩小。
- **独特铸型不吃尺寸抖动**：`enemyArtUnique(type)` 与 `drawEnemyArt` 同源；身体强制 `mul = 1` 之外，地面阴影（`drawEnemyShadow`）与脚点（Runner / 塔防的 `enemyArtFeet` 调用）也对 `sizeMul` 免疫——首领的阴影不再跟未抖动的身体错位抖动。
- **解析**（`bossArtId(entity)`，`boss-cast.js:61`）：有 `stageBossId` 的远征首领优先取 `boss:<stageBossId>`，未注册时退回该关卡的 `archetype` 原型；通用首领按类型映射——`boss-knight`→`boss:knight`、`boss-mage`→`boss:mage`、`boss-archer`→`boss:archer`、`boss-final`→`boss:final`、`boss-expedition`→`boss:court_commander`。
- **缓存开销**：与小怪同一 `EnemyFrameCache`；每铸型 17 帧 × 2 档（1×/2×），每帧带白剪影孪生帧。16 只首领实测约 5.3–6.7 MB（1×，含白剪影）/ 21–27 MB（1×+2× 合计），单只首次建帧约 38–82 ms。
- **受击白闪**：复用帧缓存自带的白剪影孪生帧（`hurt` 通道），`Boss.render` 在 `artMode === 'cache'` 时不再盖圆斑；`cache` 不可用退回实时绘制时仍盖旧圆斑兜底。狂怒 + 白闪同时在场时，`Boss.render` 在身体之后在头肩线上补三点活动余烬（两层径向光点），让二阶段红怒读法在白闪下仍可读；白闪本身仍是主反馈。

### 首领铸型名册（16）

| id | 名称 | 原型 | baseR × scale | surface | 最小安全边距（1×/2×，最差帧） |
| --- | --- | --- | --- | --- | --- |
| `boss:border_warden` | 边防官 洛恩 | knight | 36 × 1.12 | 216 | 11.0 / 11.5 px（r_roar） |
| `boss:beacon_engineer` | 信标术士 赫兹 | mage，悬浮 | 34 × 1.18 | 221 | 10.0 / 10.0 px（windup / r_roar） |
| `boss:hunt_captain` | 猎团长 薇拉 | archer | 34 × 1.18 | 221 | 10.0 / 10.5 px（windup） |
| `boss:gate_marshal` | 王城盾将 巴尔德 | knight | 36 × 1.14 | 225 | 9.0 / 9.0 px（r_roar） |
| `boss:ash_paladin` | 灰烬圣骑 阿斯特 | knight | 36 × 1.14 | 219 | 9.0 / 9.0 px（strike） |
| `boss:throne_guard` | 王座近卫 赫克托 | knight | 36 × 1.12 | 226 | 9.0 / 9.0 px（strike） |
| `boss:court_commander` | 讨伐统帅 雷欧尼斯 | knight | 36 × 1.14 | 209 | 9.0 / 9.0 px（strike） |
| `boss:knight` | 通用骑士首领 | knight | 36 × 1.14 | 209 | 9.0 / 9.0 px（strike） |
| `boss:nest_inquisitor` | 净巢司祭 伊诺 | mage，悬浮 | 34 × 1.18 | 212 | 14.0 / 14.0 px（idle） |
| `boss:relic_keeper` | 王庭司库 赛芙琳 | mage，悬浮 | 34 × 1.18 | 220 | 10.0 / 9.5 px（r_roar） |
| `boss:tomb_regent` | 守陵王魂 奥德里克 | mage，悬浮 | 34 × 1.18 | 200 | 12.0 / 12.0 px（r_roar） |
| `boss:seal_archbishop` | 封印主教 弥迦 | mage，悬浮 | 34 × 1.18 | 206 | 12.0 / 12.0 px（r_roar） |
| `boss:mage` | 通用法师首领 | mage，悬浮 | 34 × 1.18 | 216 | 14.0 / 13.5 px（r_roar） |
| `boss:last_marshal` | 末代元帅 凯恩 | archer | 34 × 1.18 | 226 | 9.0 / 9.0 px（strike / recover） |
| `boss:archer` | 通用弓手首领 | archer | 34 × 1.18 | 200 | 11.0 / 10.5 px（recover） |
| `boss:final` | 最终英雄 | final | 40 × 1.10 | 229 | 9.0 / 9.5 px（strike） |

法师系六只靠**体型轮廓**区分，不再只是法器差异：王魂窄肩溶进一条不对称破尾（没有腿）；封印主教方肩直下、四块封符钉在四角对角线；净巢司祭高窄尖顶头罩 + 前倾 + 吊链香炉垂到一侧；王庭司库永远驼背、头大钥匙垂在身侧、双圣球贴肩；通用法师是矮圆球身 + 宽平帽檐 + 收尖胡子；信标术士保留提灯光环作为锚点、长袍改暖紫避开暗影史莱姆的藏蓝。其余打磨：边防官枪管加粗带重枪口环（不再像望远镜）、咆哮震线加粗加长、猎团长 strike 是整个弓臂前扑 + 离弦箭，与拉弓前摇明显分开。

（`boss:expedition` 无独立铸型：`bossArtId` 把通用远征首领映射到 `boss:court_commander`。）

### 首领评审与取证

- 评审板：`node test-support/boss-art-board.mjs [tag]`（需运行中的 Vite 开发服务器，`GAME_URL` 默认 `http://127.0.0.1:13093`），输出到 `.tmp-boss-art/`：16 只首领 × 17 帧立绘、剪影 / 灰度（与六只史莱姆、普通骑士/法师/弓手同排，1:1 与 2×）、混战场面（阴影、攻击态、咆哮、狂怒、白闪）、全部缓存帧含白剪影孪生 2×、以及 `bounds.json` 逐帧逐档安全边距与缓存内存 / 建帧耗时。
- 真实战斗取证：`DPR=1|2 node test-support/boss-art-capture.mjs [tag]`，输出到 `.tmp-boss-art/game/`。用引擎自己的 `beginExpeditionStageBoss` / `spawnBoss` 在玩家附近生成真实首领（stageBossId 走真实 `bossArtId` 解析），冻结 `update` 后按命名姿态截图：idle / moving / telegraph / release / recover / roar / enraged / hurt / mage-telegraph / mage-fire / mage-moving，外加混编全景；`dpr*-info.json` 记录生成实体、解析 artId、DPR、耗时与捕获清单。仅用于视觉检查，不改战斗状态。
- 塔防 / Runner 首领取证：`DPR=1|2 node test-support/td-runner-boss-capture.mjs [tag]`，输出到 `.tmp-boss-art/game/`。经真实 UI 进第一关塔防 / marathon 突围，用各玩法自己的工厂注入 `siege`、`boss`、`carrier_boss` 并冻结在路径 / 车道上截图。
- 剪影排查：`node test-support/boss-sil-ascii.mjs` 把每只首领的 idle / strike / r_roar 打印成 ASCII 剪影并给出全员两两 IoU，供无头环境审形。
- 契约断言：`node verify-boss-art.mjs` 断言名册恰好为上述 16 个 id；另断言塔防 / Runner 首领映射、独特铸型阴影不吃 `sizeMul`、狂怒受击余烬叠层在狂怒 + 白闪时确实存在。

### 已知遗留弱点

- `strike` / `r_roar` 帧的余量多数停在 9–10 px（王城盾将、骑士系、末代元帅、最终英雄、王庭司库）：武器或姿态再加长前要先跑 `bounds.json`。
- 塔防 / Runner 不驱动狂怒状态，每只铸型里 `r_*` 孪生帧在那两条管线是缓存开销但不绘制——已接受，不特判。
- Runner 的 `carrier_boss` 借 `boss:knight` 铸型，与塔防 `boss` 同型同框时只是不同阵营语境；若日后要区分"运宝要塞"需另起铸型。
- 白闪整帧变白仍会盖住 `r_*` 的怒色——已由 Boss.render 的三点余烬补偿；若白闪节奏再加快，需复查余烬是否跟得上。

## 评审与验证

- 评审板：`node test-support/enemy-art-board.mjs [tag]`（需要运行中的 Vite 开发服务器，`GAME_URL` 指定地址），输出到 `.tmp-enemy-art/`：全部姿态立绘、新旧对比（旧 = 游戏里原来实际绘制的精灵，含 3 倍像素放大）、剪影与灰度（与六只史莱姆同排）、混战 1:1、全部缓存帧、画布安全边距与缓存开销。首领对应物是 `test-support/boss-art-board.mjs` → `.tmp-boss-art/`。
- 真实战斗取证：`DPR=1|2 node test-support/enemy-art-capture.mjs [tag]`。除骑士外的职业由引擎自己的 `spawnAt` 放在玩家附近，仅用于视觉检查。首领对应物是 `test-support/boss-art-capture.mjs` → `.tmp-boss-art/game/`。
- 契约测试：`npm run test:arena-knight-mage`（已并入 `npm test`，文件名沿用旧名）。无头环境覆盖：全部帧在战斗 / 精英 / 立绘三种尺寸可绘制、每个职业的每个姿态都可达、相位单位与步频、运动叠层有界、阴影接地、缓存数量恒定与两档复用、受击叠层、渲染对战斗时钟只读、退场通道、未迁移职业无回归、旧原型已删除。该测试不比较像素。

## 后续设计的硬门槛

新职业或新姿态进入主分支前，需要同时满足：

- 与六个史莱姆、已迁移敌人并排时，黑剪影在 r14 / r26 下不依赖颜色即可区分；
- 灰度下保持亮 / 中 / 暗档位，不全部挤在中灰；
- 放入真实 Arena 截图（1:1，DPR 1 与 2）后一眼可找到；
- 待机、移动、前摇、出手、受击只改变姿态与叠层，不改角色身份；
- 颜色登记在 `enemy-kit.js`、锚点登记在对应 `cast-*.js`，不在组件或实体里重复定义；
- 通过 `npm run build` 与 `npm test`。
