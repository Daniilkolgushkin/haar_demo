import { describe,it,expect } from 'vitest';
import { prefix,toggleRow,toggleCell,countOff,hitCell,cutoff,nearestQ } from '../src/ui/controls';
import { current } from '../src/shared/protocol';
describe('compact masks',()=>{
  it('prefix disables packed rows in correct order and resets exceptions',()=>{
    expect(countOff(prefix(4,0))).toBe(0);expect(countOff(prefix(4,2))).toBe(2);expect(countOff(prefix(4,4))).toBe(8);
    expect(cutoff(4,3,48000)).toBe(24000);expect(nearestQ(80,16,48000)).toBe(9);
  });
  it('row exceptions can restore a single coefficient; row toggle clears only that row',()=>{
    const mask=prefix(4,4);toggleCell(mask,3);expect(countOff(mask)).toBe(7);toggleCell(mask,6);
    toggleRow(mask,2);expect(mask.exceptions).toEqual([6]);expect(countOff(mask)).toBe(5);
    toggleCell(mask,6);expect(countOff(mask)).toBe(6);
  });
  it('hit test uses time support, zoom and 8 CSS pixel rule',()=>{
    expect(hitCell(10,2,{start:0,end:1024,width:512},1024,1024)).toBeNull();
    expect(hitCell(10,10,{start:512,end:544,width:512},1024,1024)).toBe(768);
    expect(hitCell(1,256,{start:0,end:7,width:512},8,7)).toBe(1);
    expect(hitCell(1,-1,{start:0,end:7,width:512},8,7)).toBeNull();
  });
  it('rejects stale uploads and reconstructions',()=>{
    expect(current(2,4,{session:1,request:4})).toBe(false);expect(current(2,4,{session:2,request:3})).toBe(false);expect(current(2,4,{session:2,request:4})).toBe(true);
  });
});
