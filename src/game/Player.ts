import { BallGroup } from '../utils/constants';
import { t } from '../utils/i18n';

export class Player {
  readonly index: 0 | 1;
  group: BallGroup.SOLID | BallGroup.STRIPE | null = null;

  constructor(index: 0 | 1) {
    this.index = index;
  }

  /** Localized display name. */
  get name(): string {
    return t(this.index === 0 ? 'player.1' : 'player.2');
  }

  get groupLabel(): string {
    if (this.group === BallGroup.SOLID) return t('group.solids');
    if (this.group === BallGroup.STRIPE) return t('group.stripes');
    return '—';
  }
}
