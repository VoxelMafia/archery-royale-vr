import * as THREE from 'three';

/**
 * Diegetic status panel bolted to the lower bow limb: readable in-headset,
 * and it tilts with the bow so it doubles as a cant indicator.
 */
export class BowHud {
  constructor(bowObject) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 256;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1), mat);
    this.mesh.position.set(0, -0.42, 0.06);
    this.mesh.rotation.x = -0.25;
    bowObject.add(this.mesh);

    this.state = {
      bow: 'left', draw: 'right', ratio: 0, score: 0, last: '', claim: 0, arrows: 0,
      grab: false, fetch: false, arrowState: 'none', air: false, flaps: 0, glide: false,
    };
    this._dirty = true;
  }

  set(partial) {
    Object.assign(this.state, partial);
    this._dirty = true;
  }

  render() {
    if (!this._dirty) return;
    this._dirty = false;
    const c = this.ctx, s = this.state;
    const W = this.canvas.width, H = this.canvas.height;

    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(14,16,20,0.82)';
    roundRect(c, 4, 4, W - 8, H - 8, 22);
    c.fill();
    c.strokeStyle = 'rgba(217,178,76,0.55)';
    c.lineWidth = 3;
    c.stroke();

    c.fillStyle = '#d9b24c';
    c.font = 'bold 34px Georgia, serif';
    c.fillText('ARCHERY ROYALE', 28, 50);

    c.font = '26px Georgia, serif';
    c.fillStyle = '#cfd4dc';
    c.fillText(`bow: ${s.bow.toUpperCase()}   string: ${s.draw.toUpperCase()}`, 28, 96);

    // Draw bar
    c.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(c, 28, 118, W - 56, 26, 13); c.fill();
    const g = c.createLinearGradient(28, 0, W - 28, 0);
    g.addColorStop(0, '#7a9a5b'); g.addColorStop(0.7, '#d9b24c'); g.addColorStop(1, '#c0392b');
    c.fillStyle = g;
    roundRect(c, 28, 118, Math.max(2, (W - 56) * s.ratio), 26, 13); c.fill();

    c.fillStyle = '#9aa3ae';
    c.font = '22px Georgia, serif';
    c.fillText(`draw ${Math.round(s.ratio * 100)}%`, 28, 176);
    c.fillText(`score ${s.score}`, 200, 176);
    c.fillText(`shafts ${s.arrows}`, 340, 176);

    if (s.claim > 0.01) {
      c.fillStyle = '#d9b24c';
      c.fillText(`switching hands... ${Math.round(s.claim * 100)}%`, 28, 216);
    } else if (s.glide) {
      c.fillStyle = '#9ec7e8';
      c.fillText('slow fall', 28, 216);
    } else if (s.air) {
      c.fillStyle = '#9ec7e8';
      c.fillText(s.flaps > 1 ? 'airborne - second flap spent' : 'airborne - one flap left', 28, 216);
    } else if (s.fetch) {
      c.fillStyle = '#d9b24c';
      c.fillText('squeeze to draw a shaft', 28, 216);
    } else if (s.arrowState === 'none') {
      c.fillStyle = '#9aa3ae';
      c.fillText('empty - reach behind your shoulder', 28, 216);
    } else if (s.arrowState === 'hand') {
      c.fillStyle = '#d9b24c';
      c.fillText('bring it to the string', 28, 216);
    } else if (s.grab) {
      c.fillStyle = '#d9b24c';
      c.fillText('take the nock - squeeze to draw', 28, 216);
    } else if (s.last) {
      c.fillStyle = '#cfd4dc';
      c.fillText(s.last, 28, 216);
    }
    this.tex.needsUpdate = true;
  }
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
