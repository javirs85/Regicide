# Regicide Android Implementation Guide

Source baseline: official Regicide rules PDF by Badgers From Mars / RegicideGame.com.

> Scope: implement the standard Regicide card game digitally for Android. This document focuses on rules, domain model, turn flow, validation, and edge cases. It intentionally avoids UI-specific decisions except where they affect game state.

---

## 1. Game overview

Regicide is a cooperative card game for 1-4 players.

Players fight through a **Castle deck** of 12 enemies:

| Tier | Cards | Enemy attack | Enemy health |
|---|---:|---:|---:|
| Jack | 4 | 10 | 20 |
| Queen | 4 | 15 | 30 |
| King | 4 | 20 | 40 |

Players win when the last King is defeated.

Players lose if:

| Loss condition | Meaning |
|---|---|
| Cannot satisfy enemy damage | Current player cannot discard enough hand value during enemy attack |
| Cannot act | Current player cannot play a legal card/set and cannot legally yield |

---

## 2. Cards

### 2.1 Card categories

| Category | Cards | Usage |
|---|---|---|
| Number cards | 2-10, all suits | Main player cards |
| Animal Companions / Aces | A, all suits | Value 1; can be played alone or paired |
| Jesters | 0-2 depending on player count | Cancel enemy immunity; choose next player |
| Royals | J/Q/K | Enemies first; defeated enemies may enter Tavern deck |

### 2.2 Suits

| Suit | Power | Timing |
|---|---|---|
| Hearts | Heal from discard into bottom of Tavern deck | Immediate |
| Diamonds | Draw cards up to hand limits | Immediate |
| Clubs | Double damage dealt by this play | Damage step |
| Spades | Reduce current enemy attack cumulatively | Enemy attack step |

### 2.3 Card values

| Card | Value when played/discarded |
|---|---:|
| A / Animal Companion | 1 |
| 2-10 | Face value |
| Jack | 10 |
| Queen | 15 |
| King | 20 |
| Jester | 0 |

---

## 3. Setup

### 3.1 Player count configuration

| Players | Jesters in Tavern deck | Max hand size |
|---:|---:|---:|
| 1 | 0 in deck; 2 solo-use Jesters aside | 8 |
| 2 | 0 | 7 |
| 3 | 1 | 6 |
| 4 | 2 | 5 |

### 3.2 Deck construction

#### Castle deck

1. Shuffle the 4 Kings.
2. Shuffle the 4 Queens and place them on top of Kings.
3. Shuffle the 4 Jacks and place them on top of Queens.
4. Reveal the top card as the current enemy.

Resulting order: all Jacks first, then Queens, then Kings; suit order inside each tier is random.

#### Tavern deck

Contains:

| Cards |
|---|
| All number cards 2-10 |
| All 4 Aces / Animal Companions |
| Jesters according to player count |

Shuffle Tavern deck, then deal each player up to max hand size.

---

## 4. Core game state

Suggested domain entities:

```csharp
enum Suit
{
    Hearts,
    Diamonds,
    Clubs,
    Spades,
    None // for Jester only
}

enum Rank
{
    Ace = 1,
    Two = 2,
    Three = 3,
    Four = 4,
    Five = 5,
    Six = 6,
    Seven = 7,
    Eight = 8,
    Nine = 9,
    Ten = 10,
    Jack = 11,
    Queen = 12,
    King = 13,
    Jester = 0
}

enum CardZone
{
    TavernDeck,
    DiscardPile,
    CastleDeck,
    CurrentEnemy,
    PlayerHand,
    PlayedAgainstEnemy,
    SoloJesterReserve
}

record Card(Guid Id, Rank Rank, Suit Suit);
```

Suggested game state:

```csharp
class RegicideGameState
{
    public List<PlayerState> Players { get; set; } = [];
    public Deck TavernDeck { get; set; } = new();
    public Deck CastleDeck { get; set; } = new();
    public List<Card> DiscardPile { get; set; } = [];
    public EnemyState CurrentEnemy { get; set; } = default!;

    public int CurrentPlayerIndex { get; set; }
    public GameStatus Status { get; set; }

    public int ConsecutiveYields { get; set; }
    public bool EnemyImmunityCancelled { get; set; }

    // Needed because spades are cumulative and can become active after Jester.
    public int SpadesShieldTotalPlayedAgainstEnemy { get; set; }

    // Cards played against the current enemy, discarded when enemy dies.
    public List<Card> PlayedAgainstCurrentEnemy { get; set; } = [];
}
```

