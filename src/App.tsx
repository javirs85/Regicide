import { forwardRef, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Shield, Skull, Swords } from 'lucide-react';
import {
  rankLabels,
  suitPowerShortLabelsEs,
  suitSymbols,
  suits,
  type Card,
} from './game/cards';
import { createInitialGameState, getDefeatedSuitsForCurrentTier } from './game/state';

const turnSteps = [
  { phase: 'awaitingAction', label: '1. Jugar o pasar' },
  { phase: 'resolvingSuitPowers', label: '2. Poderes' },
  { phase: 'resolvingDamage', label: '3. Daño' },
  { phase: 'awaitingDamageDiscard', label: '4. Ataque enemigo' },
] as const;

type CardViewProps = {
  card: Card;
  className?: string;
  isDimmed?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
};

const CardView = forwardRef<HTMLButtonElement, CardViewProps>(function CardView(
  { card, className = '', isDimmed = false, isSelected = false, onClick },
  ref,
) {
  const suitClass = card.suit === 'none' ? 'none' : card.suit;
  const suitSymbol = card.suit === 'none' ? '★' : suitSymbols[card.suit];

  return (
    <button
      className={`playing-card ${suitClass} ${isSelected ? 'selected' : ''} ${isDimmed ? 'dimmed' : ''} ${className}`}
      onClick={onClick}
      ref={ref}
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
    </button>
  );
});

function EmptyHandSlot() {
  return <div className="card-slot" aria-label="Empty hand slot" />;
}

function TavernPile({ count }: { count: number }) {
  return (
    <div className="pile-card tavern-pile" aria-label="Tavern deck">
      <span>Taberna</span>
      <strong>{count}</strong>
    </div>
  );
}

function DiscardPile({ topCard, count }: { topCard?: Card; count: number }) {
  if (!topCard) {
    return (
      <div className="pile-card discard-pile empty" aria-label="Discard pile">
        <span>Descar.</span>
        <strong>{count}</strong>
      </div>
    );
  }

  return (
    <div className="discard-wrapper" aria-label="Discard pile">
      <CardView card={topCard} className="discard-card" />
      <strong>{count}</strong>
    </div>
  );
}

export function App() {
  const gameState = useMemo(() => createInitialGameState(1), []);
  const initialHand = gameState.players[gameState.currentPlayerIndex].hand;
  const [handCards, setHandCards] = useState<Card[]>(initialHand);
  const [playedCards, setPlayedCards] = useState<Card[]>(gameState.playedAgainstCurrentEnemy);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(() => new Set());
  const enemy = gameState.currentEnemy;
  const enemyCard = enemy.card;
  const enemyHealthRemaining = enemy.health - enemy.damageTaken;
  const defeatedSuits = getDefeatedSuitsForCurrentTier(gameState);
  const topDiscard = gameState.discardPile.at(-1);
  const hasSelectedCards = selectedCardIds.size > 0;
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingFlightRects = useRef(new Map<string, DOMRect>());

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

  function toggleSelectedCard(cardId: string) {
    setSelectedCardIds((current) => {
      const next = new Set(current);

      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }

      return next;
    });
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

  function playSelectedCards() {
    if (selectedCardIds.size === 0) return;

    const selectedCards = handCards.filter((card) => selectedCardIds.has(card.id));

    selectedCards.forEach((card) => {
      const element = cardRefs.current.get(card.id);
      if (!element) return;
      pendingFlightRects.current.set(card.id, element.getBoundingClientRect());
    });

    setHandCards((cards) => cards.filter((card) => !selectedCardIds.has(card.id)));
    setPlayedCards((cards) => [...cards, ...selectedCards]);
    setSelectedCardIds(new Set());
  }

  return (
    <main className="game-shell">
      <section className="board-grid">
        <section className="phase-track" aria-label="Turn steps">
          {turnSteps.map((step) => (
            <span className={gameState.turnPhase === step.phase ? 'active' : ''} key={step.phase}>
              {step.label}
            </span>
          ))}
        </section>

        <aside className="rules-panel" aria-label="Suit powers reminder">
          <section className="power-panel" aria-label="Suit powers">
            <div className="power-list">
              {suits.map((suit) => (
                <p className={enemyCard.suit === suit && !gameState.enemyImmunityCancelled ? 'blocked' : ''} key={suit}>
                  <strong>{suitSymbols[suit]}</strong>
                  <span>{suitPowerShortLabelsEs[suit]}</span>
                </p>
              ))}
            </div>
          </section>

          <div className="shield-meter" aria-label="Current defensive bonus">
            <Shield size={72} strokeWidth={1.7} />
            <strong>{gameState.spadesShieldTotalPlayedAgainstEnemy}</strong>
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
              <span>
                <Shield size={16} />
                {enemyHealthRemaining}
              </span>
              <span>
                <Skull size={16} />
                {enemy.damageTaken}
              </span>
              <span>
                <Swords size={16} />
                {enemy.baseAttack}
              </span>
            </div>
          </div>
        </section>
      </section>

      <section className="played-row" aria-label="Cards played against the enemy">
        <div className={`played-pool ${hasSelectedCards ? 'can-play' : ''}`} onClick={playSelectedCards}>
          {playedCards.length === 0 ? (
            <span className="pool-empty">Cartas jugadas contra el enemigo</span>
          ) : (
            playedCards.map((card) => <CardView card={card} className="played-card" key={card.id} ref={setCardRef(card.id)} />)
          )}
        </div>
      </section>

      <section className="hand-zone" aria-label="Player hand and piles">
        <div className="hand-grid">
          {Array.from({ length: 4 }, (_, index) =>
            handCards[index] ? (
              <CardView
                card={handCards[index]}
                isDimmed={hasSelectedCards && !selectedCardIds.has(handCards[index].id)}
                isSelected={selectedCardIds.has(handCards[index].id)}
                key={handCards[index].id}
                onClick={() => toggleSelectedCard(handCards[index].id)}
                ref={setCardRef(handCards[index].id)}
              />
            ) : (
              <EmptyHandSlot key={index} />
            ),
          )}
          <TavernPile count={gameState.tavernDeck.length} />
          {Array.from({ length: 4 }, (_, offset) => {
            const index = offset + 4;
            return handCards[index] ? (
              <CardView
                card={handCards[index]}
                isDimmed={hasSelectedCards && !selectedCardIds.has(handCards[index].id)}
                isSelected={selectedCardIds.has(handCards[index].id)}
                key={handCards[index].id}
                onClick={() => toggleSelectedCard(handCards[index].id)}
                ref={setCardRef(handCards[index].id)}
              />
            ) : (
              <EmptyHandSlot key={index} />
            );
          })}
          <DiscardPile count={gameState.discardPile.length} topCard={topDiscard} />
        </div>
      </section>
    </main>
  );
}
