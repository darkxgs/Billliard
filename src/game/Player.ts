import { BallGroup } from '../utils/constants';

export class Player {
  readonly index: 0 | 1;
  readonly name: string;
  group: BallGroup.SOLID | BallGroup.STRIPE | null = null;

  constructor(index: 0 | 1) {
    this.index = index;
    this.name = `Player ${index + 1}`;
  }

  get groupLabel(): string {
    if (this.group === BallGroup.SOLID) return 'SOLIDS';
    if (this.group === BallGroup.STRIPE) return 'STRIPES';
    return '—';
  }
}
