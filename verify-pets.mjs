import assert from 'node:assert/strict'
import { createArena, spawn, spawnBoss, learn, dispose, pressSpace, rollSkills, ctx2d } from './test-support/arena-fixture.mjs'

let checks = 0
function check(name, test) {
  const g = createArena('summoner'), pets = g.weaponSystem.petCombat
  try { pets.sync(); test(g, pets); console.log(`✓ ${++checks}. ${name}`) } finally { dispose(g) }
}
check('开局护卫、技能成长、双伙伴上限和新局清理', (g, p) => {
  assert.equal(p.items.length, 1); assert.equal(p.items[0].hp, 9)
  learn(g, 'pet_vitality'); assert.equal(p.items[0].hp, 12)
  learn(g, 'pet_partner'); p.sync(); p.sync(); assert.equal(p.items.length, 2)
  assert.equal(p.items[1].hp, 9)
  g.reset(); p.sync(); assert.equal(p.items.length, 1); assert.equal(p.items[0].hp, 9)
  g.applyStartingStrain('origin'); g.reset(); p.sync(); assert.equal(p.items.length, 0)
})
check('伙伴独立伤害、击杀只结算一次且不生影', (g, p) => {
  const pet = p.items[0], e = spawn(g, { hp: 1 }), before = g.weaponSystem.kills
  p.strike(pet, { target:e, special:true }); p.strike(pet, { target:e, special:true })
  assert.equal(g.weaponSystem.kills, before + 1); assert.equal(g.weaponSystem.stats.petDamage, 1)
  assert.equal(p.items.length, 1)
  const miss = spawn(g, { x:300 }); p.strike(pet, {target:miss}); assert.equal(miss.hp, 100)
})
check('定向空格攻击、无目标回防、全倒地不消耗冷却', (g, p) => {
  g.player.facing = 0
  const e = spawn(g, {x:260}); pressSpace(g)
  assert.equal(p.items[0].target, e); assert.equal(p.items[0].special, 3)
  assert.ok(g.player.strainSkillCd > 0)
  e.active = false; g.player.strainSkillCd = 0; pressSpace(g)
  assert.equal(p.items[0].protect, 2.5)
  p.items[0].protect = 0; p.hit(p.items[0], 100)
  g.player.strainSkillCd = 0; pressSpace(g); assert.equal(g.player.strainSkillCd, 0)
})
check('独立生命、倒地停止攻击并按时恢复', (g, p) => {
  const pet = p.items[0], hp = g.player.hp
  const e = spawn(g); p.hit(pet, 100); assert.equal(pet.down, 8)
  for (let i=0;i<70;i++) p.update(.1)
  assert.equal(e.hp, 100); assert.equal(pet.hp, 0); assert.equal(g.player.hp, hp)
  for (let i=0;i<11;i++) p.update(.1)
  assert.equal(pet.down, 0); assert.equal(pet.hp, pet.maxHp)
  learn(g, 'pet_recovery', 3); pet.hurt = 0; p.hit(pet, 100); assert.equal(pet.down, 5)
})
check('护卫最多吸引三名普通敌人，首领不转移目标', (g,p) => {
  const enemies = Array.from({length:5}, () => spawn(g))
  assert.equal(enemies.filter(e => p.lureTarget(e)).length, 3)
  assert.equal(p.lureTarget(spawnBoss(g)), null)
})
check('高速普通弹拦截、玩家先接触优先、首领弹穿过', (g,p) => {
  const pet = p.items[0], x = g.player.x, y = g.player.y
  pet.x = x+80; pet.y = y
  const bullet = {x:x-80,y,radius:4,damage:1,active:true}
  assert.equal(p.intercept(bullet,x+200,y),true); assert.equal(bullet.active,false)
  assert.equal(pet.hp,8)
  assert.equal(p.intercept({...bullet,active:true,isBoss:true},x+200,y),false)
  assert.equal(p.intercept({...bullet,x:x+200,active:true},x-200,y),false)
})
check('猎手优先远程、普通攻击前摇和渲染有效', (g,p) => {
  learn(g,'pet_partner'); const hunter = p.items[1]
  spawn(g,{x:40}); const mage = spawn(g,{x:250,type:'mage'})
  assert.equal(p.nearest(hunter),mage)
  const pet = p.items[0], e = spawn(g,{x:60})
  pet.target=e; pet.retarget=10; p.update(.01); assert.ok(pet.attack)
  e.x += 500; p.update(.15); assert.equal(e.hp,100)
  p.render(ctx2d)
  g.player.dead = true; p.update(.1); assert.equal(p.items.length,0)
})
check('召唤技能只向共生角色提供', (g,p) => {
  for(let i=0;i<20;i++) assert.ok(rollSkills(g).every(s=>s.spec==='symbiosis'||s.spec==='common'||!s.spec))
  const origin = createArena('origin')
  try { for(let i=0;i<20;i++) assert.ok(rollSkills(origin).every(s=>s.spec!=='symbiosis')) } finally {dispose(origin)}
})
check('本体飞弹削弱45%，五级觉醒只强化伙伴', (g,p) => {
  const w = g.weaponSystem, e = spawn(g,{x:200})
  w.fire(e)
  assert.ok(Math.abs(w._projectiles[0].damage - w.damage*w.levelMul*w.devourDamageMul*.55)<1e-8)
  const before = p.damageScale
  g.player.level=5; g._ensureRoleAwakening()
  assert.equal(g.primarySpec,'symbiosis'); assert.equal(p.damageScale,before*1.2)
  learn(g,'pet_power'); learn(g,'pet_partner'); learn(g,'pet_command'); learn(g,'pet_capstone')
  const pet = p.items[0], victim=spawn(g,{x:60,hp:1000})
  p.strike(pet,{target:victim}); const enhanced=1000-victim.hp
  p.items[1].hp=0; victim.hp=1000
  p.strike(pet,{target:victim}); assert.ok(Math.abs(enhanced/(1000-victim.hp)-1.3)<1e-8)
})
check('宠物不隔墙攻击、不追击超距目标', (g,p) => {
  const pet = p.items[0], e = spawn(g,{x:80})
  g.mapFeatures.resolvePlayerMovement=(probe,x,y)=>{probe.x=x;probe.y=y;return true}
  assert.equal(p.nearest(pet),null); p.strike(pet,{target:e}); assert.equal(e.hp,100)
  g.mapFeatures.resolvePlayerMovement=()=>false
  e.x=g.player.x+700; assert.equal(p.nearest(pet),null)
  pet.x=g.player.x+550; const distance=Math.hypot(pet.x-g.player.x,pet.y-g.player.y)
  p.update(.1); assert.ok(Math.hypot(pet.x-g.player.x,pet.y-g.player.y)<distance)
})
check('完整战场持续运行：近远程混编、双宠物伤害与结束清理', (g,p) => {
  learn(g,'pet_partner'); g.player.hp=g.player.maxHp=1000
  for(let i=0;i<12;i++) spawn(g,{x:Math.cos(i)*260,y:Math.sin(i)*220,hp:8,type:i%2?'mage':'knight'})
  for(let i=0;i<1200;i++) {g.update(1/60); if(i%60===0) g.render()}
  assert.ok(g.weaponSystem.stats.petDamage>0); assert.ok(g.weaponSystem.kills>0)
  assert.equal(p.items.length,2)
  assert.ok(p.items.every(pet=>Number.isFinite(pet.x+pet.y+pet.hp+pet.down)))
  g.finishRun('defeat'); assert.equal(p.items.length,0); assert.deepEqual(p.hud(),[])
})
console.log(`PASS: ${checks} pet combat checks`)
