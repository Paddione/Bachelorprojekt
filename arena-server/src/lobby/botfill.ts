import type { Lobby } from './registry';
import { BOT_KEYS, BOT_DEFAULT_CHARACTERS } from '../game/constants';
import type { PlayerSlot } from '../proto/messages';

export function fillBots(lobby: Lobby): void {
  let i = 0;
  while (lobby.players.size < 4 && i < BOT_KEYS.length) {
    const key = BOT_KEYS[i];
    if (!lobby.players.has(key)) {
      const slot: PlayerSlot = {
        key,
        displayName: `Bot ${i + 1}`,
        brand: null,
        characterId: BOT_DEFAULT_CHARACTERS[i],
        isBot: true,
        ready: true,
        alive: true,
      };
      lobby.players.set(key, slot);
    }
    i++;
  }
}