import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { AudioRecordingEngine, parseDuration, RECORDING_BITRATES } from '../audio-recording-engine.mjs';

const root = new URL('../', import.meta.url);

test('duration parser supports mm:ss, hh:mm:ss, and seconds', () => {
  assert.equal(parseDuration('03:42'), 222);
  assert.equal(parseDuration('1:02:03'), 3723);
  assert.equal(parseDuration('90'), 90);
  assert.ok(Number.isNaN(parseDuration('03:99')));
});

test('worker encodes synthetic stereo audio to each supported MP3 bitrate', async () => {
  for (const bitrate of RECORDING_BITRATES) {
    const output = await encodeSyntheticTone(bitrate);
    assert.equal(output.bitrate, bitrate);
    assert.equal(output.blob.type, 'audio/mpeg');
    const bytes = new Uint8Array(await output.blob.arrayBuffer());
    assert.ok(bytes.length > 1000);
    assert.equal(bytes[0], 0xff);
    assert.equal(bytes[1] & 0xe0, 0xe0);
    const bitrateIndex = (bytes[2] >> 4) & 0x0f;
    const mpeg1Layer3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
    assert.equal(mpeg1Layer3[bitrateIndex], bitrate);
  }
});

test('recording starts at zero, gates paused audio, disables Auto Next, and caches the finished MP3', async () => {
  const states = [];
  const saved = [];
  const audio = fakeAudio(8);
  const autoNext = { checked: true, disabled: false };
  const engine = new AudioRecordingEngine({
    windowRef: fakeWindow(),
    onState: (state) => states.push(state),
    onReady: async (recording) => saved.push(recording)
  });
  await engine.start({ audio, trackId: 'drive-track-01', folderId: 'drive-track-01', duration: 8, trackName: 'Track 01', autoNextCheckbox: autoNext, captureConsent: true, bitrate: 256 });
  assert.equal(audio.currentTime, 0);
  assert.equal(audio.paused, false);
  assert.equal(autoNext.checked, false);
  assert.equal(autoNext.disabled, true);
  audio.emit('waiting');
  assert.equal(engine.captureNode.port.messages.at(-1).type, 'pause');
  audio.emit('playing');
  assert.equal(engine.captureNode.port.messages.at(-1).type, 'record');
  audio.currentTime = 2;
  await engine.tick();
  await engine.stop('manual');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].folderId, 'drive-track-01');
  assert.equal(saved[0].duration, 2);
  assert.equal(saved[0].bitrate, 256);
  assert.equal(autoNext.checked, true);
  assert.equal(autoNext.disabled, false);
  assert.ok(states.some((state) => state.state === 'encoding'));
  assert.ok(states.some((state) => state.state === 'ready'));
});

test('duration boundary stops recording and restores Auto Next', async () => {
  let saved = 0;
  const audio = fakeAudio(3);
  const autoNext = { checked: true, disabled: false };
  const engine = new AudioRecordingEngine({ windowRef: fakeWindow(), onReady: async () => { saved++; } });
  await engine.start({ audio, trackId: 'track', duration: 3, autoNextCheckbox: autoNext, captureConsent: true });
  audio.currentTime = 3;
  engine.tick();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(saved, 1);
  assert.equal(engine.session, null);
  assert.equal(autoNext.checked, true);
});

test('cancel discards recording and track changes are not attributed to a new track', async () => {
  let saved = 0;
  const audio = fakeAudio(10);
  const engine = new AudioRecordingEngine({ windowRef: fakeWindow(), onReady: async () => { saved++; } });
  let current = true;
  await engine.start({ audio, trackId: 'track-a', duration: 10, captureConsent: true, trackIsCurrent: () => current });
  current = false;
  engine.tick();
  assert.equal(engine.session, null);
  assert.equal(saved, 0);
});

test('restricted and non-blob sources are rejected without capture', async () => {
  const engine = new AudioRecordingEngine({ windowRef: fakeWindow() });
  const audio = fakeAudio(30);
  audio.currentSrc = 'https://suno.com/embed/private';
  audio.src = audio.currentSrc;
  await assert.rejects(engine.start({ audio, trackId: 't', duration: 30, captureConsent: true }), /authorized MP3/);
});

async function encodeSyntheticTone(bitrate) {
  const sandbox = { Blob, Uint8Array, Int16Array, Float32Array, Math, console };
  sandbox.self = sandbox;
  sandbox.postMessage = (message) => { sandbox.out = message; };
  const context = vm.createContext(sandbox);
  sandbox.importScripts = () => vm.runInContext(fs.readFileSync(new URL('../vendor/audio/lamejs.iife.js', import.meta.url), 'utf8'), context);
  vm.runInContext(fs.readFileSync(new URL('../mp3-encoder.worker.js', import.meta.url), 'utf8'), context);
  sandbox.onmessage({ data: { type: 'start', bitrate, channels: 2 } });
  const left = Float32Array.from({ length: 44100 }, (_, i) => Math.sin(2 * Math.PI * 440 * i / 44100) * 0.25);
  const right = Float32Array.from({ length: 44100 }, (_, i) => Math.sin(2 * Math.PI * 660 * i / 44100) * 0.25);
  sandbox.onmessage({ data: { type: 'pcm', channels: [left, right] } });
  sandbox.onmessage({ data: { type: 'finish' } });
  return sandbox.out;
}

function fakeAudio(duration) {
  const listeners = new Map();
  return {
    currentTime: 5, duration, paused: true, seeking: false, readyState: 4,
    src: 'blob:test-mp3', currentSrc: 'blob:test-mp3',
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
    emit(name) { for (const fn of listeners.get(name) || []) fn(); },
    async play() { this.paused = false; this.emit('playing'); },
    pause() { this.paused = true; this.emit('pause'); }
  };
}

function fakeWindow() {
  return {
    AudioContext: class {
      constructor() { this.state = 'running'; this.sampleRate = 44100; this.destination = {}; this.audioWorklet = { addModule: async () => {} }; }
      createMediaElementSource() { return { connect() {}, disconnect() {} }; }
      createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
      async resume() {}
    },
    AudioWorkletNode: class {
      constructor() { this.port = { messages: [], onmessage: null, postMessage: (message) => { this.port.messages.push(message); if (message.type === 'flush') queueMicrotask(() => this.port.onmessage?.({ data: { type: 'flushed' } })); } }; }
      connect() {}
      disconnect() {}
    },
    Worker: class {
      postMessage(message) { if (message.type === 'start') queueMicrotask(() => this.onmessage?.({ data: { type: 'started', bitrate: message.bitrate } })); if (message.type === 'finish') queueMicrotask(() => this.onmessage?.({ data: { type: 'done', blob: new Blob([Uint8Array.from([255, 251, 208, 0])], { type: 'audio/mpeg' }), bitrate: 256 } })); }
      terminate() {}
    },
    Blob, setTimeout, clearTimeout, setInterval, clearInterval
  };
}
