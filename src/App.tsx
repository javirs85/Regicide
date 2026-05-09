import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { HeartPulse, Shield, Swords } from 'lucide-react';
import {
  isRoyal,
  rankLabels,
  royalStats,
  suitPowerShortLabelsEs,
  suitSymbols,
  suits,
  type Card,
  type RoyalRank,
  type Suit,
} from './game/cards';
import { shuffleDeck } from './game/decks';
import { validateCardSelection } from './game/playValidation';
import { createInitialGameState, type EnemyState } from './game/state';

const turnSteps = [
  { phase: 'awaitingAction', label: '1. Jugar o pasar' },
  { phase: 'resolvingSuitPowers', label: '2. Poderes' },
  { phase: 'resolvingDamage', label: '3. Daño' },
  { phase: 'awaitingDamageDiscard', label: '4. Ataque enemigo' },
] as const;

const powerAnimationMs = 520;
const shuffleAnimationMs = 620;
const healFlightMs = 720;
const drawFlightDurationMs = 460;
const drawFlightWindowMs = 1120;
const drawRevealMs = 150;
const drawLandingOverlapMs = 110;
const clubsStampDurationMs = 620;
const clubsStampDelayMs = 140;
const spadesShieldAnimationMs = 900;
const damageBubbleAnimationMs = 820;
const phaseAnimationMs = 520;
const shieldBlockAnimationMs = 920;
const debugDiscardSeedCount = 0;

type PileName = 'tavern' | 'discard';
type FlyingHealCard = {
  id: string;
  delayMs: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};

type FlyingDrawCard = {
  card: Card;
  delayMs: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};

type ClubsStamp = {
  id: string;
  delayMs: number;
  x: number;
  y: number;
};

type ShieldPulse = {
  id: string;
  amount: number;
};

type CardViewProps = {
  card: Card;
  className?: string;
  isDimmed?: boolean;
  isDoubled?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
};

const CardView = forwardRef<HTMLButtonElement, CardViewProps>(function CardView(
  { card, className = '', isDimmed = false, isDoubled = false, isSelected = false, onClick, style },
  ref,
) {
  const suitClass = card.suit === 'none' ? 'none' : card.suit;
  const suitSymbol = card.suit === 'none' ? '★' : suitSymbols[card.suit];

  return (
    <button
      className={`playing-card ${suitClass} ${isSelected ? 'selected' : ''} ${isDimmed ? 'dimmed' : ''} ${className}`}
      onClick={onClick}
      ref={ref}
      style={style}
      type="button"
    >
      <span className="card-corner">
        <span>{rankLabels[card.rank]}</span>
        <small>{suitSymbol}</small>
      </span>
      <strong>{suitSymbol}</strong>
      <span className="card-corner card-corner-bottom">
        <span>{rankLabels[card.rank]}</span>
        <small>{suitSymbol}</small>
      </span>
      {isDoubled ? <span className="card-double-badge">x2</span> : null}
    </button>
  );
});

function EmptyHandSlot() {
  return <div className="card-slot" aria-label="Empty hand slot" />;
}

function HandSlot({
  children,
  index,
  setSlotRef,
}: {
  children: ReactNode;
  index: number;
  setSlotRef: (index: number) => (element: HTMLDivElement | null) => void;
}) {
  return (
    <div className="hand-slot" ref={setSlotRef(index)}>
      {children}
    </div>
  );
}

const TavernPile = forwardRef<HTMLDivElement, { count: number }>(function TavernPile({ count }, ref) {
  return (
    <div className="pile-card tavern-pile" aria-label="Tavern deck" ref={ref}>
      <span>Taberna</span>
      <strong>{count}</strong>
    </div>
  );
});

const DiscardPile = forwardRef<HTMLDivElement, { isShuffling: boolean; topCard?: Card; count: number }>(function DiscardPile(
  { isShuffling, topCard, count },
  ref,
) {
  if (!topCard) {
    return (
      <div className={`pile-card discard-pile empty ${isShuffling ? 'is-shuffling' : ''}`} aria-label="Discard pile" ref={ref}>
        <span>Descar.</span>
        <strong>{count}</strong>
      </div>
    );
  }

  return (
    <div className={`discard-wrapper ${isShuffling ? 'is-shuffling' : ''}`} aria-label="Discard pile" ref={ref}>
      <CardView card={topCard} className="discard-card" />
      <strong>{count}</strong>
    </div>
  );
});

