/** Pure collision math. Visual positions stay outside narrative saves (checkpoint respawn). */
export function canOccupy(x,z,obstacles,bounds,radius=.28) {
  if (x-radius<bounds.minX || x+radius>bounds.maxX || z-radius<bounds.minZ || z+radius>bounds.maxZ) return false;
  return !obstacles.some(b=>x+radius>b.minX && x-radius<b.maxX && z+radius>b.minZ && z-radius<b.maxZ);
}
export function slideMove(position,dx,dz,obstacles,bounds,radius=.28) {
  let {x,z}=position;
  if(canOccupy(x+dx,z+dz,obstacles,bounds,radius))return {x:x+dx,z:z+dz};
  if(canOccupy(x+dx,z,obstacles,bounds,radius))x+=dx;
  if(canOccupy(x,z+dz,obstacles,bounds,radius))z+=dz;
  return {x,z};
}
export function movementVector(horizontal,vertical,yaw) {
  const length=Math.hypot(horizontal,vertical)||1;
  const x=horizontal/length,z=vertical/length;
  return {x:Math.cos(yaw)*x-Math.sin(yaw)*z,z:-Math.sin(yaw)*x-Math.cos(yaw)*z};
}
export function angleLerp(from,to,amount) {
  return from+Math.atan2(Math.sin(to-from),Math.cos(to-from))*amount;
}
