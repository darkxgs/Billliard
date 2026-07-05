// All dimensions in meters — 9-foot tournament table.
export const TABLE = {
  PLAY_W: 2.54, // x — long axis
  PLAY_H: 1.27, // z — short axis
  CUSHION_H: 0.042,
  CUSHION_W: 0.05,
  FRAME_W: 0.14,
  FRAME_H: 0.09,
  POCKET_R_CORNER: 0.068,
  POCKET_R_SIDE: 0.06,
  LEG_H: 0.78,
};

export const BALL = {
  R: 0.0286,
  MASS: 0.17,
};

export const PHYS = {
  GRAVITY: 9.81,
  MU_SLIDE: 0.21, // cloth sliding friction
  MU_ROLL: 0.011, // rolling resistance
  MU_SPIN: 0.022, // vertical-axis spin decay
  BALL_RESTITUTION: 0.94,
  CUSHION_RESTITUTION: 0.72,
  CUSHION_FRICTION: 0.22,
  STOP_SPEED: 0.008,
  STOP_SPIN: 0.06,
  SUBSTEPS: 4,
  MAX_SHOT_SPEED: 8.2, // m/s at full power (break-level)
  MIN_SHOT_SPEED: 0.55,
};

export enum BallGroup {
  CUE = 'cue',
  SOLID = 'solid',
  STRIPE = 'stripe',
  EIGHT = 'eight',
}

export const BALL_COLORS: Record<number, string> = {
  1: '#f2c437', 2: '#2a56c6', 3: '#d0312d', 4: '#5b2a86',
  5: '#e6702e', 6: '#1d7a4f', 7: '#8c2332', 8: '#131316',
  9: '#f2c437', 10: '#2a56c6', 11: '#d0312d', 12: '#5b2a86',
  13: '#e6702e', 14: '#1d7a4f', 15: '#8c2332',
};

export enum GameState {
  MENU = 'menu',
  SETTINGS = 'settings',
  PLAYING = 'playing',
  PAUSED = 'paused',
  GAME_OVER = 'gameover',
}

export enum ShotPhase {
  AIM = 'aim',
  CHARGING = 'charging',
  SIMULATING = 'simulating',
  BALL_IN_HAND = 'ballInHand',
  PLACING_BREAK = 'placingBreak',
}