Enemy state:

```csharp
class EnemyState
{
    public Card Card { get; set; } = default!;
    public int BaseAttack { get; set; }
    public int Health { get; set; }
    public int DamageTaken { get; set; }
}
```

Player state:

```csharp
class PlayerState
{
    public string Name { get; set; } = "";
    public List<Card> Hand { get; set; } = [];
    public int MaxHandSize { get; set; }
}
```

---

## 5. Turn flow

Each normal turn has four steps:

| Step | Name | Summary |
|---:|---|---|
| 1 | Play card(s) or yield | Player chooses a legal play, Jester, or yield |
| 2 | Activate suit powers | Immediate powers resolve; black powers are registered |
| 3 | Deal damage and check enemy defeat | Apply damage, kill enemy if health reached |
| 4 | Suffer enemy damage | Current player discards enough cards or loses |

---

## 6. Legal player actions

### 6.1 Normal single-card play

A player may play one non-Jester card.

Valid examples:

| Play | Attack total |
|---|---:|
| 7♥ | 7 |
| A♣ | 1 |
| defeated Q♠ from hand | 15 |

### 6.2 Animal Companion pairing

Animal Companions are Aces.

Rules:

| Rule | Implementation |
|---|---|
| Ace may be played alone | Legal |
| Ace may be paired with one other non-Jester card | Legal |
| Ace may be paired with another Ace | Legal |
| Ace cannot be added to a combo | Illegal |
| Ace + same suit card applies that suit power only once | Deduplicate suit powers |

Examples:

| Play | Attack total | Powers |
|---|---:|---|
| A♣ | 1 | Clubs |
| 8♦ + A♣ | 9 | Diamonds + Clubs |
| A♥ + A♦ | 2 | Hearts + Diamonds |
| A♠ + 5♠ | 6 | Spades once |

### 6.3 Combos

Instead of a single card, player may play 2-4 cards of the same number, if total value is <= 10.

Allowed combo shapes:

| Combo | Legal? |
|---|---|
| 2+2 | Yes |
| 3+3 | Yes |
| 4+4 | Yes |
| 5+5 | Yes |
| 6+6 | No, total > 10 |
| 2+2+2 | Yes |
| 3+3+3 | Yes |
| 4+4+4 | No, total > 10 |
| 2+2+2+2 | Yes |
| 3+3+3+3 | No, total > 10 |
| Any combo including Ace | No |

When a combo is played:

| Rule | Implementation |
|---|---|
| Attack value is total card value | sum values |
| All suits apply | apply each suit power once per suit present |
| Suit powers use total attack value | e.g. 3 cards of value 3 => power value 9 |
| Hearts + Diamonds together | resolve Hearts before Diamonds |

### 6.4 Jester play

Rules:

| Rule | Implementation |
|---|---|
| Jester is always played alone | Validate count == 1 |
| Attack value is 0 | No damage |
| Cancels current enemy immunity | `EnemyImmunityCancelled = true` |
| Skip Steps 3 and 4 | No damage dealt, no enemy attack |
| Jester player chooses next player | UI must request target player |
| Communication restriction changes | Digital game can expose this as optional table-talk prompt |

Special case:

| Case | Result |
|---|---|
| Jester played against Spades enemy | Spades played before the Jester now reduce attack |
| Jester played against Clubs enemy | Clubs played before the Jester do **not** retroactively double damage |

Implementation note: store raw spade shield total even while Spades immunity is active, but apply it only after immunity is cancelled or enemy is not Spades.

### 6.5 Yield

A player may yield instead of playing.

Rules:

| Rule | Implementation |
|---|---|
| Yield skips Steps 2 and 3 | Go directly to enemy attack |
| Cannot yield if every other player yielded on their last turn | In N-player game, cannot yield if `ConsecutiveYields >= playerCount - 1` |
| After any non-yield play | reset `ConsecutiveYields = 0` |
| After yield | increment `ConsecutiveYields++` |

Solo implication: because `playerCount - 1 == 0`, solo yield is never legal.

---

## 7. Enemy immunity

Each enemy is immune to suit powers matching its own suit.

Examples:

| Enemy | Immune power |
|---|---|
| Jack of Diamonds | Diamonds draw |
| Queen of Hearts | Hearts healing |
| King of Clubs | Clubs double damage |
| Jack of Spades | Spades shield |

Important:

| Rule | Implementation |
|---|---|
| Immunity blocks suit powers only | Attack value still counts as damage |
| Jester cancels immunity for the current enemy | Future matching suit powers apply |
| Spades can become active after Jester | Recompute effective shield |
| Clubs are not retroactive after Jester | Do not recompute previous damage |

Helper:

```csharp
bool IsSuitPowerActive(Suit suit, RegicideGameState state)
{
    if (suit == Suit.None) return false;
    if (state.EnemyImmunityCancelled) return true;
    return suit != state.CurrentEnemy.Card.Suit;
}
```

---

## 8. Suit power resolution

Given a legal play:

```csharp
class PlayedSet
{
    public List<Card> Cards { get; set; } = [];
    public int AttackValue { get; set; }
    public HashSet<Suit> Suits { get; set; } = [];
}
```

### 8.1 Hearts

Effect: heal cards from discard to the bottom of Tavern deck.

Algorithm:

1. Check Hearts power is active.
2. Shuffle discard pile.
3. Move up to `AttackValue` cards from discard pile to bottom of Tavern deck, face down.
4. If discard has fewer cards than `AttackValue`, move all available cards.

Open implementation question: the official text says count out cards equal to attack value. In a digital implementation, if fewer cards exist, the natural implementation is to move all available cards rather than fail.

### 8.2 Diamonds

Effect: draw cards.

Algorithm:

1. Check Diamonds power is active.
2. Starting with current player, proceed clockwise.
3. Draw one card at a time.
4. Skip players at max hand size.
5. Stop when:
   - drawn count == `AttackValue`, or
   - Tavern deck empty, or
   - all players are at max hand size.

No penalty for empty Tavern deck.

### 8.3 Clubs

Effect: damage dealt by this play is doubled.

Algorithm:

```csharp
int damage = AttackValue;

if (Suits.Contains(Suit.Clubs) && IsSuitPowerActive(Suit.Clubs, state))
{
    damage *= 2;
}
```

If a combo includes Clubs once or multiple clubs, the power is still applied once to the total attack value.

### 8.4 Spades

Effect: reduce current enemy attack.

Algorithm:

1. If played set includes Spades, add `AttackValue` to `SpadesShieldTotalPlayedAgainstEnemy`.
2. Effective shield is:
   - 0 if current enemy is Spades and immunity not cancelled.
   - otherwise `SpadesShieldTotalPlayedAgainstEnemy`.

```csharp
int EffectiveEnemyAttack(RegicideGameState state)
{
    var shieldActive =
        state.CurrentEnemy.Card.Suit != Suit.Spades ||
        state.EnemyImmunityCancelled;

    var shield = shieldActive ? state.SpadesShieldTotalPlayedAgainstEnemy : 0;
    return Math.Max(0, state.CurrentEnemy.BaseAttack - shield);
}
```

---

## 9. Damage and defeating enemies

After suit powers:

1. Deal damage.
2. Add it to `CurrentEnemy.DamageTaken`.
3. If damage taken >= health, enemy is defeated.

When enemy is defeated:

| Step | Action |
|---:|---|
| 1 | If exact damage equals health, place enemy face down on top of Tavern deck |
| 2 | Otherwise place enemy in discard pile |
| 3 | Place all cards played against this enemy into discard pile |
| 4 | Reveal next Castle card as current enemy |
| 5 | Defeating player skips enemy attack and immediately starts a new turn |

If the defeated enemy was the last King, players win.

Exact kill rule:

```csharp
if (enemy.DamageTaken == enemy.Health)
    TavernDeck.PlaceOnTop(enemy.Card);
else
    DiscardPile.Add(enemy.Card);
```

Defeated royals entering player hands later:

| Royal in hand | Play/discard value | Suit power |
|---|---:|---|
| Jack | 10 | Normal suit power |
| Queen | 15 | Normal suit power |
| King | 20 | Normal suit power |

---

## 10. Enemy attack / suffering damage

If enemy is not defeated, it attacks current player.

Algorithm:

1. Compute effective enemy attack:
   `BaseAttack - active Spades shield`, minimum 0.
2. Current player must discard cards one at a time to discard pile.
3. Total discarded value must be >= effective attack.
4. If player cannot reach that value with their entire hand, all players lose.
5. Empty hand after successful damage is allowed.
6. Pass turn clockwise to next player.

Damage discard values use the same values as normal card values:

| Card | Damage soak value |
|---|---:|
| A | 1 |
| 2-10 | face value |
| J | 10 |
| Q | 15 |
| K | 20 |
| Jester | 0 |