function playedDensityClass(cardCount: number) {
  if (cardCount >= 8) return 'density-tight';
  if (cardCount >= 5) return 'density-medium';
  return 'density-loose';
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function attackValue(cards: Card[]) {
  return cards.reduce((sum, card) => sum + card.value, 0);
}

function playedSuits(cards: Card[]) {
  return new Set(cards.map((card) => card.suit).filter((suit): suit is Suit => suit !== 'none'));
}

export function App() {
  const gameState = useMemo(() => createInitialGameState(1), []);
  const initialHand = gameState.players[gameState.currentPlayerIndex].hand as Array<Card | undefined>;
  const initialDebugDiscard = gameState.tavernDeck.slice(0, debugDiscardSeedCount);
  const initialTavernDeck = gameState.tavernDeck.slice(debugDiscardSeedCount);
  const [castleDeck, setCastleDeck] = useState(gameState.castleDeck);
  const [enemy, setEnemy] = useState(gameState.currentEnemy);
  const [defeatedEnemies, setDefeatedEnemies] = useState<Card[]>(gameState.defeatedEnemies);
  const [handCards, setHandCards] = useState<Array<Card | undefined>>(initialHand);
  const [playedCards, setPlayedCards] = useState<Card[]>(gameState.playedAgainstCurrentEnemy);
  const [tavernDeck, setTavernDeck] = useState<Card[]>(initialTavernDeck);
  const [discardPile, setDiscardPile] = useState<Card[]>(initialDebugDiscard);
  const [gameStatus, setGameStatus] = useState(gameState.status);
  const [gameOverReason, setGameOverReason] = useState<string | null>(null);
  const [turnPhase, setTurnPhase] = useState(gameState.turnPhase);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(() => new Set());
  const [damageDiscardIds, setDamageDiscardIds] = useState<Set<string>>(() => new Set());
  const [discardingCardIds, setDiscardingCardIds] = useState<Set<string>>(() => new Set());
  const [rejectedCardId, setRejectedCardId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activePower, setActivePower] = useState<Suit | null>(null);
  const [shufflingPile, setShufflingPile] = useState<PileName | null>(null);
  const [flyingHealCards, setFlyingHealCards] = useState<FlyingHealCard[]>([]);
  const [flyingDrawCards, setFlyingDrawCards] = useState<FlyingDrawCard[]>([]);
  const [clubsStamps, setClubsStamps] = useState<ClubsStamp[]>([]);
  const [doubledCardIds, setDoubledCardIds] = useState<Set<string>>(() => new Set());
  const [spadesShieldTotal, setSpadesShieldTotal] = useState(gameState.spadesShieldTotalPlayedAgainstEnemy);
  const [enemyDamageTaken, setEnemyDamageTaken] = useState(enemy.damageTaken);
  const [isDamageAnimating, setIsDamageAnimating] = useState(false);
  const [shieldPulse, setShieldPulse] = useState<ShieldPulse | null>(null);
  const [isShieldBlockingAttack, setIsShieldBlockingAttack] = useState(false);
  const [drawingCardIds, setDrawingCardIds] = useState<Set<string>>(() => new Set());
  const [isResolving, setIsResolving] = useState(false);
  const enemyCard = enemy.card;
  const enemyHealthRemaining = Math.max(0, enemy.health - enemyDamageTaken);
  const enemyAttackDamage = Math.max(0, enemy.baseAttack - spadesShieldTotal);
  const damageDiscardValue = handCards.reduce((sum, card) => (card && damageDiscardIds.has(card.id) ? sum + card.value : sum), 0);
  const isDamageDiscardPhase = turnPhase === 'awaitingDamageDiscard';
  const isDamagePaymentRequired = isDamageDiscardPhase && enemyAttackDamage > 0;
  const isDamageDiscardReady = damageDiscardValue >= enemyAttackDamage;
  const defeatedSuits = new Set(
    defeatedEnemies
      .filter((card): card is Card & { rank: RoyalRank; suit: Suit } => isRoyal(card) && card.rank === enemyCard.rank)
      .map((card) => card.suit),
  );
  const topDiscard = discardPile.at(-1);
  const hasSelectedCards = selectedCardIds.size > 0;
  const hasDamageDiscardSelection = damageDiscardIds.size > 0;
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const handSlotRefs = useRef(new Map<number, HTMLDivElement>());
  const pendingFlightRects = useRef(new Map<string, DOMRect>());
  const pendingHandCompactRects = useRef(new Map<string, DOMRect>());
  const tavernPileRef = useRef<HTMLDivElement | null>(null);
  const discardPileRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (gameStatus !== 'playing' || isResolving || turnPhase !== 'awaitingAction') return;
    if (handCards.some(Boolean)) return;

    loseGame('No tienes cartas para jugar y en solitario no puedes pasar.');
  }, [gameStatus, handCards, isResolving, turnPhase]);

  useLayoutEffect(() => {
    if (pendingFlightRects.current.size === 0) return;

    const animations = Array.from(pendingFlightRects.current.entries());
    pendingFlightRects.current = new Map();

    animations.forEach(([cardId, firstRect]) => {
      const element = cardRefs.current.get(cardId);
      if (!element) return;

      const lastRect = element.getBoundingClientRect();
      const deltaX = firstRect.left - lastRect.left;
      const deltaY = firstRect.top - lastRect.top;
      const scaleX = firstRect.width / lastRect.width;
      const scaleY = firstRect.height / lastRect.height;

      element.animate(
        [
          {
            transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`,
            zIndex: 10,
          },
          {
            transform: 'translate(0, 0) scale(1)',
            zIndex: 10,
          },
        ],
        {
          duration: 420,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        },
      );
    });
  }, [playedCards]);

  useLayoutEffect(() => {
    if (pendingHandCompactRects.current.size === 0) return;

    const animations = Array.from(pendingHandCompactRects.current.entries());
    pendingHandCompactRects.current = new Map();

    animations.forEach(([cardId, firstRect]) => {
      const element = cardRefs.current.get(cardId);
      if (!element) return;

      const lastRect = element.getBoundingClientRect();
      const deltaX = firstRect.left - lastRect.left;
      const deltaY = firstRect.top - lastRect.top;

      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;

      element.animate(
        [
          {
            transform: `translate(${deltaX}px, ${deltaY}px)`,
            zIndex: 9,
          },
          {
            transform: 'translate(0, 0)',
            zIndex: 9,
          },
        ],
        {
          duration: 360,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        },
      );
    });
  }, [handCards]);

  function rejectCardSelection(cardId: string, reason: string) {
    setRejectedCardId(cardId);
    setToastMessage(reason);
    window.setTimeout(() => setRejectedCardId((current) => (current === cardId ? null : current)), 420);
    window.setTimeout(() => setToastMessage((current) => (current === reason ? null : current)), 2400);
  }

  function toggleSelectedCard(card: Card) {
    if (gameStatus !== 'playing' || isResolving || isDamageDiscardPhase) return;

    const cardId = card.id;

    setSelectedCardIds((current) => {
      const next = new Set(current);

      if (next.has(cardId)) {
        next.delete(cardId);
        return next;
      }

      const candidateCards = handCards.filter((handCard): handCard is Card => {
        if (!handCard) return false;
        return next.has(handCard.id) || handCard.id === cardId;
      });
      const validation = validateCardSelection(candidateCards);

      if (!validation.isValid) {
        rejectCardSelection(cardId, validation.reason);
        return current;
      }

      next.add(cardId);
      return next;
    });
  }

  function toggleDamageDiscardCard(card: Card) {
    if (gameStatus !== 'playing' || !isDamageDiscardPhase || isResolving) return;

    setDamageDiscardIds((current) => {
      const next = new Set(current);

      if (next.has(card.id)) {
        next.delete(card.id);
      } else {
        next.add(card.id);
      }

      return next;
    });
  }

  function handleHandCardClick(card: Card) {
    if (isDamageDiscardPhase) {
      toggleDamageDiscardCard(card);
      return;
    }

    toggleSelectedCard(card);
  }

  function setCardRef(cardId: string) {
    return (element: HTMLButtonElement | null) => {
      if (element) {
        cardRefs.current.set(cardId, element);
      } else {
        cardRefs.current.delete(cardId);
      }
    };
  }

  function expectedShieldAfterPlay(cards: Card[]) {
    if (!hasActiveSpadesPower(cards, enemyCard.suit, gameState.enemyImmunityCancelled)) return spadesShieldTotal;

    return spadesShieldTotal + attackValue(cards);
  }

  function enterAwaitingAction(nextHand = handCards) {
    nextHand.forEach((card) => {
      if (!card) return;

      const element = cardRefs.current.get(card.id);
      if (!element) return;

      pendingHandCompactRects.current.set(card.id, element.getBoundingClientRect());
    });

    setHandCards(compactHand(nextHand));
    setTurnPhase('awaitingAction');
  }

  async function playSelectedCards() {
    if (gameStatus !== 'playing' || selectedCardIds.size === 0 || isResolving) return;
    setIsResolving(true);

    const selectedCards = handCards.filter((card): card is Card => {
      if (!card) return false;
      return selectedCardIds.has(card.id);
    });

    selectedCards.forEach((card) => {
      const element = cardRefs.current.get(card.id);
      if (!element) return;
      pendingFlightRects.current.set(card.id, element.getBoundingClientRect());
    });

    const handAfterPlay = compactHand(handCards.filter((card) => !card || !selectedCardIds.has(card.id)));
    const playedCardsAfterPlay = [...playedCards, ...selectedCards];

    setHandCards(handAfterPlay);
    setPlayedCards(playedCardsAfterPlay);
    setSelectedCardIds(new Set());

    await sleep(460);
    setTurnPhase('resolvingSuitPowers');
    await sleep(phaseAnimationMs);
    await resolveHeartPower(selectedCards);
    const handAfterPowers = await resolveDiamondPower(selectedCards, handAfterPlay);
    await resolveClubsPower(selectedCards);
    await resolveSpadesPower(selectedCards);
    setTurnPhase('resolvingDamage');
    await sleep(phaseAnimationMs);
    await resolveDamage(selectedCards, expectedShieldAfterPlay(selectedCards), handAfterPowers, playedCardsAfterPlay);
    setIsResolving(false);
  }

  async function resolveHeartPower(cards: Card[]) {
    const suitsInPlay = playedSuits(cards);
    const heartsPowerActive = suitsInPlay.has('hearts') && (enemyCard.suit !== 'hearts' || gameState.enemyImmunityCancelled);

    if (!heartsPowerActive) return;

    setActivePower('hearts');
    await sleep(powerAnimationMs);

    const healCount = Math.min(attackValue(cards), discardPile.length);

    if (healCount > 0) {
      await runPileShuffle('discard');
      await animateHealCards(healCount);

      const shuffledDiscard = shuffleDeck(discardPile);
      const healedCards = shuffledDiscard.slice(0, healCount);
      const remainingDiscard = shuffledDiscard.slice(healCount);

      setDiscardPile(remainingDiscard);
      setTavernDeck((cardsInDeck) => [...cardsInDeck, ...healedCards]);
    }

    setActivePower(null);
  }

  async function resolveDiamondPower(cards: Card[], currentHand: Array<Card | undefined>) {
    const suitsInPlay = playedSuits(cards);
    const diamondsPowerActive = suitsInPlay.has('diamonds') && (enemyCard.suit !== 'diamonds' || gameState.enemyImmunityCancelled);

    if (!diamondsPowerActive) return currentHand;

    setActivePower('diamonds');
    await sleep(powerAnimationMs);

    const emptySlots = Array.from({ length: gameState.players[gameState.currentPlayerIndex].maxHandSize }, (_, index) => index).filter((index) => !currentHand[index]);
    const drawCount = Math.min(attackValue(cards), emptySlots.length, tavernDeck.length);

    if (drawCount > 0) {
      const drawnCards = tavernDeck.slice(0, drawCount);
      const targetSlots = emptySlots.slice(0, drawCount);
      const nextHand = [...currentHand];

      drawnCards.forEach((card, cardIndex) => {
        nextHand[targetSlots[cardIndex]] = card;
      });

      setDrawingCardIds(new Set(drawnCards.map((card) => card.id)));
      setHandCards(nextHand);
      await sleep(40);
      const drawAnimationMs = animateDrawCards(drawnCards, targetSlots);
      await sleep(drawAnimationMs - drawLandingOverlapMs);
      setDrawingCardIds(new Set());
      await sleep(drawLandingOverlapMs);
      setTavernDeck((cardsInDeck) => cardsInDeck.slice(drawCount));
      setActivePower(null);
      return nextHand;
    }

    setActivePower(null);
    return currentHand;
  }

  async function resolveClubsPower(cards: Card[]) {
    const suitsInPlay = playedSuits(cards);
    const clubsPowerActive = suitsInPlay.has('clubs') && (enemyCard.suit !== 'clubs' || gameState.enemyImmunityCancelled);

    if (!clubsPowerActive) return;

    setActivePower('clubs');
    await sleep(powerAnimationMs);
    const clubsCards = cards.filter((card) => card.suit === 'clubs');
    await animateClubsStamps(clubsCards);
    setDoubledCardIds((current) => {
      const next = new Set(current);
      clubsCards.forEach((card) => next.add(card.id));
      return next;
    });
    setActivePower(null);
  }

  async function resolveSpadesPower(cards: Card[]) {
    const suitsInPlay = playedSuits(cards);
    const spadesPowerActive = suitsInPlay.has('spades') && (enemyCard.suit !== 'spades' || gameState.enemyImmunityCancelled);

    if (!spadesPowerActive) return;

    const shieldAmount = attackValue(cards);

    setActivePower('spades');
    await sleep(powerAnimationMs);
    setShieldPulse({ id: `shield-pulse-${Date.now()}`, amount: shieldAmount });
    await sleep(360);
    setSpadesShieldTotal((current) => current + shieldAmount);
    await sleep(spadesShieldAnimationMs - 360);
    setShieldPulse(null);
    setActivePower(null);
  }

  async function resolveDamage(
    cards: Card[],
    shieldAfterPlay: number,
    currentHand: Array<Card | undefined>,
    currentPlayedCards: Card[],
  ) {
    const damage = calculateDamage(cards, enemyCard.suit !== 'clubs' || gameState.enemyImmunityCancelled);
    const damageAfterHit = enemyDamageTaken + damage;

    setIsDamageAnimating(true);
    await sleep(Math.floor(damageBubbleAnimationMs * 0.42));
    setEnemyDamageTaken(damageAfterHit);
    await sleep(Math.ceil(damageBubbleAnimationMs * 0.58));
    setIsDamageAnimating(false);

    if (damageAfterHit >= enemy.health) {
      await defeatCurrentEnemy(damageAfterHit, currentPlayedCards);
      return;
    }

    const effectiveAttack = Math.max(0, enemy.baseAttack - shieldAfterPlay);
    if (effectiveAttack === 0) {
      setTurnPhase('awaitingDamageDiscard');
      setIsShieldBlockingAttack(true);
      await sleep(shieldBlockAnimationMs);
      setIsShieldBlockingAttack(false);
      enterAwaitingAction(currentHand);
      return;
    }

    if (!canSatisfyDamage(currentHand, effectiveAttack)) {
      loseGame(`No puedes descartar ${effectiveAttack} puntos para resistir el ataque.`);
      return;
    }

    setTurnPhase('awaitingDamageDiscard');
  }

  async function confirmDamageDiscard() {
    if (gameStatus !== 'playing' || !isDamageDiscardPhase || isResolving || !isDamageDiscardReady) return;

    setIsResolving(true);

    const discardedCards = handCards.filter((card): card is Card => {
      if (!card) return false;
      return damageDiscardIds.has(card.id);
    });

    await animateDamageDiscards(discardedCards);
    const handAfterDiscard = compactHand(handCards.filter((card) => !card || !damageDiscardIds.has(card.id)));
    setDiscardPile((cards) => [...cards, ...discardedCards]);
    setDamageDiscardIds(new Set());
    enterAwaitingAction(handAfterDiscard);
    setIsResolving(false);
  }

  function loseGame(reason: string) {
    setGameStatus('lost');
    setGameOverReason(reason);
    setTurnPhase('gameOver');
    setSelectedCardIds(new Set());
    setDamageDiscardIds(new Set());
    setIsResolving(false);
  }

  function restartGame() {
    const freshGameState = createInitialGameState(1);
    const freshHand = freshGameState.players[freshGameState.currentPlayerIndex].hand as Array<Card | undefined>;
    const freshDebugDiscard = freshGameState.tavernDeck.slice(0, debugDiscardSeedCount);
    const freshTavernDeck = freshGameState.tavernDeck.slice(debugDiscardSeedCount);

    setCastleDeck(freshGameState.castleDeck);
    setEnemy(freshGameState.currentEnemy);
    setDefeatedEnemies(freshGameState.defeatedEnemies);
    setHandCards(freshHand);
    setPlayedCards(freshGameState.playedAgainstCurrentEnemy);
    setTavernDeck(freshTavernDeck);
    setDiscardPile(freshDebugDiscard);
    setGameStatus(freshGameState.status);
    setGameOverReason(null);
    setTurnPhase(freshGameState.turnPhase);
    setSelectedCardIds(new Set());
    setDamageDiscardIds(new Set());
    setDiscardingCardIds(new Set());
    setRejectedCardId(null);
    setToastMessage(null);
    setActivePower(null);
    setShufflingPile(null);
    setFlyingHealCards([]);
    setFlyingDrawCards([]);
    setClubsStamps([]);
    setDoubledCardIds(new Set());
    setSpadesShieldTotal(freshGameState.spadesShieldTotalPlayedAgainstEnemy);
    setEnemyDamageTaken(freshGameState.currentEnemy.damageTaken);
    setIsDamageAnimating(false);
    setShieldPulse(null);
    setIsShieldBlockingAttack(false);
    setDrawingCardIds(new Set());
    setIsResolving(false);
    pendingFlightRects.current = new Map();
    pendingHandCompactRects.current = new Map();
  }

  function winGame() {
    setGameStatus('won');
    setGameOverReason('Has derrotado al ultimo Rey.');
    setTurnPhase('gameOver');
    setSelectedCardIds(new Set());
    setDamageDiscardIds(new Set());
    setIsResolving(false);
  }

  async function defeatCurrentEnemy(finalDamageTaken: number, cardsPlayedAgainstEnemy: Card[]) {
    await sleep(360);

    const exactKill = finalDamageTaken === enemy.health;
    const nextCastleCard = castleDeck[0];
    const remainingCastleDeck = castleDeck.slice(1);
    const defeatedEnemyCard = enemy.card;

    if (exactKill) {
      setTavernDeck((cards) => [defeatedEnemyCard, ...cards]);
    } else {
      setDiscardPile((cards) => [...cards, defeatedEnemyCard]);
    }

    setDiscardPile((cards) => [...cards, ...cardsPlayedAgainstEnemy]);
    setDefeatedEnemies((cards) => [...cards, defeatedEnemyCard]);
    setPlayedCards([]);
    setDoubledCardIds(new Set());
    setSpadesShieldTotal(0);
    setEnemyDamageTaken(0);
    setShieldPulse(null);
    setActivePower(null);

    if (nextCastleCard && isRoyal(nextCastleCard)) {
      setCastleDeck(remainingCastleDeck);
      setEnemy(createEnemyState(nextCastleCard));
      enterAwaitingAction();
    } else {
      setCastleDeck([]);
      winGame();
    }
  }

  async function runPileShuffle(pile: PileName) {
    setShufflingPile(pile);
    await sleep(shuffleAnimationMs);
    setShufflingPile(null);
  }

  async function animateHealCards(count: number) {
    const fromRect = discardPileRef.current?.getBoundingClientRect();
    const toRect = tavernPileRef.current?.getBoundingClientRect();

    if (!fromRect || !toRect) return;

    const flights = Array.from({ length: count }, (_, index) => ({
      id: `heal-flight-${Date.now()}-${index}`,
      delayMs: index * 70,
      fromX: fromRect.left + fromRect.width / 2,
      fromY: fromRect.top + fromRect.height / 2,
      toX: toRect.left + toRect.width / 2,
      toY: toRect.top + toRect.height / 2,
    }));

    setFlyingHealCards(flights);
    await sleep(healFlightMs + count * 70);
    setFlyingHealCards([]);
  }

  function animateDrawCards(cards: Card[], targetSlots: number[]) {
    const fromRect = tavernPileRef.current?.getBoundingClientRect();

    if (!fromRect) return drawRevealMs + drawFlightDurationMs;

    const maxDelay = Math.max(0, drawFlightWindowMs - drawFlightDurationMs);
    const delayStep = cards.length <= 1 ? 0 : Math.min(115, maxDelay / (cards.length - 1));
    const flights = cards.flatMap((card, index) => {
      const toRect = handSlotRefs.current.get(targetSlots[index])?.getBoundingClientRect();
      if (!toRect) return [];

      return {
        card,
        delayMs: drawRevealMs + index * delayStep,
        fromX: fromRect.left + fromRect.width / 2,
        fromY: fromRect.top + fromRect.height / 2,
        toX: toRect.left + toRect.width / 2,
        toY: toRect.top + toRect.height / 2,
      };
    });

    setFlyingDrawCards(flights);
    const totalDuration = drawRevealMs + drawFlightDurationMs + delayStep * Math.max(0, cards.length - 1) + 80;
    window.setTimeout(() => setFlyingDrawCards([]), totalDuration);

    return totalDuration;
  }

  function setHandSlotRef(index: number) {
    return (element: HTMLDivElement | null) => {
      if (element) {
        handSlotRefs.current.set(index, element);
      } else {
        handSlotRefs.current.delete(index);
      }
    };
  }

  async function animateClubsStamps(cards: Card[]) {
    const stamps = cards.flatMap((card, index) => {
      const rect = cardRefs.current.get(card.id)?.getBoundingClientRect();
      if (!rect) return [];

      return {
        id: `clubs-stamp-${card.id}`,
        delayMs: index * clubsStampDelayMs,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    });

    if (stamps.length === 0) return;

    setClubsStamps(stamps);
    await sleep(clubsStampDurationMs + clubsStampDelayMs * (stamps.length - 1) + 100);
    setClubsStamps([]);
  }

  async function animateDamageDiscards(cards: Card[]) {
    const toRect = discardPileRef.current?.getBoundingClientRect();
    if (!toRect) return;

    setDiscardingCardIds(new Set(cards.map((card) => card.id)));

    const animations = cards.flatMap((card) => {
      const element = cardRefs.current.get(card.id);
      if (!element) return [];

      const fromRect = element.getBoundingClientRect();
      return element.animate(
        [
          {
            opacity: 1,
            transform: 'translate(0, 0) scale(1) rotate(0deg)',
          },
          {
            opacity: 0,
            transform: `translate(${toRect.left + toRect.width / 2 - (fromRect.left + fromRect.width / 2)}px, ${
              toRect.top + toRect.height / 2 - (fromRect.top + fromRect.height / 2)
            }px) scale(0.42) rotate(8deg)`,
          },
        ],
        {
          duration: 520,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          fill: 'forwards',
        },
      ).finished;
    });

    await Promise.allSettled(animations);
    setDiscardingCardIds(new Set());
  }

  return (
    <main className="game-shell">
      {toastMessage ? <div className="toast">{toastMessage}</div> : null}
      {gameStatus !== 'playing' ? (
        <section className={`game-result ${gameStatus}`} aria-live="polite">
          <strong>{gameStatus === 'won' ? 'Victoria' : 'Derrota'}</strong>
          <span>{gameOverReason}</span>
          <button onClick={restartGame} type="button">
            Volver a empezar
          </button>
        </section>
      ) : null}
      {flyingHealCards.map((flight) => (
        <div
          className="heal-flight-card"
          key={flight.id}
          style={
            {
              '--delay': `${flight.delayMs}ms`,
              '--from-x': `${flight.fromX}px`,
              '--from-y': `${flight.fromY}px`,
              '--to-x': `${flight.toX}px`,
              '--to-y': `${flight.toY}px`,
            } as CSSProperties
          }
        />
      ))}
      {flyingDrawCards.map((flight) => (
        <CardView
          card={flight.card}
          className="draw-flight-card"
          key={flight.card.id}
          style={
            {
              '--delay': `${flight.delayMs}ms`,
              '--from-x': `${flight.fromX}px`,
              '--from-y': `${flight.fromY}px`,
              '--to-x': `${flight.toX}px`,
              '--to-y': `${flight.toY}px`,
            } as CSSProperties
          }
        />
      ))}
      {clubsStamps.map((stamp) => (
        <div
          className="clubs-stamp"
          key={stamp.id}
          style={
            {
              '--delay': `${stamp.delayMs}ms`,
              '--stamp-x': `${stamp.x}px`,
              '--stamp-y': `${stamp.y}px`,
            } as CSSProperties
          }
        >
          x2
        </div>
      ))}

      <section className="board-grid">
        <section className="phase-track" aria-label="Turn steps">
          {turnSteps.map((step) => (
            <span className={turnPhase === step.phase ? 'active' : ''} key={step.phase}>
              {step.label}
            </span>
          ))}
        </section>

        <aside className="rules-panel" aria-label="Suit powers reminder">
          <section className="power-panel" aria-label="Suit powers">
            <div className="power-list">
              {suits.map((suit) => (
                <p
                  className={`${enemyCard.suit === suit && !gameState.enemyImmunityCancelled ? 'blocked' : ''} ${
                    activePower === suit ? 'active-power' : ''
                  }`}
                  key={suit}
                >
                  <strong>{suitSymbols[suit]}</strong>
                  <span>{suitPowerShortLabelsEs[suit]}</span>
                </p>
              ))}
            </div>
          </section>

          <div className="player-combat-panel" aria-label="Player combat values">
            <div className="player-combat-meter player-attack-meter" aria-label="Attack dealt to enemy">
              <Swords size={42} strokeWidth={1.8} />
              <strong>{enemyDamageTaken}</strong>
            </div>
            <div
              className={`player-combat-meter shield-meter ${isShieldBlockingAttack ? 'is-blocking-attack' : ''}`}
              aria-label="Current defensive bonus"
            >
              <Shield size={42} strokeWidth={1.8} />
              <strong className={shieldPulse ? 'is-charging' : ''}>{spadesShieldTotal}</strong>
              {shieldPulse ? (
                <span className="shield-gain" key={shieldPulse.id}>
                  +{shieldPulse.amount}
                </span>
              ) : null}
            </div>
          </div>
        </aside>

        <section className="boss-zone" aria-label="Current enemy">
          <div className={`enemy-playing-card ${enemyCard.suit}`}>
            <div className="enemy-corner">
              <span>{rankLabels[enemyCard.rank]}</span>
              <small>{suitSymbols[enemyCard.suit]}</small>
            </div>
            <div className="enemy-tier-suits" aria-label="Current level suit progress">
              {suits
                .filter((suit) => suit !== enemyCard.suit)
                .map((suit) => (
                  <span
                    className={`${suit} ${defeatedSuits.has(suit) ? 'defeated' : ''}`}
                    key={suit}
                  >
                    <small>{rankLabels[enemyCard.rank]}</small>
                    {suitSymbols[suit]}
                  </span>
                ))}
            </div>
            <strong>{suitSymbols[enemyCard.suit]}</strong>
            <div className="boss-stats" aria-label="Enemy combat values">
              <span className={isDamageAnimating ? 'damage-bubble is-damage-animating' : 'damage-bubble'}>
                <HeartPulse size={16} />
                {enemyHealthRemaining}
              </span>
              <span
                className={`enemy-attack-bubble ${isDamageDiscardPhase ? 'is-discard-counter' : ''} ${
                  isDamagePaymentRequired && isDamageDiscardReady ? 'is-ready' : ''
                } ${
                  isDamageDiscardPhase && !isDamagePaymentRequired ? 'is-blocked' : ''
                }`}
                onClick={confirmDamageDiscard}
                role={isDamagePaymentRequired ? 'button' : undefined}
              >
                <Swords size={16} />
                {isDamagePaymentRequired ? `${damageDiscardValue}/${enemyAttackDamage}` : enemyAttackDamage}
              </span>
            </div>
          </div>
        </section>
      </section>

      <section className="played-row" aria-label="Cards played against the enemy">
        <div
          className={`played-pool ${playedDensityClass(playedCards.length)} ${hasSelectedCards && !isResolving ? 'can-play' : ''}`}
          onClick={playSelectedCards}
        >
          {playedCards.length === 0 ? (
            <span className="pool-empty">Cartas jugadas contra el enemigo</span>
          ) : (
            playedCards.map((card) => (
              <CardView card={card} className="played-card" isDoubled={doubledCardIds.has(card.id)} key={card.id} ref={setCardRef(card.id)} />
            ))
          )}
        </div>
      </section>

      <section className={`hand-zone ${isDamagePaymentRequired ? 'damage-discard-mode' : ''}`} aria-label="Player hand and piles">
        <div className="hand-grid">
          {Array.from({ length: 4 }, (_, index) => {
            const card = handCards[index];
            return (
              <HandSlot index={index} key={index} setSlotRef={setHandSlotRef}>
                {card ? (
                <CardView
                  card={card}
                  isDimmed={
                    (!isDamageDiscardPhase && hasSelectedCards && !selectedCardIds.has(card.id)) ||
                    (isDamageDiscardPhase && hasDamageDiscardSelection && !damageDiscardIds.has(card.id))
                  }
                  className={`${rejectedCardId === card.id ? 'rejected' : ''} ${drawingCardIds.has(card.id) ? 'drawing-hidden' : ''} ${
                    damageDiscardIds.has(card.id) ? 'damage-selected' : ''
                  } ${discardingCardIds.has(card.id) ? 'discarding' : ''}`}
                  isSelected={!isDamageDiscardPhase && selectedCardIds.has(card.id)}
                  onClick={() => handleHandCardClick(card)}
                  ref={setCardRef(card.id)}
                />
              ) : (
                <EmptyHandSlot />
              )}
              </HandSlot>
            );
          })}
          <TavernPile count={tavernDeck.length} ref={tavernPileRef} />
          {Array.from({ length: 4 }, (_, offset) => {
            const index = offset + 4;
            const card = handCards[index];
            return (
              <HandSlot index={index} key={index} setSlotRef={setHandSlotRef}>
                {card ? (
                  <CardView
                    card={card}
                    isDimmed={
                      (!isDamageDiscardPhase && hasSelectedCards && !selectedCardIds.has(card.id)) ||
                      (isDamageDiscardPhase && hasDamageDiscardSelection && !damageDiscardIds.has(card.id))
                    }
                    className={`${rejectedCardId === card.id ? 'rejected' : ''} ${drawingCardIds.has(card.id) ? 'drawing-hidden' : ''} ${
                      damageDiscardIds.has(card.id) ? 'damage-selected' : ''
                    } ${discardingCardIds.has(card.id) ? 'discarding' : ''}`}
                    isSelected={!isDamageDiscardPhase && selectedCardIds.has(card.id)}
                    onClick={() => handleHandCardClick(card)}
                    ref={setCardRef(card.id)}
                  />
                ) : (
                  <EmptyHandSlot />
                )}
              </HandSlot>
            );
          })}
          <DiscardPile count={discardPile.length} isShuffling={shufflingPile === 'discard'} ref={discardPileRef} topCard={topDiscard} />
        </div>
      </section>
    </main>
  );
}

function calculateDamage(cards: Card[], isClubsPowerActive: boolean) {
  const baseDamage = attackValue(cards);
  const hasActiveClubs = cards.some((card) => card.suit === 'clubs');

  return hasActiveClubs && isClubsPowerActive ? baseDamage * 2 : baseDamage;
}

function canSatisfyDamage(cards: Array<Card | undefined>, damage: number) {
  return cards.reduce((sum, card) => sum + (card?.value ?? 0), 0) >= damage;
}

function hasActiveSpadesPower(cards: Card[], enemySuit: Suit, enemyImmunityCancelled: boolean) {
  return cards.some((card) => card.suit === 'spades') && (enemySuit !== 'spades' || enemyImmunityCancelled);
}

function createEnemyState(card: Card & { rank: RoyalRank; suit: Suit }): EnemyState {
  const stats = royalStats[card.rank];

  return {
    card,
    baseAttack: stats.attack,
    health: stats.health,
    damageTaken: 0,
  };
}

function compactHand(cards: Array<Card | undefined>) {
  const compacted = cards.filter((card): card is Card => Boolean(card));

  return Array.from({ length: cards.length }, (_, index) => compacted[index]);
}
