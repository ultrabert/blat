import { Schema, type, MapSchema, ArraySchema } from '@colyseus/schema';

export class PlayerState extends Schema {
  @type('string') id = '';
  @type('string') name = '';
  @type('boolean') isBot = false;
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') vx = 0;
  @type('number') vy = 0;
  @type('number') health = 100;
  @type('number') vest = 0;
  @type('number') fuel = 100;
  @type('number') grenades = 3;
  @type('number') frags = 2;
  @type('number') clusters = 1;
  @type('number') stings = 1;
  @type('string') nadeType = 'frag';
  @type('number') kills = 0;
  @type('number') deaths = 0;
  @type('number') ping = 0;
  @type('string') deathKind = '';
  @type('boolean') alive = true;
  @type('number') facing = 1;
  @type('number') aimX = 1;
  @type('number') aimY = 0;
  @type('boolean') jetting = false;
  @type('boolean') onGround = false;
  @type('boolean') crouching = false;
  @type('boolean') prone = false;
  @type('boolean') rolling = false;
  @type('number') rollMs = 0;
  @type('boolean') cannonball = false;
  @type('boolean') backflip = false;
  @type('boolean') cooking = false;
  /** Gun or melee currently in hands. */
  @type('string') weapon = 'de';
  /** Holstered firearm while melee is out. */
  @type('string') firearm = 'de';
  @type('string') melee = 'knife';
  @type('number') ammo = 7;
  @type('number') reserve = 21;
  @type('boolean') reloading = false;
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
  @type('string') kind = 'frag';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') vx = 0;
  @type('number') vy = 0;
}

export class PickupState extends Schema {
  @type('string') id = '';
  @type('string') kind = 'weapon';
  @type('string') item = '';
  /** Legacy alias — same as item for weapon pads. */
  @type('string') weapon = '';
  @type('number') ammo = 0;
  @type('number') reserve = 0;
  @type('number') x = 0;
  @type('number') y = 0;
  @type('boolean') active = true;
}

export class KillFeedEntry extends Schema {
  @type('string') killer = '';
  @type('string') victim = '';
  @type('string') weapon = '';
  @type('boolean') headshot = false;
}

export class GameState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: BulletState }) bullets = new MapSchema<BulletState>();
  @type({ map: GrenadeState }) grenades = new MapSchema<GrenadeState>();
  @type({ map: PickupState }) pickups = new MapSchema<PickupState>();
  @type([KillFeedEntry]) killFeed = new ArraySchema<KillFeedEntry>();
  @type('string') mapName = 'Ridge';
}