Implementation validation:

```csharp
bool CanSatisfyDamage(PlayerState player, int damage)
{
    return player.Hand.Sum(CardValue) >= damage;
}
```

UI should let player select discard cards. Auto-discard should be optional, because overpay choices matter.

---

## 11. Solo mode

Solo uses special Jester rules.

Setup:

| Rule |
|---|
| Use one player |
| Hand limit 8 |
| Do not put Jesters into Tavern deck |
| Place 2 Jesters aside as solo-use powers |

Solo Jester power:

| Rule | Implementation |
|---|---|
| May be used twice per game | Track remaining solo Jesters |
| Discard entire hand | Move hand to discard |
| Refill to 8 cards | Draw from Tavern deck |
| Does not count as Diamonds draw | Do not interact with enemy Diamond immunity |
| Does not cancel enemy immunity | `EnemyImmunityCancelled` unchanged |
| Can be used at start of Step 1 | before playing |
| Can be used at start of Step 4 | before taking damage |

Victory grade:

| Solo Jesters used | Victory |
|---:|---|
| 0 | Gold |
| 1 | Silver |
| 2 | Bronze |

---

## 12. Validation summary

### 12.1 Legal play validator

A play is legal if one of these is true:

| Type | Conditions |
|---|---|
| Single normal card | exactly one card, not Jester |
| Jester | exactly one card, rank Jester |
| Animal pair | exactly two cards, at least one Ace, neither Jester |
| Combo | 2-4 cards, no Aces/Jesters, all same rank, total <= 10 |

Pseudo-code:

```csharp
bool IsLegalPlay(List<Card> cards)
{
    if (cards.Count == 0) return false;

    if (cards.Count == 1)
        return true; // any single card, including Jester

    if (cards.Any(c => c.Rank == Rank.Jester))
        return false;

    var hasAce = cards.Any(c => c.Rank == Rank.Ace);

    if (hasAce)
        return cards.Count == 2;

    if (cards.Count is < 2 or > 4)
        return false;

    var sameRank = cards.Select(c => c.Rank).Distinct().Count() == 1;
    var total = cards.Sum(CardValue);

    return sameRank && total <= 10;
}
```

### 12.2 Yield validator

```csharp
bool CanYield(RegicideGameState state)
{
    return state.Players.Count > 1 &&
           state.ConsecutiveYields < state.Players.Count - 1;
}
```

### 12.3 Cannot act detection

At start of Step 1:

```csharp
bool HasAnyLegalPlay(PlayerState player)
{
    // Single-card play is legal for any card in hand.
    return player.Hand.Count > 0;
}

bool IsPlayerStuck(RegicideGameState state, PlayerState player)
{
    return !HasAnyLegalPlay(player) && !CanYield(state);
}
```

Because any single card is legal, being unable to act mainly means: empty hand and cannot yield.

---

## 13. Suggested state machine

```csharp
enum TurnPhase
{
    AwaitingAction,
    ResolvingSuitPowers,
    ResolvingDamage,
    AwaitingDamageDiscard,
    AwaitingJesterNextPlayer,
    GameOver
}
```

Main reducer style:

```csharp
GameState ApplyPlayerAction(GameState state, PlayerAction action)
{
    return action switch
    {
        PlayCardsAction play => ResolvePlay(state, play.Cards),
        YieldAction => ResolveYield(state),
        UseSoloJesterAction => ResolveSoloJester(state),
        SelectDamageDiscardAction discard => ResolveDamageDiscard(state, discard.Cards),
        SelectNextPlayerAction next => ResolveJesterNextPlayer(state, next.PlayerIndex),
        _ => throw new InvalidOperationException()
    };
}
```

Recommended architecture:

| Layer | Responsibility |
|---|---|
| Domain engine | Pure rules, validation, state transition |
| Persistence | Save/load game state |
| UI | Show legal actions, collect choices |
| Animation layer | Reacts to state diffs, not rules |
| Multiplayer/sync, optional | Broadcast actions or full state snapshots |

---

## 14. Android UI implementation notes

Recommended screens/components:

| Screen/component | Purpose |
|---|---|
| Main game board | Current enemy, damage, shield, Tavern count, discard count |
| Player hand | Select cards to play/discard |
| Action bar | Play, Yield, Use Solo Jester |
| Enemy panel | Suit, attack, health, immunity status |
| Played cards area | Cards played against current enemy |
| Draw/discard log | Explain automatic suit power effects |
| Jester next-player modal | Choose who acts next |
| Damage discard modal | Select cards to satisfy attack |

