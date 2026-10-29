import fs from 'node:fs'
import assert from 'node:assert/strict'
import { ARENA_KNIGHT_ART_MODES, getArenaKnightArtMode, drawArenaKnightA, resetArenaKnightArtModeForTests } from './src/game/ArenaKnightPrototype.js'
import { getArenaKnightFrameCache, resetArenaKnightFrameCacheForTests } from './src/game/ArenaKnightFrameCache.js'
import { ARENA_MAGE_ART_MODES, getArenaMageArtMode, drawArenaMageA, resetArenaMageArtModeForTests } from './src/game/ArenaMagePrototype.js'
import { getArenaMageFrameCache, resetArenaMageFrameCacheForTests } from './src/game/ArenaMageFrameCache.js'
const calls=[]
const ctx=new Proxy({}, { get:(_,key)=> key==='save'||key==='restore'?()=>{}:(...args)=>calls.push([key,args]) })
drawArenaKnightA(ctx,20,{moving:true,attacking:true,hurt:true});drawArenaMageA(ctx,20,{moving:true,casting:true,hurt:true})
assert.ok(calls.length>20,'procedural renderers should emit canvas calls')
assert.equal(ARENA_KNIGHT_ART_MODES.CACHE,'cache');assert.equal(ARENA_MAGE_ART_MODES.CACHE,'cache')
assert.equal(getArenaKnightArtMode(),'cache');assert.equal(getArenaMageArtMode(),'cache')
assert.ok([0,8].includes(getArenaKnightFrameCache().snapshot().frameCount));assert.ok([0,7].includes(getArenaMageFrameCache().snapshot().frameCount))
const source=fs.readFileSync('./src/game/entities/Enemy.js','utf8');assert.match(source,/getArenaKnightFrameCache/);assert.match(source,/getArenaMageFrameCache/);assert.match(source,/drawArenaMageA/)
resetArenaKnightArtModeForTests();resetArenaKnightFrameCacheForTests();resetArenaMageArtModeForTests();resetArenaMageFrameCacheForTests()
console.log('arena knight + mage verification passed')
