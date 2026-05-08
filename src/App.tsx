import { useMemo } from 'react';
import { Shield, Skull, Swords } from 'lucide-react';
import {
  rankLabels,
  suitPowerDescriptionsEs,
  suitSymbols,
  suits,
  type Card,
} from './game/cards';
import { createInitialGameState } from './game/state';

const turnSteps = [
  { phase: 'awaitingAction', label: '1. Jugar o pasar' },
  { phase: 'resolvingSuitPowers', label: '2. Poderes' },
  { phase: 'resolvingDamage', label: '3. Daño' },
  { phase: 'awaitingDamageDiscard', label: '4. Ataque enemigo' },
] as const;

function CardView({ card, className = '' }: { card: Card; className?: string }) {
  const suitClass = card.suit === 'none' ? 'none' : card.suit;
  const suitSymbol = card.suit === 'none' ? '★' : suitSymbols[card.suit];

  return (
    <button className={`playing-card ${suitClass} ${className}`} type="button">
      <span>{rankLabels[card.rank]}</span>
      <strong>{suitSymbol}</strong>
      <small>{card.value}</small>
    </button>
  );
}

export function App() {
  const gameState = useMemo(() => createInitialGameState(1), []);
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const enemy = gameState.currentEnemy;
  const enemyCard = enemy.card;
  const enemyHealthRemaining = enemy.health - enemy.damageTaken;

  return (
    <main className="game-shell">
      <section className="board-grid">
        <aside className="rules-panel" aria-label="Suit powers reminder">
          <section className="power-panel" aria-label="Suit powers">
            <div className="zone-heading">
              <h2>Poderes de los palos</h2>
              <span>Recordatorio</span>
            </div>
            <div className="power-list">
              {suits.map((suit) => (
                <p className={enemyCard.suit === suit && !gameState.enemyImmunityCancelled ? 'blocked' : ''} key={suit}>
                  <strong>{suitSymbols[suit]}</strong>
                  {suitPowerDescriptionsEs[suit]}
                </p>
              ))}
            </div>
          </section>

          <section className="phase-track" aria-label="Turn steps">
            {turnSteps.map((step) => (
              <span className={gameState.turnPhase === step.phase ? 'active' : ''} key={step.phase}>
                {step.label}
              </span>
            ))}
          </section>
        </aside>

        <section className="boss-zone" aria-label="Current enemy">
          <div className={`enemy-playing-card ${enemyCard.suit}`}>
            <div className="enemy-corner">
              <span>{rankLabels[enemyCard.rank]}</span>
              <small>{suitSymbols[enemyCard.suit]}</small>
            </div>
            <strong>{suitSymbols[enemyCard.suit]}</strong>
            <div className="boss-stats" aria-label="Enemy combat values">
              <span>
                <Shield size={16} />
                Vida {enemyHealthRemaining}
              </span>
              <span>
                <Skull size={16} />
                Daño {enemy.damageTaken}
              </span>
              <span>
                <Swords size={16} />
                Ataca {enemy.baseAttack}
              </span>
            </div>
          </div>
        </section>
      </section>

      <section className="table-controls" aria-label="Round actions">
        <button type="button">
          <Swords size={18} />
          Jugar cartas
        </button>
        <button type="button">
          <Shield size={18} />
          Defender
        </button>
        <button type="button">
          <Skull size={18} />
          Pasar
        </button>
      </section>

      <section className="hand-zone" aria-label="Player hand">
        <div className="zone-heading">
          <h2>{currentPlayer.name}</h2>
          <span>
            {currentPlayer.hand.length}/{currentPlayer.maxHandSize} cartas
          </span>
        </div>
        <div className="hand">
          {currentPlayer.hand.map((card) => (
            <CardView card={card} key={card.id} />
          ))}
        </div>
      </section>
    </main>
  );
}
