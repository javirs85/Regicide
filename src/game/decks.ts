import { type Card, makeCard, royalRanks, suits, type RoyalRank } from './cards';

export type Deck = Card[];

const tavernRanks = ['ace', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'] as const;

export function shuffleDeck<T>(cards: T[], random: () => number = Math.random): T[] {
  const shuffled = [...cards];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

export function createCastleDeck(random: () => number = Math.random): Deck {
  return royalRanks.flatMap((rank) => createShuffledRoyalTier(rank, random));
}

export function createTavernDeck(playerCount: number, random: () => number = Math.random): Deck {
  const standardCards = tavernRanks.flatMap((rank) => suits.map((suit) => makeCard(rank, suit, 'tavern')));
  const jesterCount = playerCount === 3 ? 1 : playerCount === 4 ? 2 : 0;
  const jesters = Array.from({ length: jesterCount }, (_, index) => makeCard('jester', 'none', `jester-${index + 1}`));

  return shuffleDeck([...standardCards, ...jesters], random);
}

export function createSoloJesterReserve(playerCount: number): Deck {
  if (playerCount !== 1) return [];

  return [makeCard('jester', 'none', 'solo-jester-1'), makeCard('jester', 'none', 'solo-jester-2')];
}

function createShuffledRoyalTier(rank: RoyalRank, random: () => number): Deck {
  return shuffleDeck(
    suits.map((suit) => makeCard(rank, suit, 'castle')),
    random,
  );
}
