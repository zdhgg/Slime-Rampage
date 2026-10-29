# Art V1 implementation record

本批次是规划中的第一垂直切片，不替换全部角色资源。它验证高细节厚涂幻想风在实际战斗尺寸、既有地图、预警和 Boss 只读接口下是否可读，并把六种史莱姆做成真正不同的轮廓和材质语义，而不是同一张图换色。

## 已实现

- `public/assets/art/v1/slime-origin-v1.png`：原生黏液的厚涂样板。
- `public/assets/art/v1/slime-glutton-v1.png`：宽体、巨口、酸液胃核的暴食史莱姆。
- `public/assets/art/v1/slime-ricochet-v1.png`：蓝色棱面、琥珀反弹核心和回弹翼片的弹射史莱姆。
- `public/assets/art/v1/slime-elemental-v1.png`：紫色晶体体型、元素碎片和多色元素核心的元素史莱姆。
- `public/assets/art/v1/slime-shadow-v1.png`：低矮弧形、紫红凝胶和暗影触须的暗影史莱姆。
- `public/assets/art/v1/slime-summoner-v1.png`：金色黏液、种子核心和近身共生种子的共生史莱姆。
- `public/assets/art/v1/enemy-knight-v1.png`：普通近战敌人的磨损铁甲、圆盾和短枪样板。
- `public/assets/art/v1/boss-border-warden-v1.png`：边防官枪盾样板，盾与枪管保持远距离轮廓。
- `public/assets/art/v1/manifest.json`：资源键、回退路径、锚点和来源记录。
- `AssetManager._loadArtV1Images()`：异步加载样板资源；加载失败时继续使用现有程序化精灵。
- `AssetManager.drawArt()`：以实体中心为锚点、保持宽高比绘制，不改变碰撞、位置或时间。
- `Player`、`Enemy`、`Boss` 和 `BorderWarden`：仅在对应样板资源成功加载时使用新图；其他血统、职业和 Boss 继续走旧回退路径。
- `docs/art-v1-sample/vertical-slice.png`：1280×800、第一阶段、残兵开启的实机样板截图。
- `docs/art-v1-sample/slime-roster.png`：六种史莱姆的统一锚点和差异化轮廓对照。

## 接口与边界

样板 Boss 通过 `BorderWarden.artKey` 读取 `artV1BorderWarden`，动作阶段仍来自 `attackPresentation`。本批次没有新增攻击阶段，也没有把枪盾命中几何烘焙进图片。玩家与普通敌人的新图只替换视觉层，逻辑半径、攻击方向、受击和预警保持现有实现。

所有资源都拥有透明背景，PNG 为 RGBA。资源只在浏览器加载后启用，静态测试和无 DOM 环境仍使用当前程序化后备。文件名带 `v1`，不会覆盖既有资源。

## 生成与审阅

使用 Codex ImageGen 内置模式生成三张透明角色切图，提示词分别要求：厚涂幻想风原生黏液、普通磨损铁甲枪盾守卫、边防官枪盾 Boss；均禁止背景、文字、水印和额外角色。生成文件经过 RGBA、透明角点、尺寸和单文件 3MB 上限检查。

样板截图的审阅重点是：六种史莱姆是否能通过轮廓和内部核心快速区分，玩家与 Boss 的材质对比、普通敌人的轮廓、枪盾武器识别、预警是否仍高于背景、旧回退角色是否能与新样板共存。当前样板已显示新图在 1280×800 战斗视口中可用；暴食和暗影的细节密度与主体尺寸仍需在正式批次继续收敛，暗影尤其需要提高小尺寸下的眼神/核心对比。

## 下一批次

待样板确认后，继续完成其他五种史莱姆和普通敌人职业，再扩展四名近战 Boss 的独立武器套件。普通敌人和 Boss 会同步推进，避免 Boss 先达到最终精度而造成全局割裂。
