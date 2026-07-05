import { Ball } from './Ball';
import { Player } from './Player';
import { BallGroup } from '../utils/constants';

export interface ShotOutcome {
  /** Human-readable events to show as banners, in order. */
  banners: Array<{ text: string; foul?: boolean }>;
  foul: boolean;
  ballInHand: boolean;
  switchTurn: boolean;
  gameOver: boolean;
  /** Winner index if gameOver. */
  winner?: 0 | 1;
  /** Newly assigned groups this shot (for the big announcement). */
  assignedGroup?: BallGroup.SOLID | BallGroup.STRIPE;
  respotEight: boolean;
}

/**
 * Official-style 8-ball rules: break, open table, group assignment,
 * fouls (scratch, wrong first contact, no rail after contact),
 * early/foul 8-ball loss, legal 8-ball win.
 */
export class RuleEngine {
  players: [Player, Player] = [new Player(0), new Player(1)];
  currentIndex: 0 | 1 = 0;
  openTable = true;
  isBreakShot = true;

  // Per-shot tracking
  private firstContact: Ball | null = null;
  private pocketed: Ball[] = [];
  private cueScratched = false;
  private railAfterContact = false;
  private anyContact = false;

  get current(): Player { return this.players[this.currentIndex]; }
  get opponent(): Player { return this.players[this.currentIndex === 0 ? 1 : 0]; }

  beginShot(): void {
    this.firstContact = null;
    this.pocketed = [];
    this.cueScratched = false;
    this.railAfterContact = false;
    this.anyContact = false;
  }

  noteBallContact(a: Ball, b: Ball): void {
    this.anyContact = true;
    if (!this.firstContact) {
      if (a.id === 0) this.firstContact = b;
      else if (b.id === 0) this.firstContact = a;
    }
  }

  noteCushion(): void {
    if (this.anyContact || this.isBreakShot) this.railAfterContact = true;
  }

  notePocket(ball: Ball): void {
    if (ball.id === 0) this.cueScratched = true;
    else this.pocketed.push(ball);
  }

  private groupOf(ball: Ball): BallGroup {
    return ball.group;
  }

  private remaining(group: BallGroup, balls: Ball[]): number {
    return balls.filter(b => b.group === group && b.active).length;
  }

  /** Called once all balls have stopped. */
  evaluate(balls: Ball[]): ShotOutcome {
    const out: ShotOutcome = {
      banners: [],
      foul: false,
      ballInHand: false,
      switchTurn: true,
      gameOver: false,
      respotEight: false,
    };
    const me = this.current;
    const eightPocketed = this.pocketed.some(b => b.id === 8);

    // ---------- Break shot ----------
    if (this.isBreakShot) {
      this.isBreakShot = false;
      if (eightPocketed) {
        // 8 on the break: re-spot it, breaker continues (house-rule friendly)
        out.respotEight = true;
        out.banners.push({ text: 'banner.respot' });
      }
      if (this.cueScratched) {
        out.foul = true;
        out.ballInHand = true;
        out.banners.push({ text: 'banner.scratch', foul: true });
        out.switchTurn = true;
      } else if (this.pocketed.length > 0) {
        out.switchTurn = false;
        out.banners.push({ text: 'banner.greatBreak' });
      }
      return out; // table stays open after the break
    }

    // ---------- Fouls ----------
    let foulReason: string | null = null;

    if (this.cueScratched) {
      foulReason = 'banner.scratch';
    } else if (!this.firstContact) {
      foulReason = 'banner.noBallHit';
    } else {
      const fcGroup = this.groupOf(this.firstContact);
      if (!this.openTable && me.group) {
        const mustClear = this.remaining(me.group, balls) > 0;
        const legalFirst = mustClear ? fcGroup === me.group : fcGroup === BallGroup.EIGHT;
        if (!legalFirst) foulReason = 'banner.wrongBall';
      } else if (this.openTable && fcGroup === BallGroup.EIGHT) {
        foulReason = 'banner.eightFirst';
      }
      if (!foulReason && this.pocketed.length === 0 && !this.railAfterContact) {
        foulReason = 'banner.noRail';
      }
    }

    // ---------- 8-ball resolution ----------
    if (eightPocketed) {
      out.gameOver = true;
      const clearedGroup = me.group && this.remaining(me.group, balls) === 0;
      if (!me.group || !clearedGroup || this.cueScratched || foulReason) {
        // Early or foul 8-ball → current player loses
        out.winner = this.opponent.index;
        out.banners.push({ text: 'banner.eightFoul', foul: true });
      } else {
        out.winner = me.index;
      }
      return out;
    }

    if (foulReason) {
      out.foul = true;
      out.ballInHand = true;
      out.switchTurn = true;
      out.banners.push({ text: foulReason, foul: true });
      return out;
    }

    // ---------- Group assignment on open table ----------
    const solidsIn = this.pocketed.filter(b => b.group === BallGroup.SOLID).length;
    const stripesIn = this.pocketed.filter(b => b.group === BallGroup.STRIPE).length;

    if (this.openTable && (solidsIn > 0 || stripesIn > 0)) {
      let assign: BallGroup.SOLID | BallGroup.STRIPE;
      if (solidsIn > 0 && stripesIn > 0) {
        // Both pocketed — first pocketed ball decides
        assign = this.pocketed.find(b => b.group !== BallGroup.EIGHT)!.group as BallGroup.SOLID | BallGroup.STRIPE;
      } else {
        assign = solidsIn > 0 ? BallGroup.SOLID : BallGroup.STRIPE;
      }
      me.group = assign;
      this.opponent.group = assign === BallGroup.SOLID ? BallGroup.STRIPE : BallGroup.SOLID;
      this.openTable = false;
      out.assignedGroup = assign;
    }

    // ---------- Continue or pass ----------
    const pottedOwn = me.group !== null && this.pocketed.some(b => b.group === me.group);
    out.switchTurn = !pottedOwn;
    if (pottedOwn && !out.assignedGroup) {
      out.banners.push({ text: 'banner.niceShot' });
    }
    return out;
  }

  passTurn(): void {
    this.currentIndex = this.currentIndex === 0 ? 1 : 0;
  }

  reset(): void {
    this.players = [new Player(0), new Player(1)];
    this.currentIndex = 0;
    this.openTable = true;
    this.isBreakShot = true;
    this.beginShot();
  }
}
