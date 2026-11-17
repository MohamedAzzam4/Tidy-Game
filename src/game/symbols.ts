/**
 * Tidy Tapes — canvas path drawing for the 8 printed symbols.
 * Used by tape faces, spines, rack headers, repair overlay and UI chips,
 * so a symbol always looks the same everywhere (never rely on color alone).
 */

export interface SymbolStyle {
  fill: string;     // main fill color
  stroke?: string;  // outline color
  lineW?: number;
}

/** Draw `name` centered in a box of size `s` at (cx, cy) on a 2D context. */
export function drawSymbol(
  ctx: CanvasRenderingContext2D,
  name: string,
  cx: number,
  cy: number,
  s: number,
  style: SymbolStyle,
): void {
  const r = s / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = style.fill;
  if (style.stroke) { ctx.strokeStyle = style.stroke; ctx.lineWidth = style.lineW ?? s * 0.06; }
  const path = () => { ctx.beginPath(); };

  switch (name) {
    case 'star': {
      path();
      const outer = r * 0.95, inner = r * 0.42;
      for (let i = 0; i < 10; i++) {
        const ang = (Math.PI / 5) * i - Math.PI / 2;
        const rad = i % 2 === 0 ? outer : inner;
        const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fill();
      if (style.stroke) ctx.stroke();
      break;
    }
    case 'heart': {
      path();
      const w = r * 0.98, h = r * 0.9;
      ctx.moveTo(0, h);
      ctx.bezierCurveTo(-w * 1.4, h * 0.25, -w * 0.85, -h, 0, -h * 0.42);
      ctx.bezierCurveTo(w * 0.85, -h, w * 1.4, h * 0.25, 0, h);
      ctx.closePath(); ctx.fill();
      if (style.stroke) ctx.stroke();
      break;
    }
    case 'moon': {
      path();
      const outer = r * 0.92;
      ctx.arc(0, 0, outer, -Math.PI * 0.45, Math.PI * 0.62, false);
      ctx.arc(outer * 0.42, -outer * 0.28, outer * 0.78, Math.PI * 0.52, -Math.PI * 0.35, true);
      ctx.closePath(); ctx.fill();
      if (style.stroke) ctx.stroke();
      break;
    }
    case 'sun': {
      path();
      ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      if (style.stroke) ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const ang = (Math.PI / 4) * i;
        path();
        const x0 = Math.cos(ang) * r * 0.72, y0 = Math.sin(ang) * r * 0.72;
        const x1 = Math.cos(ang) * r * 0.98, y1 = Math.sin(ang) * r * 0.98;
        ctx.lineWidth = r * 0.16;
        ctx.lineCap = 'round';
        ctx.strokeStyle = style.fill;
        ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
      break;
    }
    case 'note': {
      // eighth note: head + stem + flag
      path();
      ctx.ellipse(-r * 0.28, r * 0.55, r * 0.42, r * 0.3, -0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = style.fill;
      ctx.fillRect(-r * 0.05, -r * 0.85, r * 0.16, r * 1.4);
      path();
      ctx.moveTo(r * 0.11, -r * 0.85);
      ctx.quadraticCurveTo(r * 0.75, -r * 0.45, r * 0.45, r * 0.12);
      ctx.quadraticCurveTo(r * 0.42, -r * 0.25, r * 0.11, -r * 0.5);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'flower': {
      for (let i = 0; i < 6; i++) {
        const ang = (Math.PI / 3) * i;
        path();
        ctx.ellipse(Math.cos(ang) * r * 0.52, Math.sin(ang) * r * 0.52, r * 0.36, r * 0.2, ang, 0, Math.PI * 2);
        ctx.fill();
      }
      path();
      ctx.arc(0, 0, r * 0.26, 0, Math.PI * 2);
      ctx.fillStyle = style.stroke ?? '#fff';
      ctx.fill();
      ctx.fillStyle = style.fill;
      break;
    }
    case 'bolt': {
      path();
      const w = r * 0.62, h = r * 0.98;
      ctx.moveTo(w * 0.5, -h);
      ctx.lineTo(-w * 0.5, h * 0.12);
      ctx.lineTo(-w * 0.08, h * 0.12);
      ctx.lineTo(-w * 0.34, h);
      ctx.lineTo(w * 0.5, -h * 0.12);
      ctx.lineTo(w * 0.06, -h * 0.12);
      ctx.closePath(); ctx.fill();
      if (style.stroke) ctx.stroke();
      break;
    }
    case 'rainbow': {
      ctx.lineCap = 'round';
      const arcs = [r * 0.95, r * 0.72, r * 0.5];
      const cols = [style.fill, style.stroke ?? '#fff', style.fill];
      for (let i = 0; i < 3; i++) {
        path();
        ctx.strokeStyle = cols[i];
        ctx.lineWidth = r * 0.14;
        ctx.beginPath();
        ctx.arc(0, r * 0.55, arcs[i], Math.PI, 0, false);
        ctx.stroke();
      }
      ctx.strokeStyle = style.fill;
      break;
    }
    default: {
      path();
      ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Small pixel-accurate label for a symbol drawn as its name (debug/legend). */
export const SYMBOL_NAMES: Record<string, string> = {
  star: 'star', heart: 'heart', moon: 'moon', sun: 'sun',
  note: 'note', flower: 'flower', bolt: 'bolt', rainbow: 'rainbow',
};
