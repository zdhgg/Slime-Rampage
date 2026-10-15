import assert from 'node:assert/strict'
import { createArena, spawn, spawnBoss, learn, dispose, pressSpace, rollSkills, ctx2d } from './test-support/arena-fixture.mjs'
import { rollBossSkills } from './src/game/SkillPool.js'

let checks = 0
function check(name, test) {
  const g = createArena('summoner'), pets = g.weaponSystem.petCombat
  try { pets.sync(); test(g, pets); console.log(`✓ ${++checks}. ${name}`) } finally { dispose(g) }
}
check('开局护卫、技能成长、四伙伴上限和新局清理', (g, p) => {
  assert.equal(p.items.length, 1); assert.equal(p.items[0].hp, 9)
  learn(g, 'pet_vitality'); assert.equal(p.items[0].hp, 12)
  learn(g, 'pet_partner'); p.sync(); p.sync(); assert.equal(p.items.length, 2)
  assert.equal(p.items[1].hp, 9)
  learn(g, 'pet_dew_partner'); learn(g, 'pet_spore_partner'); p.sync(); p.sync()
  assert.equal(p.cap, 4); assert.equal(p.items.length, 4)
  assert.equal(new Set(p.items.map(pet => pet.type)).size, 4)
  g.reset(); p.sync(); assert.equal(p.items.length, 1); assert.equal(p.items[0].hp, 9)
  g.applyStartingStrain('origin'); g.reset(); p.sync(); assert.equal(p.items.length, 0)
})
check('伙伴独立伤害、击杀只结算一次且不生影', (g, p) => {
  const pet = p.items[0], e = spawn(g, { hp: 1 }), before = g.weaponSystem.kills
  p.strike(pet, { target:e }); p.strike(pet, { target:e })
  assert.equal(g.weaponSystem.kills, before + 1); assert.equal(g.weaponSystem.stats.petDamage, 1)
  assert.equal(p.items.length, 1)
  const miss = spawn(g, { x:300 }); p.strike(pet, {target:miss}); assert.equal(miss.hp, 100)
})
check('空格鼓舞无需敌人，全队增益、冷却与全倒地释放限制', (g, p) => {
  learn(g,'pet_partner'); learn(g,'pet_dew_partner'); learn(g,'pet_spore_partner')
  const base=p.items.map(pet=>p.attackDamage(pet)), ownerDamage=g.weaponSystem.damage
  pressSpace(g)
  assert.equal(p.rallyTime,5); assert.equal(g.player.strainSkillCd,12)
  assert.equal(p.attackRate,1.4); assert.equal(p.moveScale,1.35)
  p.items.forEach((pet,i)=>assert.ok(Math.abs(p.attackDamage(pet)/base[i]-1.3)<1e-8))
  assert.equal(g.weaponSystem.damage,ownerDamage)
  assert.ok(p.hud().every(pet=>pet.boosted)); assert.equal(p.rallyHud().remaining,5)
  p.update(.5); pressSpace(g); assert.equal(p.rallyTime,4.5)
  assert.equal(p.rally(),false); assert.equal(p.rallyTime,4.5)
  const before=p.rallyTime; g.pause(); g._tick(1000); assert.equal(p.rallyTime,before)
  p.update(4.51); assert.equal(p.rallyTime,0); assert.equal(p.rallyHud(),null)
  assert.equal(p.attackRate,1); assert.equal(p.moveScale,1)
  p.items.forEach((pet,i)=>assert.equal(p.attackDamage(pet),base[i]))
  g.running=true
  for(const pet of p.items) p.hit(pet,100)
  g.player.strainSkillCd=0; pressSpace(g)
  assert.equal(g.player.strainSkillCd,0); assert.equal(p.rallyTime,0)
})
check('鼓舞提高实际移动距离和攻击频率，蓄力动作同步加速', (g,p) => {
  g.mapFeatures.resolvePlayerMovement=()=>false
  const guardian=p.items[0], x=g.player.x+350, y=g.player.y
  guardian.x=x; guardian.y=y; p.update(.1)
  const normalMove=Math.hypot(guardian.x-x,guardian.y-y)
  guardian.x=x; guardian.y=y; pressSpace(g); p.update(.1)
  assert.ok(Math.abs(Math.hypot(guardian.x-x,guardian.y-y)/normalMove-1.35)<1e-8)
  p.update(5)
  learn(g,'pet_partner'); const hunter=p.items[1]
  guardian.hp=0; guardian.down=8
  const target=spawn(g,{x:200,hp:10000})
  hunter.x=g.player.x;hunter.y=g.player.y;hunter.cooldown=0;hunter.attack=null
  for(let i=0;i<150;i++) p.update(.02)
  const count=hunter.shotCount
  hunter.x=g.player.x;hunter.y=g.player.y;hunter.cooldown=0;hunter.attack=null;hunter.shotCount=0
  g.player.strainSkillCd=0;pressSpace(g);p.update(.01)
  assert.ok(hunter.attack); assert.ok(Math.abs(hunter.attack.maxTime-.18/1.4)<1e-8)
  for(let i=0;i<150;i++) p.update(.02)
  assert.ok(hunter.shotCount>count);assert.ok(target.hp<10000)
})
check('鼓舞强化和BOSS冷却生效，期间加入与恢复的伙伴共享剩余增益', (g,p) => {
  learn(g,'pet_partner');learn(g,'pet_command',3)
  g.applySkill(rollBossSkills(g,100).find(s=>s.id==='boss_pet_command'))
  pressSpace(g); assert.equal(p.rallyTime,8)
  assert.ok(Math.abs(g.player.strainSkillCd-9.6)<1e-8)
  let snapshot; g.onCooldown=state=>snapshot=state;g._pushCooldown()
  assert.match(snapshot.skillDesc,/8 秒/);assert.match(snapshot.skillDesc,/攻击力 \+60%/)
  const guardian=p.items[0], power=p.attackDamage(guardian)
  learn(g,'pet_dew_partner'); assert.equal(p.hud().find(pet=>pet.id==='dew').boosted,true)
  p.hit(guardian,100); guardian.down=.2; p.update(.21)
  assert.equal(guardian.hp,guardian.maxHp);assert.equal(p.hud()[0].boosted,true)
  assert.equal(p.attackDamage(guardian),power)
  p.update(8);assert.ok(Math.abs(power/p.attackDamage(guardian)-1.6)<1e-8)
  g.player.strainSkillCd=0;pressSpace(g);g.player.dead=true;p.update(.1)
  assert.equal(p.rallyTime,0);assert.equal(p.items.length,0)
  g.reset();p.sync();assert.equal(p.rallyTime,0);assert.equal(p.rallyHud(),null)
})
check('鼓舞射出的飞弹保留出手时伤害，结束后新攻击恢复基础伤害', (g,p) => {
  learn(g,'pet_partner');const guardian=p.items[0],hunter=p.items[1]
  pressSpace(g);p.update(4.7)
  guardian.hp=0;guardian.down=8;hunter.x=g.player.x;hunter.y=g.player.y;hunter.cooldown=10
  const target=spawn(g,{x:210,hp:1000}),damage=p.attackDamage(hunter)
  p.strike(hunter,{target});assert.equal(p.shots[0].boosted,true);assert.equal(p.shots[0].damage,damage)
  p.update(.5);assert.equal(p.rallyTime,0);assert.ok(Math.abs(1000-target.hp-damage)<1e-8)
  assert.ok(Math.abs(damage/p.attackDamage(hunter)-1.3)<1e-8)
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
  const pet = p.items[0], e = spawn(g,{x:pet.x-g.player.x+45,y:pet.y-g.player.y})
  pet.supportCd=20
  pet.target=e; pet.retarget=10; p.update(.01); assert.ok(pet.attack)
  e.x += 500; p.update(.15); assert.equal(e.hp,100)
  p.render(ctx2d)
  g.player.dead = true; p.update(.1); assert.equal(p.items.length,0)
})
check('岩甲近战蓄力后命中，疾风叶刃飞行后才结算远程伤害', (g,p) => {
  learn(g,'pet_partner')
  const guardian = p.items[0], hunter = p.items[1]
  guardian.supportCd=hunter.supportCd=20
  const close = spawn(g,{x:guardian.x-g.player.x+58,y:guardian.y-g.player.y,hp:100})
  hunter.hp=0; hunter.down=8
  p.update(.01); assert.ok(guardian.attack); assert.equal(close.hp,100)
  p.update(.2); assert.ok(close.hp<100); assert.ok(guardian.attackFx>0)

  close.active=false; guardian.hp=0; guardian.down=8
  hunter.hp=hunter.maxHp; hunter.down=0; hunter.x=g.player.x; hunter.y=g.player.y+20
  const far = spawn(g,{x:210,y:20,hp:100})
  p.update(.01); assert.ok(hunter.attack); assert.equal(far.hp,100)
  p.update(.18); assert.equal(p.shots.length,1); assert.equal(far.hp,100)
  p.update(.25); assert.ok(far.hp<100); assert.equal(p.shots.length,0)
  p.render(ctx2d)
})
check('伙伴专属被动：岩甲减伤，疾风每三发追加叶刃', (g,p) => {
  const guardian=p.items[0]
  learn(g,'pet_bulwark'); p.hit(guardian,4); assert.equal(guardian.hp,6)
  learn(g,'pet_partner'); learn(g,'pet_volley')
  const hunter=p.items[1], target=spawn(g,{x:200,hp:100})
  for(let i=0;i<3;i++) p.strike(hunter,{target})
  assert.equal(hunter.shotCount,3); assert.equal(p.shots.length,4)
  p.update(.5); assert.ok(target.hp<100); assert.equal(p.shots.length,0)
})
check('疾风叶刃被地形挡住后不穿墙造成伤害', (g,p) => {
  learn(g,'pet_partner')
  const hunter=p.items[1], target=spawn(g,{x:210,hp:100})
  p.strike(hunter,{target}); assert.equal(p.shots.length,1)
  const wallX=hunter.x+70
  g.mapFeatures.resolvePlayerMovement=(probe,x,y)=>{
    if(probe.x>wallX){probe.x=x;probe.y=y;return true}
    return false
  }
  p.update(.3); assert.equal(target.hp,100); assert.equal(p.shots.length,0)
})
check('觉醒先选搭档，后续升级可继续招募并解锁各自被动', (g,p) => {
  g.player.level=5; g._ensureRoleAwakening()
  const ids=rollSkills(g).map(skill=>skill.id).sort()
  assert.deepEqual(ids,['pet_dew_partner','pet_partner','pet_spore_partner'].sort())
  learn(g,'pet_dew_partner'); p.sync()
  assert.equal(p.cap,2); assert.equal(p.items[1].type,'dew')
  const options=rollSkills(g,100).map(skill=>skill.id)
  assert.ok(options.includes('pet_partner') && options.includes('pet_spore_partner'))
  assert.ok(options.includes('pet_dew_spring')); assert.ok(!options.includes('pet_volley'))
  assert.ok(!options.includes('pet_wind_guard'))
  learn(g,'pet_partner'); learn(g,'pet_spore_partner')
  const recruited=rollSkills(g,100).map(skill=>skill.id)
  assert.ok(['pet_partner','pet_dew_partner','pet_spore_partner'].every(id=>!recruited.includes(id)))
  assert.ok(['pet_volley','pet_wind_guard','pet_dew_spring','pet_spore_bloom'].every(id=>recruited.includes(id)))
})
check('BOSS契约与升级交替招募，共享记录且每种最多一只', (g,p) => {
  learn(g,'pet_dew_partner')
  for(let i=0;i<10;i++) assert.ok(rollBossSkills(g).some(s=>s.partnerSkillId))
  const hunter=rollBossSkills(g,100).find(s=>s.partnerSkillId==='pet_partner')
  assert.ok(hunter); g.applySkill(hunter)
  assert.equal(g.skillLevels.pet_partner,1); assert.equal(p.items.length,3)
  assert.ok(rollBossSkills(g,100).every(s=>s.partnerSkillId!=='pet_partner'&&s.partnerSkillId!=='pet_dew_partner'))
  g.player.level=5; g._ensureRoleAwakening()
  assert.ok(rollSkills(g,100).every(s=>s.id!=='pet_partner'&&s.id!=='pet_dew_partner'))
  learn(g,'pet_spore_partner'); g.applySkill(hunter); p.sync()
  assert.equal(p.items.length,4); assert.equal(g.skillLevels.pet_partner,1)
  assert.ok(rollBossSkills(g,100).every(s=>!s.partnerSkillId))
  const origin=createArena('origin')
  try { origin.roleSpec='symbiosis'; assert.ok(rollBossSkills(origin,100).every(s=>!s.partnerSkillId)) } finally { dispose(origin) }
})
check('四人跟随阵型、拥挤分散和全员鼓舞', (g,p) => {
  g.mapFeatures.resolvePlayerMovement=()=>false
  learn(g,'pet_partner'); learn(g,'pet_dew_partner'); learn(g,'pet_spore_partner')
  for(let i=0;i<120;i++) p.update(1/60)
  for(let i=0;i<p.items.length;i++) for(let j=i+1;j<p.items.length;j++) {
    assert.ok(Math.hypot(p.items[i].x-p.items[j].x,p.items[i].y-p.items[j].y)>=39)
  }
  for(const pet of p.items) { pet.x=g.player.x; pet.y=g.player.y }
  for(let i=0;i<60;i++) p.spreadOut(1/60)
  for(let i=0;i<p.items.length;i++) for(let j=i+1;j<p.items.length;j++) {
    assert.ok(Math.hypot(p.items[i].x-p.items[j].x,p.items[i].y-p.items[j].y)>=39)
  }
  pressSpace(g); assert.ok(p.hud().every(pet=>pet.boosted))
  assert.equal(p.hud().length,4); p.render(ctx2d)
  for(const pet of p.items) p.hit(pet,1000)
  assert.ok(p.items.every(pet=>pet.down>0)); p.update(8.01)
  assert.ok(p.items.every(pet=>pet.down===0&&pet.hp===pet.maxHp)); assert.equal(p.items.length,4)
  const before=p.items.map(pet=>({x:pet.x,y:pet.y}))
  g.mapFeatures.resolvePlayerMovement=(probe,x,y)=>{probe.x=x;probe.y=y;return true}
  p.spreadOut(1)
  assert.deepEqual(p.items.map(pet=>({x:pet.x,y:pet.y})),before)
})
check('甘露远程命中蓄能治疗，泉涌缩短触发次数', (g,p) => {
  learn(g,'pet_dew_partner'); p.sync()
  const guardian=p.items[0], dew=p.items[1], target=spawn(g,{x:dew.x-g.player.x+190,y:dew.y-g.player.y,hp:1000})
  guardian.hp=0; guardian.down=8
  g.player.hp=g.player.maxHp-2
  for(let i=0;i<5;i++) { p.strike(dew,{target}); p.updateShots(.55) }
  assert.equal(g.player.hp,g.player.maxHp-1)
  learn(g,'pet_dew_spring')
  for(let i=0;i<3;i++) { p.strike(dew,{target}); p.updateShots(.55) }
  assert.equal(g.player.hp,g.player.maxHp)
  assert.ok(target.hp<1000); p.render(ctx2d)
})
check('孢云弹扩散伤害与减速，绽放扩大有效范围', (g,p) => {
  learn(g,'pet_spore_partner'); p.sync()
  const guardian=p.items[0], spore=p.items[1]
  guardian.hp=0; guardian.down=8
  spore.x=g.player.x; spore.y=g.player.y
  const primary=spawn(g,{x:170,hp:100}), near=spawn(g,{x:205,y:20,hp:100})
  const outer=spawn(g,{x:250,hp:100})
  p.strike(spore,{target:primary}); p.updateShots(.6)
  assert.ok(primary.hp<100 && near.hp<100)
  assert.equal(outer.hp,100); assert.ok(primary.slow>0 && near.slow>0)
  learn(g,'pet_spore_bloom')
  p.strike(spore,{target:primary}); p.updateShots(.6)
  assert.ok(outer.hp<100); assert.ok(outer.slow>=1.3)
  p.render(ctx2d)
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
  learn(g,'pet_dew_partner'); learn(g,'pet_spore_partner')
  assert.equal(p.items.length,4)
  assert.ok(Math.abs(p.attackDamage(pet)/(g.weaponSystem.damage*g.weaponSystem.levelMul*1.4*p.damageScale)-1.3)<1e-8)
  for(const ally of p.items.slice(1)) ally.hp=0
  assert.ok(Math.abs(p.attackDamage(pet)/(g.weaponSystem.damage*g.weaponSystem.levelMul*1.4*p.damageScale)-1)<1e-8)
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
check('完整战场持续运行：四伙伴协同伤害、倒地恢复与结束清理', (g,p) => {
  learn(g,'pet_partner'); learn(g,'pet_dew_partner'); learn(g,'pet_spore_partner'); g.player.hp=g.player.maxHp=1000
  for(let i=0;i<12;i++) spawn(g,{x:Math.cos(i)*260,y:Math.sin(i)*220,hp:8,type:i%2?'mage':'knight'})
  for(let i=0;i<1200;i++) {g.update(1/60); if(i%60===0) g.render()}
  assert.ok(g.weaponSystem.stats.petDamage>0); assert.ok(g.weaponSystem.kills>0)
  assert.equal(p.items.length,4)
  assert.ok(p.items.every(pet=>Number.isFinite(pet.x+pet.y+pet.hp+pet.down)))
  g.finishRun('defeat'); assert.equal(p.items.length,0); assert.deepEqual(p.hud(),[])
})
check('团团周期嘲讽有动作，严格限制人数，首领免疫且到期解除', (g,p) => {
  g.mapFeatures.resolvePlayerMovement=()=>false
  const guardian=p.items[0]
  guardian.x=g.player.x; guardian.y=g.player.y+60
  const enemies=Array.from({length:6},(_,i)=>spawn(g,{x:190+i*5,y:0,type:i===0?'mage':'knight'}))
  const boss=spawnBoss(g)
  assert.equal(p.lureTarget(enemies[0]),null)
  p.update(.01); assert.equal(guardian.support.kind,'taunt'); assert.equal(guardian.supportCd,0)
  assert.equal(p.isTaunted(enemies[0]),false);p.render(ctx2d)
  p.update(.29);assert.equal(guardian.support,null);assert.equal(guardian.supportCd,20)
  assert.equal(guardian.supportActive,3);assert.equal(guardian.taunted.size,4)
  assert.equal(enemies.filter(e=>p.lureTarget(e)).length,4);assert.equal(p.lureTarget(boss),null)
  const mage=enemies[0];mage.update(.01)
  assert.ok(Math.abs(mage.facing-Math.atan2(guardian.y-mage.y,guardian.x-mage.x))<1e-8)
  p.render(ctx2d)
  const remaining=guardian.supportActive;g.pause();g._tick(1000);assert.equal(guardian.supportActive,remaining)
  p.update(3.01);assert.equal(guardian.taunted.size,0)
  guardian.x=g.player.x;guardian.y=g.player.y+60;guardian.claims.clear()
  assert.ok(p.lureTarget(mage)===null)
  assert.equal(p.beginSupport(guardian),false)
  learn(g,'pet_vitality');learn(g,'pet_taunt');guardian.supportCd=0
  guardian.attack=null;assert.equal(p.beginSupport(guardian),true);p.update(.29)
  assert.equal(guardian.taunted.size,5);assert.equal(guardian.supportCd,16)
  p.hit(guardian,100);assert.equal(guardian.supportActive,0);assert.equal(p.lureTarget(mage),null)
})
check('疾风削弱真实近战和远程伤害，到期复原且首领不受影响', (g,p) => {
  learn(g,'pet_partner');const guardian=p.items[0],hunter=p.items[1]
  hunter.x=g.player.x;hunter.y=g.player.y
  const melee=spawn(g,{x:80}),mage=spawn(g,{x:140,type:'mage'}),extra=spawn(g,{x:160}),outside=spawn(g,{x:200})
  const boss=spawnBoss(g)
  mage._shoot();const oldBullet=g.enemyManager._bullets.at(-1)
  assert.equal(p.beginSupport(hunter),true);assert.equal(melee.petWeakenTime,0)
  assert.equal(p.finishSupport(hunter),true);hunter.support=null
  assert.equal(hunter.supportCd,14);assert.equal(melee.petWeakenTime,4)
  assert.equal(extra.petWeakenAmount,.25);assert.equal(outside.petWeakenTime,0);assert.equal(boss.petWeakenTime,0)
  const hp=g.player.hp;g.player.invincible=0
  melee._hitTarget(g.player,g.player,1);assert.equal(hp-g.player.hp,.75)
  const petHp=guardian.hp;melee._hitTarget(guardian,g.player,2);assert.equal(petHp-guardian.hp,1.5)
  mage._shoot();assert.equal(g.enemyManager._bullets.at(-1).damage,.75);assert.equal(oldBullet.damage,1)
  melee._tickStatus(4.01);assert.equal(melee.outgoingDamage(1),1)
  learn(g,'pet_wind_guard');hunter.supportCd=0;p.finishSupport(hunter)
  assert.equal(melee.petWeakenTime,5);assert.equal(melee.outgoingDamage(1),.65)
  mage._shoot();assert.equal(g.enemyManager._bullets.at(-1).damage,.65);p.render(ctx2d)
})
check('孢云周期缓行限制五名，实际减速40%，保留更长减速且狂暴免疫', (g,p) => {
  learn(g,'pet_spore_partner');const guardian=p.items[0],spore=p.items[1]
  p.hit(guardian,100);spore.x=g.player.x;spore.y=g.player.y
  g.mapFeatures.speedMultiplierAt=()=>1
  const enemies=Array.from({length:6},(_,i)=>spawn(g,{x:150+i*10}))
  const raging=spawn(g,{x:100,type:'berserker'});raging.isEnraged=true
  const boss=spawnBoss(g);enemies[1].slow=10
  assert.equal(p.beginSupport(spore),true);p.update(.31)
  assert.equal(spore.supportCd,16);assert.equal(spore.supportActive,3)
  assert.equal(enemies[0].slow,3);assert.equal(enemies[1].slow,10);assert.equal(enemies[5].slow,0)
  assert.equal(boss.slow,0);assert.equal(raging.slow,0)
  const enemy=enemies[0],x=enemy.x;enemy.update(.1);const slowed=x-enemy.x
  enemy.x=x;enemy.slow=0;enemy.update(.1);assert.ok(Math.abs(slowed/(x-enemy.x)-.6)<1e-8)
  learn(g,'pet_spore_bloom');spore.supportCd=0;p.finishSupport(spore)
  assert.equal(enemies[0].slow,4.5);assert.equal(p.supportStats(spore).radius,290);p.render(ctx2d)
})
check('甘露空场自动治疗优先本体，不溢出、不复活倒地伙伴，满血保留技能', (g,p) => {
  learn(g,'pet_dew_partner');const guardian=p.items[0],dew=p.items[1]
  p.update(.5);assert.equal(dew.support,null);assert.equal(dew.supportCd,0)
  g.player.hp=g.player.maxHp-.5;guardian.hp=3
  p.update(.01);assert.equal(dew.support.kind,'heal');assert.equal(g.player.hp,g.player.maxHp-.5)
  p.update(.31);assert.equal(g.player.hp,g.player.maxHp);assert.equal(guardian.hp,3)
  assert.equal(dew.supportCd,12);assert.equal(dew.supportTargets[0],g.player);p.render(ctx2d)
  dew.supportCd=0;p.update(.01);p.update(.31);assert.equal(guardian.hp,4)
  guardian.hurt=0;p.hit(guardian,100);dew.supportCd=0
  assert.equal(p.beginSupport(dew),false);assert.equal(guardian.hp,0)
  learn(g,'pet_dew_spring');g.player.hp--
  p.update(.01);p.update(.31);assert.equal(dew.supportCd,9);assert.equal(g.player.hp,g.player.maxHp)
})
check('保护技能不隔墙施放，不覆盖巢心防守目标，空场不消耗冷却', (g,p) => {
  learn(g,'pet_partner');learn(g,'pet_spore_partner')
  const enemy=spawn(g),far=spawn(g,{x:450})
  g.mapFeatures.resolvePlayerMovement=(probe,x,y)=>{probe.x=x;probe.y=y;return true}
  for(const pet of p.items) assert.equal(p.beginSupport(pet),false)
  g.mapFeatures.resolvePlayerMovement=()=>false
  g.mapFeatures.getEnemyTarget=e=>e===enemy?{isMapObjective:true}:null
  for(const pet of p.items) assert.equal(p.beginSupport(pet),false)
  g.mapFeatures.getEnemyTarget=()=>null
  for(const pet of p.items) assert.equal(p.beginSupport(pet),true)
  enemy.active=false
  p.update(.31)
  for(const pet of p.items) {assert.equal(pet.supportCd,0);assert.equal(pet.supportActive,0)}
  assert.equal(far.petWeakenTime,0);assert.equal(far.slow,0)
})
check('伙伴倒地中断保护动作，甘露倒地后残留水滴不会触发治疗', (g,p) => {
  learn(g,'pet_dew_partner');const guardian=p.items[0],dew=p.items[1]
  spawn(g)
  p.update(.01);assert.ok(guardian.support);p.hit(guardian,100)
  p.update(.3);assert.equal(guardian.support,null);assert.equal(guardian.taunted.size,0)
  g.player.hp--;p.update(.01);assert.ok(dew.support);p.hit(dew,100)
  const hp=g.player.hp;p.update(.31);assert.equal(g.player.hp,hp);assert.equal(dew.supportCd,0)
  dew.hp=dew.maxHp;dew.down=0;dew.hurt=0;dew.healCharge=4
  dew.x=g.player.x;dew.y=g.player.y
  for(const enemy of g.enemyManager.enemies) enemy.active=false
  const target=spawn(g,{x:160,hp:1000});p.strike(dew,{target});p.hit(dew,100);p.updateShots(.55)
  assert.ok(target.hp<1000);assert.equal(g.player.hp,hp);assert.equal(dew.healCharge,4)
  g.finishRun('defeat');assert.equal(p.items.length,0);assert.equal(p.shots.length,0)
})
console.log(`PASS: ${checks} pet combat checks`)
