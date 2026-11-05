# 技能图标规范

技能图标由 `src/components/skillIconRegistry.js` 注册，由 `SkillIcon.vue` 绘制。升级卡、伙伴招募、路线及确认页、拟态里程碑、法术核心、元素融合和 HUD 共用此入口。

- `SKILL_ICON_KEYS` 将玩法 ID 映射到稳定的图标语义。不同技能 ID 可以共享语义，如 `com_vital` / `rico_vitality` 都使用 `vitality`；保留各自的等级、抽取和效果规则。
- `SKILL_ICON_GLYPHS` 将语义映射到 Lucide SVG。新增技能必须注册，不能以 emoji 或角色标记决定图标轮廓。缺失时显示统一的问号矢量图标，并在开发环境警告；验证脚本会拒绝缺失项。
- 卡牌图标统一为 58px 外框、34px 图形、1.8px 描边、16px 圆角；手机为 48px / 30px。HUD 使用 22px / 20px 的无框版本。
- 公共强化使用中性色；专属路线使用对应路线色，路线名由现有标签说明。所有路线共享外框形状；终极技能增加金色双线，首领奖励用金色小点标识。
- `routeIconId(spec, route)` 在路线选择与 HUD 中生成相同标识；法术发现、核心奖励和 HUD 的同系法术共享图标语义。
- 旧的 `*IconMap.js` 仅重导出注册表，旧的 `*SkillIcon.vue` 仅转发至统一组件，供兼容调用使用。新界面直接使用 `SkillIcon`。

验证命令：

```sh
npm run test:skill-icons
npm run test:skill-icons-browser
```

第一项已纳入 `npm test`，覆盖所有作者定义的技能、六种角色真实选卡、同名和语义别名、动态法术核心、路线配色，以及防止旧 emoji 渲染入口回归的检查。第二项挂载真实 Vue 组件，在桌面和手机尺寸检查图标注册、几何一致性、卡内边界、键盘选卡、HUD 和运行时错误；本地截图及结果位于 `.workbuddy/skill-icons/`，不读取玩家账号或存档。
