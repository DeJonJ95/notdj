import { computeLayout } from './layout.js';
import { drawHeader } from './header.js';
import { drawDeck } from './decks.js';
import { drawMixer } from './mixer.js';
import { theme } from './theme.js';

export class Renderer {
  constructor(canvas, getState) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.getState = getState;
    this.regions = [];
    this.running = false;
    this.dpr = window.devicePixelRatio || 1;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.layout = computeLayout(w, h);
  }

  start() {
    if (this.running) return;
    this.running = true;
    const tick = () => {
      if (!this.running) return;
      this.draw();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  getRegions = () => this.regions;

  draw() {
    const { ctx, layout } = this;
    const state = this.getState();
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, layout.width, layout.height);

    this.regions = [];
    const pressed = state.ui?.pressed || null;
    const pressing = state.ui?.pressing || null;
    drawHeader(ctx, layout.header, state, this.regions);
    drawDeck(ctx, layout.deckA, 'A', state, this.regions, pressed, pressing);
    drawDeck(ctx, layout.deckB, 'B', state, this.regions, pressed, pressing);
    drawMixer(ctx, layout.mixer, state.mixer, state.decks, this.regions);
  }
}
