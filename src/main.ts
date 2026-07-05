import './style.css';
import { GameManager } from './managers/GameManager';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
new GameManager(canvas);

// Prevent page scroll/zoom gestures interfering with the game
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
