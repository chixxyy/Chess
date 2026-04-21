/**
 * useSound — 象棋音效合成器（純 Web Audio API，無需音頻文件）
 */
export function useSound() {
  let ctx: AudioContext | null = null;

  function getCtx(): AudioContext {
    if (!ctx) ctx = new AudioContext();
    // 某些瀏覽器需要用戶互動後才能播放
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /**
   * 落子音：木質清脆 "噔" 聲
   */
  function playMove() {
    const ac = getCtx();
    const now = ac.currentTime;

    // 白噪音衝擊層（模擬木頭碰撞）
    const bufferSize = ac.sampleRate * 0.08;
    const noiseBuffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = ac.createBufferSource();
    noise.buffer = noiseBuffer;

    const noiseFilter = ac.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1800;
    noiseFilter.Q.value = 0.8;

    const noiseGain = ac.createGain();
    noiseGain.gain.setValueAtTime(0.35, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ac.destination);
    noise.start(now);

    // 音調層（低頻共鳴）
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.12);

    const oscGain = ac.createGain();
    oscGain.gain.setValueAtTime(0.2, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(oscGain);
    oscGain.connect(ac.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  /**
   * 吃子音：更沉重的撞擊聲
   */
  function playCapture() {
    const ac = getCtx();
    const now = ac.currentTime;

    // 重擊噪音
    const bufferSize = ac.sampleRate * 0.12;
    const noiseBuffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = ac.createBufferSource();
    noise.buffer = noiseBuffer;

    const noiseFilter = ac.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 900;

    const noiseGain = ac.createGain();
    noiseGain.gain.setValueAtTime(0.6, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ac.destination);
    noise.start(now);

    // 低沉共鳴
    const osc = ac.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.18);

    const oscGain = ac.createGain();
    oscGain.gain.setValueAtTime(0.3, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(oscGain);
    oscGain.connect(ac.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  /**
   * 將軍音：低頻鑼鼓聲（兩擊，不刺耳）
   */
  function playCheck() {
    const ac = getCtx();

    [0, 0.22].forEach((delay) => {
      const now = ac.currentTime + delay;

      // 主體：低頻正弦，模擬鑼聲共鳴
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.4);

      const gain = ac.createGain();
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(now);
      osc.stop(now + 0.4);

      // 撞擊感：短促低頻噪音
      const bufferSize = ac.sampleRate * 0.04;
      const noiseBuffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

      const noiseSource = ac.createBufferSource();
      noiseSource.buffer = noiseBuffer;

      const noiseFilter = ac.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.value = 400;

      const noiseGain = ac.createGain();
      noiseGain.gain.setValueAtTime(0.4, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ac.destination);
      noiseSource.start(now);
    });
  }

  /**
   * 勝利音：上揚旋律
   */
  function playWin() {
    const ac = getCtx();
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const now = ac.currentTime + i * 0.15;
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const gain = ac.createGain();
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    });
  }

  return { playMove, playCapture, playCheck, playWin };
}
