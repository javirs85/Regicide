import { createCastleDeck, createSoloJesterReserve, createTavernDeck, type Deck } from './decks';
import { isRoyal, royalStats, type Card, type RoyalRank, type Suit } from './cards';

const useFixedTestDeal = false;
const fixedTestDealSeed = 'regicide-debug-deal-2026-05-09';

export type GameStatus = 'playing' | 'won' | 'lost';
export type TurnPhase =
  | 'awaitingAction'
  | 'resolvingSuitPowers'
  | 'resolvingDamage'
  | 'awaitingDamageDiscard'
  | 'awaitingJesterNextPlayer'
  | 'gameOver';

export type PlayerState = {
  id: string;
  name: string;
  hand: Card[];
  maxHandSize: number;
};

export type EnemyState = {
  card: Card & { rank: RoyalRank; suit: Suit };
  baseAttack: number;
  health: number;
  damageTaken: number;
};

export type GameState = {
  players: PlayerState[];
  tavernDeck: Deck;
  castleDeck: Deck;
  discardPile: Card[];
  currentEnemy: EnemyState;
  currentPlayerIndex: number;
  status: GameStatus;
  turnPhase: TurnPhase;
  consecutiveYields: number;
  enemyImmunityCancelled: boolean;
  spadesShieldTotalPlayedAgainstEnemy: number;
  playedAgainstCurrentEnemy: Card[];
  defeatedEnemies: Card[];
  soloJesterReserve: Deck;
};

export function maxHandSizeForPlayerCount(playerCount: number): number {
  const handSizes: Record<number, number> = {
    1: 8,
    2: 7,
    3: 6,
    4: 5,
  };

  return handSizes[playerCount] ?? handSizes[1];
}

function createSeededRandom(seedText: string): () => number {
  let seed = 0x811c9dc5;

  for (let index = 0; index < seedText.length; index += 1) {
    seed ^= seedText.charCodeAt(index);
    seed = Math.imul(seed, 0x01000193);
  }

  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createGameRandom(): () => number {
  return useFixedTestDeal ? createSeededRandom(fixedTestDealSeed) : Math.random;
}

export function createInitialGameState(playerCount = 1): GameState {
  const random = createGameRandom();
  const maxHandSize = maxHandSizeForPlayerCount(playerCount);
  const castleDeck = createCastleDeck(random);
  const firstEnemyCard = castleDeck.shift();

  if (!firstEnemyCard || !isRoyal(firstEnemyCard)) {
    throw new Error('Castle deck must start with a royal enemy.');
  }

  const tavernDeck = createTavernDeck(playerCount, random);
  const players = Array.from({ length: playerCount }, (_, index) => {
    const hand = tavernDeck.splice(0, maxHandSize);

    return {
      id: `player-${index + 1}`,
      name: playerCount === 1 ? 'Solo' : `Jugador ${index + 1}`,
      hand,
      maxHandSize,
    };
  });

  const stats = royalStats[firstEnemyCard.rank];

  return {
    players,
    tavernDeck,
    castleDeck,
    discardPile: [],
    currentEnemy: {
      card: firstEnemyCard,
      baseAttack: stats.attack,
      health: stats.health,
      damageTaken: 0,
    },
    currentPlayerIndex: 0,
    status: 'playing',
    turnPhase: 'awaitingAction',
    consecutiveYields: 0,
    enemyImmunityCancelled: false,
    spadesShieldTotalPlayedAgainstEnemy: 0,
    playedAgainstCurrentEnemy: [],
    defeatedEnemies: [],
    soloJesterReserve: createSoloJesterReserve(playerCount),
  };
}

export function getCurrentTier(gameState: GameState): RoyalRank {
  return gameState.currentEnemy.card.rank;
}

export function getDefeatedSuitsForCurrentTier(gameState: GameState): Set<Suit> {
  const currentTier = getCurrentTier(gameState);

  return new Set(
    gameState.defeatedEnemies
      .filter((card): card is Card & { rank: RoyalRank; suit: Suit } => isRoyal(card) && card.rank === currentTier)
      .map((card) => card.suit),
  );
}
