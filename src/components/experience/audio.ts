/**
 * Generative ocean ambience (Web Audio, no files):
 * filtered brown noise swells like surf, under a slow, quiet low pad.
 */
export class OceanAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  start() {
    if (this.ctx) return this.setOn(true);
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    const master = (this.master = ctx.createGain());
    master.gain.value = 0;
    master.connect(ctx.destination);

    // brown noise buffer
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf; noise.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 420; lp.Q.value = 0.6;
    const surf = ctx.createGain(); surf.gain.value = 0.5;
    noise.connect(lp).connect(surf).connect(master);

    // slow swell on the surf (LFOs on filter + gain)
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 260;
    lfo.connect(lfoAmt).connect(lp.frequency);
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.07;
    const lfo2Amt = ctx.createGain(); lfo2Amt.gain.value = 0.3;
    lfo2.connect(lfo2Amt).connect(surf.gain);

    // deep pad
    const pad = ctx.createGain(); pad.gain.value = 0.05;
    const padLp = ctx.createBiquadFilter(); padLp.type = "lowpass"; padLp.frequency.value = 600;
    [55, 82.41, 110.0, 164.81].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? "triangle" : "sine";
      o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 8;
      o.connect(padLp); o.start();
    });
    padLp.connect(pad).connect(master);

    noise.start(); lfo.start(); lfo2.start();
    this.setOn(true);
  }

  setOn(on: boolean) {
    if (!this.ctx || !this.master) return;
    if (on && this.ctx.state === "suspended") void this.ctx.resume();
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(on ? 0.32 : 0, now, on ? 0.9 : 0.25);
  }

  dispose() { void this.ctx?.close(); this.ctx = null; }
}
