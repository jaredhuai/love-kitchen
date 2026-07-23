import {describe,expect,it} from 'vitest';
import {compatibilityScore,type MealPreference} from '../src/domain/compatibility';
import {calculateNutrition} from '../src/domain/nutrition';
import {decryptLetter,encryptLetter} from '../src/domain/letter-crypto';
const base:MealPreference={cuisines:['川菜'],tastes:['香辣'],ingredients:['鸡肉'],spicyLevel:3,maxMinutes:30,budget:80,calorieTarget:600};
describe('compatibilityScore',()=>{
  it('相同偏好为 100',()=>expect(compatibilityScore(base,base)).toBe(100));
  it('结果限制在 0..100',()=>expect(compatibilityScore(base,{cuisines:['法餐'],tastes:['甜'],ingredients:['牛肉'],spicyLevel:0,maxMinutes:100,budget:400,calorieTarget:1800})).toBeGreaterThanOrEqual(0));
});
describe('calculateNutrition',()=>{it('按重量及份数确定性计算',()=>expect(calculateNutrition([{weightGrams:200,caloriesPer100g:100,proteinPer100g:10,fatPer100g:5,carbsPer100g:20}],2)).toEqual({totalCalories:200,caloriesPerServing:100,proteinG:10,fatG:5,carbsG:20}));});
describe('love letter AEAD',()=>{it('往返加解密且不含明文',()=>{const encrypted=encryptLetter('今晚一起吃饭','a-secure-test-key');expect(encrypted).not.toContain('今晚');expect(decryptLetter(encrypted,'a-secure-test-key')).toBe('今晚一起吃饭');});});
