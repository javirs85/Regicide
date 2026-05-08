export const suits = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
export const royalRanks = ['jack', 'queen', 'king'] as const;

export type Suit = (typeof suits)[number];
export type RoyalRank = (typeof royalRanks)[number];
export type NumberRank = 'ace' | 'two' | 'three' | 'four' | 'five' | 'six' | 'seven' | 'eight' | 'nine' | 'ten';
export type Rank = NumberRank | RoyalRank | 'jester';
export type CardCategory = 'number' | 'animal-companion' | 'jester' | 'royal';

export type Card = {
  id: string;
  rank: Rank;
  suit: Suit | 'none';
  value: number;
  category: CardCategory;
};

export const suitSymbols: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

export const suitNamesEs: Record<Suit, string> = {
  hearts: 'Corazones',
  diamonds: 'Diamantes',
  clubs: 'Treboles',
  spades: 'Picas',
};

export const rankLabels: Record<Rank, string> = {
  ace: 'A',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  jack: 'J',
  queen: 'Q',
  king: 'K',
  jester: 'Joker',
};

export const royalStats: Record<RoyalRank, { attack: number; health: number; levelName: string }> = {
  jack: { attack: 10, health: 20, levelName: 'Jotas' },
  queen: { attack: 15, health: 30, levelName: 'Reinas' },
  king: { attack: 20, health: 40, levelName: 'Reyes' },
};

export const suitPowerDescriptionsEs: Record<Suit, string> = {
  hearts: 'Cura: baraja descartes y coloca hasta el valor del ataque bajo la taberna.',
  diamonds: 'Roba: reparte cartas hasta el valor del ataque, respetando el maximo de mano.',
  clubs: 'Golpea: duplica el dano causado por esta jugada.',
  spades: 'Defiende: reduce acumulativamente el ataque del enemigo.',
};

export function cardValue(rank: Rank): number {
  if (rank === 'jester') return 0;
  if (rank === 'ace') return 1;
  if (rank === 'jack') return 10;
  if (rank === 'queen') return 15;
  if (rank === 'king') return 20;

  const values: Record<NumberRank, number> = {
    ace: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };

  return values[rank];
}

export function makeCard(rank: Rank, suit: Suit | 'none', idPrefix = 'card'): Card {
  const category: CardCategory =
    rank === 'jester' ? 'jester' : rank === 'ace' ? 'animal-companion' : royalRanks.includes(rank as RoyalRank) ? 'royal' : 'number';

  return {
    id: `${idPrefix}-${rank}-${suit}`,
    rank,
    suit,
    value: cardValue(rank),
    category,
  };
}

export function isRoyal(card: Card): card is Card & { rank: RoyalRank; suit: Suit } {
  return card.category === 'royal' && card.suit !== 'none';
}