UX rules:

| Requirement | Reason |
|---|---|
| Always show effective enemy attack | Spades shield can be confusing |
| Show blocked suit powers | Enemy immunity is central |
| Preview damage before confirming play | Clubs/damage interactions matter |
| Preview draw/heal counts | Hearts/Diamonds can be non-obvious |
| Keep rule log | Helps debug and teaches game |

---

## 15. Edge cases checklist

| Case | Expected result |
|---|---|
| Tavern deck empty during Diamonds | Draw as many as possible; no penalty |
| All players at max hand size during Diamonds | Stop drawing |
| Discard pile has fewer cards than Hearts value | Heal available cards only |
| Enemy attack reduced below 0 | Clamp to 0 |
| Exact enemy defeat | Enemy goes on top of Tavern deck |
| Overkill enemy defeat | Enemy goes to discard |
| Defeating last King | Win immediately |
| Jester against Spades enemy after prior Spades | Prior Spades now reduce attack |
| Jester against Clubs enemy after prior Clubs | Prior Clubs do not retroactively double |
| Current player empty hand after damage | Allowed |
| Current player empty hand at start of turn and cannot yield | Lose |
| Ace + same suit card | Apply suit power once |
| Combo with Ace | Illegal |
| Jester paired with any card | Illegal |
| Solo Jester | Does not cancel immunity |

---

## 16. Minimal test suite

### Setup tests

| Test | Expected |
|---|---|
| 1-player setup | 0 Jesters in Tavern, 2 solo Jesters aside, hand max 8 |
| 2-player setup | 0 Jesters, hand max 7 |
| 3-player setup | 1 Jester, hand max 6 |
| 4-player setup | 2 Jesters, hand max 5 |
| Castle deck order | 4 Jacks, then 4 Queens, then 4 Kings |

### Play validation tests

| Play | Expected |
|---|---|
| single 10♣ | legal |
| Jester alone | legal |
| Jester + 2♠ | illegal |
| A♥ + 8♦ | legal |
| A♥ + A♦ | legal |
| A♥ + 2♣ + 2♦ | illegal |
| 5♣ + 5♦ | legal |
| 6♣ + 6♦ | illegal |
| 3♣ + 3♦ + 3♠ | legal |
| 4♣ + 4♦ + 4♠ | illegal |

### Suit tests

| Scenario | Expected |
|---|---|
| 8♣ vs non-Clubs enemy | 16 damage |
| 8♣ vs Clubs enemy | 8 damage |
| Jester then 8♣ vs Clubs enemy | 16 damage |
| 8♣ vs Clubs enemy, then Jester | previous damage remains 8 |
| 7♠ vs non-Spades enemy | shield +7 |
| 7♠ vs Spades enemy | shield stored but inactive |
| 7♠ vs Spades enemy, then Jester | shield becomes active |
| Hearts + Diamonds same play | Hearts resolves before Diamonds |

### Defeat tests

| Scenario | Expected |
|---|---|
| Jack health 20, damage exactly 20 | Jack goes top of Tavern |
| Jack health 20, damage 21 | Jack goes discard |
| Last King defeated | game status = Win |
| Enemy defeated | no Step 4 attack |

### Damage tests

| Scenario | Expected |
|---|---|
| Enemy attack 10, shield 3 | player must discard >= 7 |
| Enemy attack 10, shield 15 | player discards 0 |
| Player total hand value below damage | lose |
| Player discards over damage | legal |

---

## 17. Open implementation decisions

These are not fully specified by the rules and should be decided consistently:

| Topic | Suggested choice |
|---|---|
| Hearts with fewer discard cards than attack value | Heal all available cards |
| Auto-selection for damage discard | Do not auto-select by default |
| Randomness reproducibility | Store RNG seed for replay/debug |
| Undo | Allow local undo before confirming action only |
| Save model | Save full game state after every confirmed action |
| Animation timing | Do not encode rules in animation callbacks |

---

## 18. Implementation priority

| Priority | Feature |
|---:|---|
| 1 | Card/deck model |
| 2 | Setup for 1-4 players |
| 3 | Legal play validation |
| 4 | Turn state machine |
| 5 | Suit powers |
| 6 | Enemy damage/defeat |
| 7 | Enemy attack/discard |
| 8 | Jester |
| 9 | Solo mode |
| 10 | Save/load |
| 11 | Rule log |
| 12 | Polish/animations |
