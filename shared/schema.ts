import { Schema, type, MapSchema } from '@colyseus/schema';

export class PlayerState extends Schema {
  @type('string') id = '';
  @type('string') name = '';
  @type('boolean') isBot = false;
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') vx = 0;
  @type('number') vy = 0;
  @type('number') health = 100;
  @type('number') fuel = 100;
  @type('number') grenades = 3;
  @type('number') kills = 0;
  @type('boolean') alive = true;
  @type('number') facing = 1;
  @type('number') aimX = 1;
  @type('number') aimY = 0;
  @type('boolean') jetting = false;
  @type('boolean') onGround = false;
  @type('boolean') crouching = false;
  @type('boolean') rolling = false;
  @type('number') rollMs = 0;
  @type('boolean') cannonball = false;
  @type('boolean') backflip = false;
  @type('boolean') cooking = false;
  /** Active weapon id: rifle | sniper | shotgun */
  @type('string') weapon = 'rifle';
  @type('boolean') ownedSniper = false;
  @type('boolean') ownedShotgun = false;
  @type('number') lastProcessedInput = 0;
}

export class BulletState extends Schema {
  @type('string') id = '';
  @type('string') ownerId = '';
  @type('string') weapon = 'rifle';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') vx = 0;
  @type('number') vy = 0;
}

export class GrenadeState extends Schema {
  @type('string') id = '';
  @type('string') ownerId = '';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') vx = 0;
  @type('number') vy = 0;
}

export class PickupState extends Schema {
  @type('string') id = '';
  @type('string') weapon = '';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('boolean') active = true;
}

export class GameState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: BulletState }) bullets = new MapSchema<BulletState>();
  @type({ map: GrenadeState }) grenades = new MapSchema<GrenadeState>();
  @type({ map: PickupState }) pickups = new MapSchema<PickupState>();
}
