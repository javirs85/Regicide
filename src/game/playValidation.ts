import type { Card, Rank } from './cards';

export type PlayValidationResult =
  | { isValid: true }
  | {
      isValid: false;
      reason: string;
    };

export function validateCardSelection(cards: Card[]): PlayValidationResult {
  if (cards.length === 0) return { isValid: true };
  if (cards.length > 4) return invalid('Maximo 4 cartas por jugada.');

  const jesters = cards.filter((card) => card.rank === 'jester');
  if (jesters.length > 0) {
    return cards.length === 1 ? { isValid: true } : invalid('El bufon siempre se juega solo.');
  }

  if (cards.length === 1) return { isValid: true };

  const aces = cards.filter((card) => card.rank === 'ace');
  if (aces.length > 0) {
    return cards.length === 2
      ? { isValid: true }
      : invalid('El As solo puede acompanhar a una carta.');
  }

  const [firstCard] = cards;
  const allSameRank = cards.every((card) => card.rank === firstCard.rank);
  if (!allSameRank) return invalid('El combo debe ser de cartas con el mismo numero.');

  if (!isComboRank(firstCard.rank)) return invalid('Solo numeros 2-10 pueden formar combo.');

  const total = cards.reduce((sum, card) => sum + card.value, 0);
  if (total > 10) return invalid('El combo no puede superar valor 10.');

  return { isValid: true };
}

function invalid(reason: string): PlayValidationResult {
  return { isValid: false, reason };
}

function isComboRank(rank: Rank) {
  return rank !== 'ace' && rank !== 'jester' && rank !== 'jack' && rank !== 'queen' && rank !== 'king';
}
